import { createAgentSession, ModelRuntime, SessionManager } from '@earendil-works/pi-coding-agent'
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

const ANON = '_local' // used when auth is off (req.user === null)

// Shared model runtime (created once) — owns auth + models + provider catalogs.
// Your API keys are global/shared; only the agent's working dir + sessions are
// per-user.
let modelRuntime = null
async function initShared() {
  if (!modelRuntime) modelRuntime = await ModelRuntime.create()
}

// ── Per-user context ──
// Each user gets their own scoped workspace: workspace/<user>/ is the agent's
// cwd, workspace/<user>/sessions/ holds their sessions, and the sandbox is
// confined to that dir. One live session per user.
const contexts = new Map() // user → { cwd, sessionDir, customTools, session, startedAt }

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
    fs.mkdirSync(sessionDir, { recursive: true })
    ctx = { cwd, sessionDir, customTools: Sandbox.createTools(cwd), session: null, startedAt: null }
    contexts.set(u, ctx)
  }
  return ctx
}

function dispose(user) {
  const ctx = contexts.get(normUser(user))
  if (!ctx) return
  if (ctx.session) { try { ctx.session.dispose?.() } catch {} ctx.session = null }
  ctx.startedAt = null
  // The session→bus subscription is owned by getBus(user).bind, which swaps it
  // idempotently on the next create/switch. No unbind needed here.
}

/** The agent's working directory for this user (for @-mention file listing). */
export function workspaceCwd(user) {
  return ctxFor(user).cwd
}

// Always start FRESH: a new pi session (not continueRecent). Stored sessions
// remain listable/switchable via the sidebar.
export async function getOrCreateSession(user) {
  const ctx = ctxFor(user)
  if (ctx.session) return ctx.session
  await initShared()
  const { session: s } = await createAgentSession({
    cwd: ctx.cwd,
    modelRuntime,
    customTools: ctx.customTools,
    sessionManager: SessionManager.create(ctx.cwd, ctx.sessionDir),
  })
  ctx.session = s
  ctx.startedAt = Date.now()
  getBus(user).bind(s)
  getBus(user).push('session_status', getSessionInfo(user))
  return ctx.session
}

// Start a brand-new session (for "New Chat")
export async function newSession(user) {
  dispose(user)
  await initShared()
  const ctx = ctxFor(user)
  const { session: s } = await createAgentSession({
    cwd: ctx.cwd,
    modelRuntime,
    customTools: ctx.customTools,
    sessionManager: SessionManager.create(ctx.cwd, ctx.sessionDir),
  })
  ctx.session = s
  ctx.startedAt = Date.now()
  getBus(user).bind(s)
  getBus(user).push('session_status', getSessionInfo(user))
  return ctx.session
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
  const available = modelRuntime.getModels()
  const model = available.find(m => m.id === modelId || `${m.provider}@${m.id}` === modelId)
  if (model) {
    await s.setModel(model)
  } else {
    throw new Error(`Model not found: ${modelId}`)
  }
}

// Global model catalog (your shared keys) — no user scope needed.
export async function getAvailableModels() {
  await initShared()
  const models = modelRuntime.getModels()
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
  const session = ctx.session
  return {
    alive: session !== null,
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
  const session = ctxFor(user).session
  if (!session) return null
  try { return session.getSessionStats() } catch { return null }
}

export function setThinkingLevel(user, level) {
  const session = ctxFor(user).session
  if (!session) throw new Error('no session')
  session.setThinkingLevel(level)
}

export function getThinkingInfo(user) {
  const session = ctxFor(user).session
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
  const session = ctxFor(user).session
  if (session) session.abortCompaction()
}

export function setAutoCompaction(user, enabled) {
  const session = ctxFor(user).session
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
        created: s.created,
        modified: s.modified,
        messageCount: s.messageCount,
        firstMessage: (s.firstMessage || '').slice(0, 100),
      }))
  } catch {
    return []
  }
}

export async function switchToSession(user, sessionPath) {
  dispose(user)
  await initShared()
  const ctx = ctxFor(user)
  const { session: s } = await createAgentSession({
    cwd: ctx.cwd,
    modelRuntime,
    customTools: ctx.customTools,
    sessionManager: SessionManager.open(sessionPath, ctx.sessionDir, ctx.cwd),
  })
  ctx.session = s
  ctx.startedAt = Date.now()
  getBus(user).bind(s)
  getBus(user).push('session_status', getSessionInfo(user))
  return ctx.session
}

// ── Session history (for replay) ──
export function getSessionHistory(user) {
  const session = ctxFor(user).session
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
  const s = await getOrCreateSession(user)
  const loader = s.resourceLoader
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
