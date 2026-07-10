import { createAgentSession, AuthStorage, ModelRegistry, SessionManager } from '@earendil-works/pi-coding-agent'
import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const sessionDir = path.join(__dirname, '..', 'session')

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

// Create a fresh session, destroying the old one
async function resetSession() {
  if (unsubscribe) { unsubscribe(); unsubscribe = null }
  if (session) {
    try { session.dispose?.() } catch {}
    session = null
  }
  // Wipe session files so no bad state persists
  fs.rmSync(sessionDir, { recursive: true, force: true })
  fs.mkdirSync(sessionDir, { recursive: true })
}

export async function getOrCreateSession() {
  if (session) return session
  await initShared()
  await resetSession()

  const { session: s } = await createAgentSession({
    cwd: path.join(__dirname, '..'),
    authStorage,
    modelRegistry,
  })
  session = s
  console.log('π agent session created')
  // Notify SSE clients of new session
  if (eventBroadcaster) eventBroadcaster('session_status', getSessionInfo())

  // Wire broadcaster if already set
  if (eventBroadcaster && !unsubscribe) {
    unsubscribe = session.subscribe((event) => {
      eventBroadcaster(event.type, event)
    })
  }
  return session
}

export function setEventBroadcaster(fn) {
  eventBroadcaster = fn
  // Wire if session already exists
  if (session && !unsubscribe) {
    unsubscribe = session.subscribe((event) => {
      eventBroadcaster(event.type, event)
    })
  }
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
  }
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
