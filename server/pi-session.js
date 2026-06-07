import { createAgentSession, AuthStorage, ModelRegistry, SessionManager } from '@earendil-works/pi-coding-agent'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const sessionDir = path.join(__dirname, '..', 'session')

let session = null
let authStorage = null
let modelRegistry = null

export async function getOrCreateSession() {
  if (!session) {
    authStorage = AuthStorage.create()
    modelRegistry = ModelRegistry.create(authStorage)

    const { session: s } = await createAgentSession({
      cwd: sessionDir,
      sessionManager: SessionManager.inMemory(sessionDir),
      authStorage,
      modelRegistry,
    })
    session = s
    console.log('π agent session created (cwd:', sessionDir, ')')
  }
  return session
}

export async function prompt(text, attachments = []) {
  const s = await getOrCreateSession()
  const images = attachments
    .filter(a => a.type === 'image' && a.dataUrl)
    .map(a => {
      const match = a.dataUrl.match(/^data:([^;]+);base64,(.+)$/)
      return {
        type: 'image',
        source: { type: 'base64', mediaType: match?.[1] || 'image/png', data: match?.[2] || a.dataUrl },
      }
    })
  return s.prompt(text, { images })
}

export async function abort() {
  const s = await getOrCreateSession()
  return s.abort()
}

export async function setModel(modelId) {
  const s = await getOrCreateSession()
  // Find model in registry
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
  // Group by provider
  const grouped = {}
  for (const m of models) {
    const provider = m.provider || 'unknown'
    if (!grouped[provider]) grouped[provider] = []
    grouped[provider].push(m.id)
  }
  return grouped
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
