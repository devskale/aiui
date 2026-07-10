import { createAgentSession, AuthStorage, ModelRegistry, SessionManager } from '@earendil-works/pi-coding-agent'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const cwd = path.join(__dirname, '..')

let authStorage = null
let modelRegistry = null
let session = null
let unsubscribe = null
let eventBroadcaster = null

// Shared auth + registry (created once)
async function initShared() {
  if (!authStorage) {
    authStorage = AuthStorage.create()
    modelRegistry = ModelRegistry.create(authStorage)
  }
}

function disposeSession() {
  if (unsubscribe) { unsubscribe(); unsubscribe = null }
  if (session) {
    try { session.dispose?.() } catch {}
    session = null
  }
}

function wireBroadcaster() {
  if (session && eventBroadcaster && !unsubscribe) {
    unsubscribe = session.subscribe((event) => {
      eventBroadcaster(event.type, event)
    })
  }
}

// Resume the most recent session, or create new if none exists
export async function getOrCreateSession() {
  if (session) return session
  await initShared()
  const { session: s } = await createAgentSession({
    cwd,
    authStorage,
    modelRegistry,
    sessionManager: SessionManager.continueRecent(cwd),
  })
  session = s
  console.log('π agent session ready (resumed recent)')
  if (eventBroadcaster) eventBroadcaster('session_status', getSessionInfo())
  wireBroadcaster()
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
    sessionManager: SessionManager.create(cwd),
  })
  session = s
  console.log('π agent new session created')
  if (eventBroadcaster) {
    eventBroadcaster('session_status', getSessionInfo())
    wireBroadcaster()
  }
  return session
}

export function setEventBroadcaster(fn) {
  eventBroadcaster = fn
  wireBroadcaster()
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

export function getSessionInfo() {
  return {
    alive: session !== null,
    streaming: session?.isStreaming ?? false,
    model: session?.model ? `${session.model.provider}@${session.model.id}` : null,
    thinkingLevel: session?.thinkingLevel ?? null,
    isCompacting: session?.isCompacting ?? false,
    autoCompactionEnabled: session?.autoCompactionEnabled ?? true,
    sessionId: session?.sessionId ?? null,
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
    const sessions = await SessionManager.list(cwd)
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
    sessionManager: SessionManager.open(sessionPath),
  })
  session = s
  console.log('π agent session switched:', sessionPath)
  if (eventBroadcaster) {
    eventBroadcaster('session_status', getSessionInfo())
    wireBroadcaster()
  }
  return session
}

// ── Session history (for replay on page load) ──

function extractText(content) {
  if (!content) return ''
  if (typeof content === 'string') return content
  return content.filter(c => c.type === 'text').map(c => c.text).join('\n')
}

function extractThinking(content) {
  if (!content || typeof content === 'string') return ''
  return content.filter(c => c.type === 'thinking').map(c => c.thinking).join('\n')
}

export function getSessionHistory() {
  if (!session?.messages) return []
  const entries = []
  for (const msg of session.messages) {
    if (msg.role === 'user') {
      const text = extractText(msg.content)
      if (text) entries.push({ role: 'user', text })
    } else if (msg.role === 'assistant') {
      const toolCalls = (msg.content || [])
        .filter(c => c.type === 'toolCall')
        .map(c => ({ name: c.name, args: c.arguments, status: 'done', output: '' }))
      const entry = {
        role: 'assistant',
        text: extractText(msg.content),
        thinkingText: extractThinking(msg.content),
        toolCalls,
      }
      if (entry.text || entry.toolCalls.length) entries.push(entry)
    } else if (msg.role === 'toolResult') {
      // Attach output to the preceding assistant's matching tool call
      const last = entries[entries.length - 1]
      if (last?.role === 'assistant') {
        const tc = last.toolCalls.find(t => t.name === msg.toolName)
        if (tc) {
          tc.output = extractText(msg.content)
          tc.status = msg.isError ? 'error' : 'done'
        }
      }
    }
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
