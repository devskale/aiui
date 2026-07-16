import { createAgentSession, AuthStorage, ModelRegistry, SessionManager } from '@earendil-works/pi-coding-agent'
import path from 'node:path'
import fs from 'node:fs'
import os from 'node:os'
import { fileURLToPath } from 'node:url'
import { bus } from './event-bus.js'
import * as Entry from '../shared/entry.js'
import * as Sandbox from './sandbox.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = path.join(__dirname, '..')

// ══ Scoped workspace ══
// The agent's entire world. cwd + local session storage live here — fully
// self-contained and gitignored. The agent cannot see or touch aiui's own
// source by default (that is the "scope"), and sessions are stored locally
// (workspace/sessions) instead of globally (~/.pi/agent/sessions). Settings +
// skills are still inherited from aiui/.pi via the SDK's walk-up discovery.
const cwd = path.join(PROJECT_ROOT, 'workspace')
const SESSION_DIR = path.join(cwd, 'sessions')
fs.mkdirSync(SESSION_DIR, { recursive: true })

// Confinement lives in ./sandbox.js. One call returns the overridden tools
// (or undefined when off — the SDK then uses its own built-in tools, which is
// the better "off" state; no no-op passthrough wrapper). See server/sandbox.js.
const customTools = Sandbox.createTools(cwd)

let authStorage = null
let modelRegistry = null
let session = null
let sessionStartedAt = null  // epoch ms when the current session was created (for uptime)

// Shared auth + registry (created once)
async function initShared() {
  if (!authStorage) {
    authStorage = AuthStorage.create()
    modelRegistry = ModelRegistry.create(authStorage)
  }
}

function disposeSession() {
  if (session) {
    try { session.dispose?.() } catch {}
    session = null
  }
  sessionStartedAt = null
  // Note: the session→bus subscription is owned by `bus.bind`, which swaps it
  // idempotently on the next create/switch. No unbind needed here — the disposed
  // session won't emit, and the upcoming bind unsubscribes it.
}

// Resume the most recent session, or create new if none exists
export async function getOrCreateSession() {
  if (session) return session
  await initShared()
  const { session: s } = await createAgentSession({
    cwd,
    authStorage,
    modelRegistry,
    customTools,
    sessionManager: SessionManager.continueRecent(cwd, SESSION_DIR),
  })
  session = s
  sessionStartedAt = Date.now()
  bus.bind(session)
  console.log('π agent session ready (resumed recent)')
  bus.push('session_status', getSessionInfo())
  return session
}

// Start a brand-new session (for "New Chat")
export async function newSession() {
  disposeSession()
  await initShared()
  const { session: s } = await createAgentSession({
    cwd,
    authStorage,
    modelRegistry,
    customTools,
    sessionManager: SessionManager.create(cwd, SESSION_DIR),
  })
  session = s
  sessionStartedAt = Date.now()
  bus.bind(session)
  console.log('π agent new session created')
  bus.push('session_status', getSessionInfo())
  return session
}



export async function prompt(text, attachments = []) {
  const s = await getOrCreateSession()
  const promptText = text?.trim() || 'Describe this image.'
  const images = attachments
    .filter(a => a.isImage && a.dataUrl)
    .map(a => {
      const match = a.dataUrl.match(/^data:([^;]+);base64,(.+)$/)
      return {
        type: 'image',
        mimeType: match?.[1] || 'image/png',
        data: match?.[2],
      }
    })
  // SDK 0.80.x requires streamingBehavior when prompting while a turn is in flight
  const options = { images }
  if (s.isStreaming) options.streamingBehavior = 'steer'
  return s.prompt(promptText, options)
}

export async function abort() {
  const s = await getOrCreateSession()
  return s.abort()
}

export async function setModel(modelId) {
  const s = await getOrCreateSession()
  const available = await modelRegistry.getAvailable()
  const model = available.find(m => m.id === modelId || `${m.provider}@${m.id}` === modelId)
  if (model) {
    await s.setModel(model)
  } else {
    throw new Error(`Model not found: ${modelId}`)
  }
}

export async function getAvailableModels() {
  await getOrCreateSession()
  const models = await modelRegistry.getAvailable()
  const grouped = {}
  for (const m of models) {
    const provider = m.provider || 'unknown'
    if (!grouped[provider]) grouped[provider] = []
    grouped[provider].push(m.id)
  }
  return grouped
}

// Abbreviate an absolute path for compact UI display: $HOME → ~
function shortenForDisplay(p) {
  if (!p) return null
  const home = os.homedir()
  if (p === home) return '~'
  if (home && p.startsWith(home + '/')) return '~' + p.slice(home.length)
  return p
}

export function getSessionInfo() {
  return {
    alive: session !== null,
    streaming: session?.isStreaming ?? false,
    model: session?.model ? `${session.model.provider}@${session.model.id}` : null,
    thinkingLevel: session?.thinkingLevel ?? null,
    isCompacting: session?.isCompacting ?? false,
    autoCompactionEnabled: session?.autoCompactionEnabled ?? true,
    sessionId: session?.sessionId ?? null,
    cwd,                // agent working directory (the scoped workspace)
    cwdShort: shortenForDisplay(cwd),  // ~-abbreviated form for the UI
    startedAt: sessionStartedAt,  // epoch ms when this session was created
  }
}

export function getSessionStats() {
  if (!session) return null
  try { return session.getSessionStats() } catch { return null }
}

export function setThinkingLevel(level) {
  if (!session) throw new Error('no session')
  session.setThinkingLevel(level)
}

export function getThinkingInfo() {
  if (!session) return null
  return {
    current: session.thinkingLevel,
    available: session.getAvailableThinkingLevels(),
    supportsThinking: session.supportsThinking(),
  }
}

export async function compactSession() {
  const s = await getOrCreateSession()
  return s.compact()
}

export function abortCompaction() {
  if (!session) return
  session.abortCompaction()
}

export function setAutoCompaction(enabled) {
  if (!session) return
  session.setAutoCompactionEnabled(enabled)
}

// ── Session list + switching ──

export async function listSessions() {
  await initShared()
  try {
    const sessions = await SessionManager.list(cwd, SESSION_DIR)
    // Sort by modified desc, strip heavy fields
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

export async function switchToSession(sessionPath) {
  disposeSession()
  await initShared()
  const { session: s } = await createAgentSession({
    cwd,
    authStorage,
    modelRegistry,
    customTools,
    sessionManager: SessionManager.open(sessionPath, SESSION_DIR, cwd),
  })
  session = s
  sessionStartedAt = Date.now()
  bus.bind(session)
  console.log('π agent session switched:', sessionPath)
  bus.push('session_status', getSessionInfo())
  return session
}

// ── Session history (for replay on page load) ──
// The Entry shape is owned by shared/entry.js. This loop just walks stored SDK
// messages and routes each through the module: fromMessage for user/assistant
// rows, attachResult for toolResult messages (which attach to the preceding
// assistant entry). No shape construction lives here.
export function getSessionHistory() {
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

export async function getCommands() {
  const s = await getOrCreateSession()
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
