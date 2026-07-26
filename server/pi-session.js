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
import * as Entry from '../shared/entry.js'
import * as Sandbox from './sandbox.js'

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
// request. Keyed by normalized username.
const byokRuntimes = new Map() // user → ModelRuntime

// Slim, web-chat-shaped system message (ADR-0003). Replaces pi's CLI-oriented
// default persona. Skills, project context files, and cwd are appended
// automatically by the SDK (this string becomes buildSystemPrompt's
// customPrompt, which preserves them).
const SLIM_SYSTEM_PROMPT = `You are a helpful coding and general-purpose assistant in \u03c0ui, a web-based chat interface. You operate inside the user's workspace and can read files, run commands, edit code, and write new files.

Tools available: read, bash, edit, write \u2014 plus any extension or skill tools the user has enabled.

Guidelines:
- Be concise and direct in your responses.
- Show file paths clearly when working with files.
- Use bash for exploration (ls, rg, find) and shell commands.
- Prefer precise edits over full rewrites.`

// Behavioral defaults seeded into each new User's agentDir/settings.json on
// first creation (ADR-0001). Entitlement is NOT seeded — default-deny.
const DEFAULT_SETTINGS_TEMPLATE = path.join(__dirname, 'default-user-settings.json')
const DEFAULT_USER_SETTINGS = (() => {
  const tpl = JSON.parse(fs.readFileSync(DEFAULT_SETTINGS_TEMPLATE, 'utf8'))
  delete tpl._comment
  return JSON.stringify(tpl, null, 2)
})()

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
const contexts = new Map() // user → { cwd, sessionDir, agentDir, customTools, runtime, startedAt }

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
    }
    ctx = { cwd, sessionDir, agentDir, customTools: Sandbox.createTools(cwd), runtime: null, startedAt: null }
    contexts.set(u, ctx)
  }
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
  let rt = byokRuntimes.get(u)
  if (!rt) {
    const byokModels = path.join(ctx.agentDir, 'models.json')
    rt = await ModelRuntime.create({
      authPath: byokAuth,
      modelsPath: fs.existsSync(byokModels) ? byokModels : undefined,
    })
    byokRuntimes.set(u, rt)
  }
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

// Lazily create a user's AgentSessionRuntime (once per login) and wire the SSE
// bus to rebind on every session replacement (new/switch/fork/import).
export async function getOrCreateSession(user) {
  const u = normUser(user)
  const ctx = ctxFor(u)
  if (ctx.runtime) return ctx.runtime.session

  // The runtime factory closes over the USER: each time the runtime replaces
  // the session it rebuilds cwd-bound services with this user's ModelRuntime,
  // slim system message (ADR-0003), and sandbox tools.
  const createRuntime = async ({ cwd, agentDir, sessionManager }) => {
    const services = await createAgentSessionServices({
      cwd,
      agentDir,
      modelRuntime: await modelRuntimeFor(u),
      resourceLoaderOptions: { systemPrompt: SLIM_SYSTEM_PROMPT },
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
  getBus(u).push('session_status', getSessionInfo(u))
  return ctx.runtime.session
}

// Start a brand-new session (for "New Chat"). SDK-owned; bus rebinds via
// setRebindSession.
export async function newSession(user) {
  const ctx = ctxFor(user)
  await getOrCreateSession(user)
  await ctx.runtime.newSession()
  return ctx.runtime.session
}

/** Drop the user's in-memory session (used on logout → next login is fresh). */
export function disposeSession(user) {
  dispose(user)
}

export async function prompt(user, text, attachments = []) {
  const s = await getOrCreateSession(user)
  const promptText = text?.trim() || 'Describe this image.'
  const images = attachments
    .filter(a => a.isImage && a.dataUrl)
    .map(a => {
      const match = a.dataUrl.match(/^data:([^;]+);base64,(.+)$/)
      return { type: 'image', mimeType: match?.[1] || 'image/png', data: match?.[2] }
    })
  const options = { images }
  if (s.isStreaming) options.streamingBehavior = 'steer' // prompting mid-turn
  return s.prompt(promptText, options)
}

export async function abort(user) {
  const s = await getOrCreateSession(user)
  return s.abort()
}

export async function setModel(user, modelId) {
  const s = await getOrCreateSession(user)
  const rt = await modelRuntimeFor(user)
  const available = rt.getModels()
  const model = available.find(m => m.id === modelId || `${m.provider}@${m.id}` === modelId)
  if (model) {
    await s.setModel(model)
  } else {
    throw new Error(`Model not found: ${modelId}`)
  }
}

// Model catalog — per-User under hybrid keys (ADR-0002): a BYOK User sees only
// their own models; a shared User sees the global catalog.
export async function getAvailableModels(user) {
  const rt = await modelRuntimeFor(user)
  const models = rt.getModels()
  const grouped = {}
  const imageModels = []
  for (const m of models) {
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
// regardless of what's recorded in the session file header.
export async function switchToSession(user, sessionPath) {
  const ctx = ctxFor(user)
  await getOrCreateSession(user)
  await ctx.runtime.switchSession(sessionPath, { cwdOverride: ctx.cwd })
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
