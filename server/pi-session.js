import {
  createAgentSessionRuntime,
  createAgentSessionServices,
  createAgentSessionFromServices,
  ModelRuntime,
  SessionManager,
} from '@earendil-works/pi-coding-agent'
import path from 'node:path'
import fs from 'node:fs'
import crypto from 'node:crypto'
import os from 'node:os'
import { fileURLToPath } from 'node:url'
import { getBus } from './event-bus.js'
import { resolveWorkspacePath } from './workspace-files.js'
import * as Entry from '../shared/entry.js'
import * as Sandbox from './sandbox.js'
import { sharedRetrySettings } from './shared-settings.js'
import { getAgent, requireAgent } from './agents.js'
import { modelFilterFor } from './auth.js'
import { filterModels, modelAllowed } from './model-filter.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = path.join(__dirname, '..')
const WORKSPACE_ROOT = path.join(PROJECT_ROOT, 'workspace')
const AGENT_ROOT = path.join(WORKSPACE_ROOT, '.agent') // per-user agentDirs (ADR-0001)

const ANON = '_local' // used when auth is off (req.user === null)

// Shared model runtime (created once) — owns auth + models + provider catalogs
// for non-BYOK Users. BYOK Users (auth.json in their agentDir) get a per-User
// runtime instead (ADR-0002).
let modelRuntime = null
async function initShared() {
  if (!modelRuntime) modelRuntime = await ModelRuntime.create()
}

// Per-user BYOK runtimes, cached so we don't re-read/parse auth/models per
// request. Keyed by normalized username; entries remember the auth.json mtime
// so an edited key file takes effect without waiting for a logout.
const byokRuntimes = new Map() // user → { rt: ModelRuntime, mtimeMs }

// Slim, web-chat-shaped system message (ADR-0003) — lives in agents.js now,
// alongside the Agent catalog that builds on it (ADR-0004).

// Behavioral defaults seeded into each new User's agentDir/settings.json on
// first creation (ADR-0001). Entitlement is NOT seeded — default-deny.
// The shared `retry` block (from the deployment-wide settings source, see
// shared-settings.js) is merged in so web agents retry like the CLI.
const DEFAULT_SETTINGS_TEMPLATE = path.join(__dirname, 'default-user-settings.json')
const DEFAULT_USER_SETTINGS = (() => {
  const tpl = JSON.parse(fs.readFileSync(DEFAULT_SETTINGS_TEMPLATE, 'utf8'))
  delete tpl._comment
  if (sharedRetrySettings()) tpl.retry = sharedRetrySettings()
  return JSON.stringify(tpl, null, 2)
})()

// Inject the shared retry block into a user's agentDir/settings.json if it's
// missing (existing users seeded before retry was sourced). Returns true if
// the file was rewritten.
function ensureSharedRetry(settingsPath) {
  const retry = sharedRetrySettings()
  if (!retry) return false
  let settings
  try {
    settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'))
  } catch {
    return false
  }
  if (settings.retry) return false // already set (admin-curated wins)
  settings.retry = retry
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2))
  return true
}

// ── Per-user context ──
// Each user gets their own scoped workspace: workspace/<user>/ is the agent's
// cwd, workspace/<user>/sessions/ holds their sessions, and the sandbox is
// confined to that dir. One live AgentSessionRuntime per user.
//
// Session lifecycle (new/switch/fork/import) is owned by the SDK's
// AgentSessionRuntime; aiui owns only what's truly aiui's: auth → which user?,
// cwd/sandbox, BYOK runtime, and entitlement. The runtime factory below injects
// those per-user inputs; runtime.setRebindSession re-wires the SSE bus whenever
// the underlying session is replaced.
const contexts = new Map() // user → { cwd, sessionDir, agentDir, customTools, runtime, startedAt, lastUsed }

// Idle eviction — drop contexts (runtime + session in memory per user) whose
// user hasn't made a request for AIUI_IDLE_EVICT_HOURS (default 24) and isn't
// mid-stream. Exported pure for tests. Sessions persist in the user's
// sessionDir, so eviction loses nothing but warmth: the next request lazily
// rebuilds the context and resumes the stored session.
export function evictIdleContexts(map, idleMs, now = Date.now()) {
  const evicted = []
  for (const [u, ctx] of map) {
    const last = ctx.lastUsed || ctx.startedAt || 0
    if (now - last < idleMs) continue
    if (ctx.runtime?.session?.isStreaming) continue
    if (ctx.runtime) { try { ctx.runtime.dispose?.() } catch {} }
    map.delete(u)
    evicted.push(u)
  }
  return evicted
}

const IDLE_EVICT_MS =
  (parseFloat(process.env.AIUI_IDLE_EVICT_HOURS) > 0 ? parseFloat(process.env.AIUI_IDLE_EVICT_HOURS) : 24) * 3600 * 1000

// Usernames are arbitrary strings (typically emails). The Map key is the raw
// username; the workspace DIR is derived below (emails aren't safe dir names).
function normUser(user) {
  const u = user || ANON
  if (typeof u !== 'string' || u.includes('/') || u.includes('\0')) throw new Error('invalid user')
  return u
}

// Filesystem-safe, collision-free dir name from a username: readable slug +
// 8 hex of its sha256 (so hans@skale.dev and hans@other.com never share a dir).
function workspaceSlug(user) {
  const u = normUser(user)
  if (u === ANON) return ANON
  const slug = u.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'user'
  const hash = crypto.createHash('sha256').update(u).digest('hex').slice(0, 8)
  return `${slug}-${hash}`
}

function ctxFor(user) {
  evictIdleContexts(contexts, IDLE_EVICT_MS)
  const u = normUser(user)
  let ctx = contexts.get(u)
  if (!ctx) {
    const cwd = path.join(WORKSPACE_ROOT, workspaceSlug(u))
    const sessionDir = path.join(cwd, 'sessions')
    const agentDir = path.join(AGENT_ROOT, workspaceSlug(u)) // OUTSIDE cwd (ADR-0001)
    fs.mkdirSync(sessionDir, { recursive: true })
    fs.mkdirSync(agentDir, { recursive: true })
    // Seed behavioral defaults on first creation (ADR-0001). Entitlement stays
    // empty (default-deny); the admin curates it per-User.
    const settingsPath = path.join(agentDir, 'settings.json')
    if (!fs.existsSync(settingsPath)) {
      fs.writeFileSync(settingsPath, DEFAULT_USER_SETTINGS)
    } else {
      // Existing user: backfill the shared retry block so the change applies
      // to already-seeded agentDirs (retry is behavioral, not entitlement).
      ensureSharedRetry(settingsPath)
    }
    ctx = { cwd, sessionDir, agentDir, customTools: Sandbox.createTools(cwd), runtime: null, startedAt: null, agent: 'default' }
    contexts.set(u, ctx)
  }
  ctx.lastUsed = Date.now()
  return ctx
}

// Resolve the ModelRuntime for a User: shared (non-BYOK) or per-User (BYOK,
// when auth.json exists in their agentDir). Cached per User (ADR-0002).
async function modelRuntimeFor(user) {
  const u = normUser(user)
  const ctx = ctxFor(u)
  const byokAuth = path.join(ctx.agentDir, 'auth.json')
  if (!fs.existsSync(byokAuth)) {
    await initShared()
    return modelRuntime
  }
  const mtimeMs = fs.statSync(byokAuth).mtimeMs
  const cached = byokRuntimes.get(u)
  if (cached && cached.mtimeMs === mtimeMs) return cached.rt
  const byokModels = path.join(ctx.agentDir, 'models.json')
  const rt = await ModelRuntime.create({
    authPath: byokAuth,
    modelsPath: fs.existsSync(byokModels) ? byokModels : undefined,
  })
  byokRuntimes.set(u, { rt, mtimeMs })
  return rt
}

function dispose(user) {
  const ctx = contexts.get(normUser(user))
  if (!ctx) return
  if (ctx.runtime) { try { ctx.runtime.dispose?.() } catch {} ctx.runtime = null }
  ctx.startedAt = null
  // The session→bus subscription is owned by getBus(user).bind, which swaps it
  // idempotently on the next create/switch. No unbind needed here.
}

/** The agent's working directory for this user (for @-mention file listing). */
export function workspaceCwd(user) {
  return ctxFor(user).cwd
}

// ── Session → Agent sidecar (ADR-0004) ──
// The system prompt is bound when the session is built, so each stored
// session must remember which Agent it belongs to. A small JSON map in the
// user's sessionDir (never inside the SDK-owned .jsonl files):
// { "<sessionId>": "<agentId>" }. Unknown ids fall back to the default.
const AGENTS_MAP_FILE = '.aiui-agents.json'

function agentsMapPath(ctx) {
  return path.join(ctx.sessionDir, AGENTS_MAP_FILE)
}

function readAgentsMap(ctx) {
  try {
    return JSON.parse(fs.readFileSync(agentsMapPath(ctx), 'utf8')) || {}
  } catch {
    return {}
  }
}

function rememberAgent(ctx, sessionId, agentId) {
  if (!sessionId) return
  try {
    const map = readAgentsMap(ctx)
    if (map[sessionId] === agentId) return
    map[sessionId] = agentId
    fs.writeFileSync(agentsMapPath(ctx), JSON.stringify(map, null, 2))
  } catch { /* sidecar is best-effort; worst case a session falls back to default */ }
}

// The session id lives in the .jsonl header line, not the filename
// (filenames are <timestamp>_<id>.jsonl) — read it from the first entry.
function sessionIdFromPath(filePath) {
  try {
    const fd = fs.openSync(filePath, 'r')
    try {
      const buf = Buffer.alloc(4096)
      const n = fs.readSync(fd, buf, 0, buf.length, 0)
      const line = buf.toString('utf8', 0, n).split('\n')[0]
      const header = JSON.parse(line)
      return header?.type === 'session' && typeof header.id === 'string' ? header.id : null
    } finally {
      fs.closeSync(fd)
    }
  } catch {
    return null
  }
}

// Apply an Agent's optional model pin to a freshly built session. Validated
// against the user's runtime catalog; a pin missing from the catalog (e.g.
// BYOK user without that model) is skipped, not fatal.
// Resolve a "provider@id"-or-bare-id ref against the user's catalog + filter
// and set it on the session. Returns the model when applied.
async function setModelFromRef(u, session, ref) {
  if (!ref) return null
  try {
    const rt = await modelRuntimeFor(u)
    const model = rt.getModels().find(m => `${m.provider}@${m.id}` === ref || m.id === ref)
    if (model && modelAllowed(modelFilterFor(u), `${model.provider}@${model.id}`, model.id)) {
      await session.setModel(model)
      return model
    }
  } catch { /* keep the current model */ }
  return null
}

async function applyAgentModel(u, session, agent) {
  if (!agent?.model) return
  await setModelFromRef(u, session, agent.model)
}

// ── Last-used model (per User, aiui sidecar) ──
// The picker's choice lives only on the live session, so every new chat /
// login fell back to the seeded settings default. A tiny sidecar in the
// agentDir remembers the last USED model; new sessions start with it. Agent
// model pins (ADR-0004) still win — they are deployment-curated per persona.
const MODEL_PREF_FILE = '.aiui-model.json'

function modelPrefPath(ctx) {
  return path.join(ctx.agentDir, MODEL_PREF_FILE)
}

export function readModelPref(ctx) {
  try {
    const v = JSON.parse(fs.readFileSync(modelPrefPath(ctx), 'utf8'))
    return v && typeof v.provider === 'string' && typeof v.id === 'string' ? v : null
  } catch { return null }
}

export function rememberModel(ctx, model) {
  if (!model?.provider || !model?.id) return
  try {
    fs.writeFileSync(modelPrefPath(ctx), JSON.stringify({ provider: model.provider, id: model.id }, null, 2))
  } catch { /* best-effort, like the agents sidecar */ }
}

async function applyModelPref(u, session) {
  const ctx = ctxFor(u)
  if (getAgent(ctx.agent)?.model) return // agent pin wins
  const pref = readModelPref(ctx)
  const model = await setModelFromRef(u, session, pref ? `${pref.provider}@${pref.id}` : null)
  if (model) getBus(u).push('session_status', getSessionInfo(u)) // picker/status catch up
}

// Lazily create a user's AgentSessionRuntime (once per login) and wire the SSE
// bus to rebind on every session replacement (new/switch/fork/import).
export async function getOrCreateSession(user) {
  const u = normUser(user)
  const ctx = ctxFor(u)
  if (ctx.runtime) return ctx.runtime.session

  // The runtime factory closes over the USER: each time the runtime replaces
  // the session it rebuilds cwd-bound services with this user's ModelRuntime,
  // the active Agent's system message + carried resources (ADR-0004), and
  // sandbox tools. ctx.agent is read HERE (at build time), so callers change
  // agents by setting it before triggering a rebuild (new/switch/fork).
  const createRuntime = async ({ cwd, agentDir, sessionManager }) => {
    const agent = getAgent(ctx.agent)
    const services = await createAgentSessionServices({
      cwd,
      agentDir,
      modelRuntime: await modelRuntimeFor(u),
      resourceLoaderOptions: {
        systemPrompt: agent.systemPrompt,
        additionalSkillPaths: agent.skillPaths,
        additionalExtensionPaths: agent.extensionPaths,
      },
    })
    const result = await createAgentSessionFromServices({
      services,
      sessionManager,
      customTools: ctx.customTools,
    })
    return { ...result, services, diagnostics: services.diagnostics ?? [] }
  }

  const runtime = await createAgentSessionRuntime(createRuntime, {
    cwd: ctx.cwd,
    agentDir: ctx.agentDir,
    sessionManager: SessionManager.create(ctx.cwd, ctx.sessionDir),
  })

  // SDK contract: re-subscribe after a session replacement. We re-point the
  // SSE bus and re-announce status. Fires on newSession/switchSession/fork.
  runtime.setRebindSession(async (session) => {
    getBus(u).bind(session)
    ctx.startedAt = Date.now()
    getBus(u).push('session_status', getSessionInfo(u))
  })
  // Initial bind: createAgentSessionRuntime does not call rebind for the first
  // session, so wire the bus to the initial session ourselves.
  getBus(u).bind(runtime.session)

  ctx.runtime = runtime
  ctx.startedAt = Date.now()
  rememberAgent(ctx, runtime.session?.sessionId, ctx.agent)
  await applyModelPref(u, runtime.session) // start where the user left off
  getBus(u).push('session_status', getSessionInfo(u))
  return ctx.runtime.session
}

// Start a brand-new session (for "New Chat"). SDK-owned; bus rebinds via
// setRebindSession. An agentId switches the active Agent first (ADR-0004) —
// the persona is bound at session build, so a new session is how an Agent
// change takes effect.
export async function newSession(user, agentId) {
  const ctx = ctxFor(user)
  if (agentId !== undefined) ctx.agent = requireAgent(agentId).id
  await getOrCreateSession(user)
  await ctx.runtime.newSession()
  rememberAgent(ctx, ctx.runtime.session?.sessionId, ctx.agent)
  await applyAgentModel(user, ctx.runtime.session, getAgent(ctx.agent))
  await applyModelPref(user, ctx.runtime.session) // no-op when the agent pins a model
  return ctx.runtime.session
}

/** Drop the user's in-memory session (used on logout → next login is fresh). */
export function disposeSession(user) {
  dispose(user)
}

export async function prompt(user, text, attachments = []) {
  const s = await getOrCreateSession(user)
  const cwd = workspaceCwd(user)
  const images = attachments
    .filter(a => a.isImage && a.dataUrl)
    .map(a => {
      const match = a.dataUrl.match(/^data:([^;]+);base64,(.+)$/)
      return { type: 'image', mimeType: match?.[1] || 'image/png', data: match?.[2] }
    })
  // Non-image attachments now land inside the user's workspace (uploads/), so
  // point the agent at them. PDFs get their own hint — the read tool returns
  // binary garbage for them; read_pdf (baseline extension) extracts text.
  const files = attachments.filter(a => !a.isImage && a.relPath)
  let promptText = (text || '').trim()
  // @-mentioned images → attach as vision content. Without this the agent only
  // gets a path; its read tool won't inline a large image ("couldn't be
  // displayed inline due to size limits"), so it falls back to pixel-hacking
  // the picture with PIL instead of actually seeing it.
  promptText = attachMentionedImages(promptText, cwd, images)
  if (files.length) {
    const pdfs = files.filter(f => /\.pdf$/i.test(f.relPath))
    const others = files.filter(f => !/\.pdf$/i.test(f.relPath))
    const sections = []
    if (pdfs.length) {
      const list = pdfs.map(p => `- ${p.relPath}`).join('\n')
      sections.push(`[Attached PDF(s) — read with your read_pdf tool:]\n${list}`)
    }
    if (others.length) {
      const list = others.map(p => `- ${p.relPath}`).join('\n')
      sections.push(`[Attached file(s) — read with your read tool to see their contents:]\n${list}`)
    }
    promptText += `\n\n${sections.join('\n\n')}`
  }
  if (!promptText.trim()) promptText = images.length ? 'Describe this image.' : ''
  const options = { images }
  if (s.isStreaming) options.streamingBehavior = 'steer' // prompting mid-turn
  return s.prompt(promptText, options)
}

// Scan prompt text for @<path> tokens that point at workspace image files,
// read them, and push them onto `images` as vision content. Strips the token
// so the model sees the picture directly instead of a bare path. Images above
// MAX_MENTION_IMAGE_BYTES keep their token instead (embedding one would bloat
// the request for no gain — the model can't see it either way).
const IMG_MENTION_RE = /@([\w./-]+\.(?:png|jpe?g|gif|webp|bmp|svg))\b/gi
export const MAX_MENTION_IMAGE_BYTES = 10 * 1024 * 1024
export function attachMentionedImages(text, cwd, images) {
  if (!text) return text
  const found = []
  const stripped = text.replace(IMG_MENTION_RE, (token, rel) => {
    let abs
    try { abs = resolveWorkspacePath(cwd, rel) } catch { return token }
    try {
      if (fs.statSync(abs).size > MAX_MENTION_IMAGE_BYTES) return token
    } catch { return token }
    found.push({ rel, abs })
    return ''
  })
  for (const { rel, abs } of found) {
    try {
      const buf = fs.readFileSync(abs)
      const ext = path.extname(rel).slice(1).toLowerCase()
      const mime = ext === 'jpg' ? 'image/jpeg' : ext === 'svg' ? 'image/svg+xml' : `image/${ext}`
      images.push({ type: 'image', mimeType: mime, data: buf.toString('base64') })
    } catch {}
  }
  return stripped.replace(/\s{2,}/g, ' ').trim()
}

export async function abort(user) {
  const s = await getOrCreateSession(user)
  s.clearQueue() // drop queued steers/followUps so Stop fully halts (emits queue_update)
  return s.abort()
}

export async function setModel(user, modelId) {
  const u = normUser(user)
  const s = await getOrCreateSession(u)
  const rt = await modelRuntimeFor(u)
  const available = rt.getModels()
  const model = available.find(m => m.id === modelId || `${m.provider}@${m.id}` === modelId)
  if (!model) throw new Error(`Model not found: ${modelId}`)
  if (!modelAllowed(modelFilterFor(u), `${model.provider}@${model.id}`, model.id)) {
    throw new Error(`Model not allowed: ${modelId}`)
  }
  await s.setModel(model)
  rememberModel(ctxFor(u), model) // new sessions start here
}

// Model catalog — per-User under hybrid keys (ADR-0002): a BYOK User sees only
// their own models; a shared User sees the global catalog. Filtered to providers
// that actually resolve auth (getAuth — covers OAuth, API keys, env vars, AND
// local/no-auth providers like amd-local/localhost/uart that listCredentials
// misses), so every listed model is selectable (no silent "No API key" failures).
export async function getAvailableModels(user) {
  const u = normUser(user)
  const rt = await modelRuntimeFor(u)
  const models = rt.getModels()
  const providers = [...new Set(models.map(m => m.provider))]
  const authed = new Set()
  await Promise.all(providers.map(async p => {
    try { if (await rt.getAuth(p)) authed.add(p) } catch {}
  }))
  const usable = authed.size ? models.filter(m => authed.has(m.provider)) : models
  // Model filter (include / notInclude from the auth config) — the picker can
  // only offer what's left, and setModel refuses the rest.
  const visible = filterModels(usable, modelFilterFor(u))
  const grouped = {}
  const imageModels = []
  for (const m of visible) {
    const provider = m.provider || 'unknown'
    if (!grouped[provider]) grouped[provider] = []
    grouped[provider].push(m.id)
    if (Array.isArray(m.input) && m.input.includes('image')) {
      imageModels.push(`${provider}@${m.id}`)
    }
  }
  return { providers: grouped, imageModels }
}

// Abbreviate an absolute path for compact UI display: $HOME → ~
function shortenForDisplay(p) {
  if (!p) return null
  const home = os.homedir()
  if (p === home) return '~'
  if (home && p.startsWith(home + '/')) return '~' + p.slice(home.length)
  return p
}

export function getSessionInfo(user) {
  const ctx = ctxFor(user)
  const session = ctx.runtime?.session
  return {
    alive: session !== null && session !== undefined,
    streaming: session?.isStreaming ?? false,
    agent: ctx.agent,
    model: session?.model ? `${session.model.provider}@${session.model.id}` : null,
    thinkingLevel: session?.thinkingLevel ?? null,
    isCompacting: session?.isCompacting ?? false,
    autoCompactionEnabled: session?.autoCompactionEnabled ?? true,
    sessionId: session?.sessionId ?? null,
    cwd: ctx.cwd,
    cwdShort: shortenForDisplay(ctx.cwd),
    startedAt: ctx.startedAt,
  }
}

export function getSessionStats(user) {
  const session = ctxFor(user).runtime?.session
  if (!session) return null
  try { return session.getSessionStats() } catch { return null }
}

export function setThinkingLevel(user, level) {
  const session = ctxFor(user).runtime?.session
  if (!session) throw new Error('no session')
  session.setThinkingLevel(level)
}

export function getThinkingInfo(user) {
  const session = ctxFor(user).runtime?.session
  if (!session) return null
  return {
    current: session.thinkingLevel,
    available: session.getAvailableThinkingLevels(),
    supportsThinking: session.supportsThinking(),
  }
}

export async function compactSession(user) {
  const s = await getOrCreateSession(user)
  return s.compact()
}

export function abortCompaction(user) {
  const session = ctxFor(user).runtime?.session
  if (session) session.abortCompaction()
}

export function setAutoCompaction(user, enabled) {
  const session = ctxFor(user).runtime?.session
  if (session) session.setAutoCompactionEnabled(enabled)
}

// ── Session list + switching ──

export async function listSessions(user) {
  const ctx = ctxFor(user)
  await initShared()
  try {
    const sessions = await SessionManager.list(ctx.cwd, ctx.sessionDir)
    return sessions
      .sort((a, b) => new Date(b.modified) - new Date(a.modified))
      .map(s => ({
        path: s.path,
        id: s.id,
        name: s.name || '',
        parent: s.parentSessionPath || null,
        created: s.created,
        modified: s.modified,
        messageCount: s.messageCount,
        firstMessage: (s.firstMessage || '').slice(0, 100),
      }))
  } catch {
    return []
  }
}

// Resume a stored session. SDK-owned (runtime.switchSession); bus rebinds via
// setRebindSession. cwdOverride pins the session to this user's workspace
// regardless of what's recorded in the session file header. The session's
// Agent is restored from the sidecar BEFORE switching, so the factory builds
// with the right persona.
export async function switchToSession(user, sessionPath) {
  const ctx = ctxFor(user)
  const remembered = readAgentsMap(ctx)[sessionIdFromPath(sessionPath) || '']
  ctx.agent = remembered || 'default'
  await getOrCreateSession(user)
  await ctx.runtime.switchSession(sessionPath, { cwdOverride: ctx.cwd })
  rememberAgent(ctx, ctx.runtime.session?.sessionId, ctx.agent)
  return ctx.runtime.session
}

// ── Branching (fork) ──

// Fork points: the user messages this session can branch from. The SDK owns
// the fork-selector data; aiui just surfaces it to the UI.
export async function getForkTargets(user) {
  const s = await getOrCreateSession(user)
  try { return s.getUserMessagesForForking() } catch { return [] }
}

// Branch from a user message into a new session file. SDK-owned
// (runtime.fork): creates the child session, switches the runtime to it, and
// rebinds the SSE bus via setRebindSession. The route pushes session_history
// so the client renders the forked branch.
export async function forkSession(user, entryId) {
  const ctx = ctxFor(user)
  await getOrCreateSession(user)
  await ctx.runtime.fork(entryId)
  rememberAgent(ctx, ctx.runtime.session?.sessionId, ctx.agent) // the child inherits the parent's Agent
  return ctx.runtime.session
}

// ── Session history (for replay) ──
export function getSessionHistory(user) {
  const session = ctxFor(user).runtime?.session
  if (!session?.messages) return []
  const entries = []
  for (const msg of session.messages) {
    if (msg.role === 'toolResult') {
      const last = entries[entries.length - 1]
      if (last?.role === 'assistant') {
        entries[entries.length - 1] = Entry.attachResult(last, msg.toolName, Entry.textOf(msg.content), msg.isError)
      }
      continue
    }
    const entry = Entry.fromMessage(msg)
    if (entry) entries.push(entry)
  }
  return entries
}

export async function getCommands(user) {
  await getOrCreateSession(user)
  const loader = ctxFor(user).runtime.services.resourceLoader
  if (!loader) return { skills: [], prompts: [], extensions: [] }

  const skillsData = loader.getSkills()
  const promptsData = loader.getPrompts()
  const extensionsData = loader.getExtensions()

  const skills = (skillsData?.skills || []).map(s => ({ name: s.name, description: s.description }))
  const prompts = (promptsData?.prompts || []).map(p => ({ name: p.name, description: p.description }))
  const extensions = (extensionsData?.extensions || []).map(e => {
    const name = e.path?.split('/').pop()?.replace(/\.ts$|\.js$/, '') || 'extension'
    return { name, description: e.sourceInfo?.description || '' }
  })
  return { skills, prompts, extensions }
}
