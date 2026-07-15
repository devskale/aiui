import { createAgentSession, AuthStorage, ModelRegistry, SessionManager, createBashTool, createReadTool, createWriteTool, createEditTool } from '@earendil-works/pi-coding-agent'
import path from 'node:path'
import fs from 'node:fs'
import { readFile as fsReadFile, writeFile as fsWriteFile, mkdir as fsMkdir, access as fsAccess } from 'node:fs/promises'
import { constants as fsConstants } from 'node:fs'
import { execSync } from 'node:child_process'
import os from 'node:os'
import { fileURLToPath } from 'node:url'

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

// ══ Pseudo-sandbox (ON by default on macOS) ══
// The agent is confined to its workspace data directory on every dimension we
// can enforce without a VM:
//   • bash        → macOS seatbelt (sandbox-exec): file METADATA may be stat'd,
//                   but the user's HOME content (Documents, Desktop, Downloads,
//                   Pictures, .ssh, other projects, browser data) is unreadable
//                   AND unwritable. Only workspace + temp + dev toolchain/caches
//                   are accessible. Network stays open (LLM API, installs).
//   • read/write/edit → fs operations are path-validated to the workspace.
// ON by default; set AIUI_SANDBOX=0 to disable. Auto-degrades on Linux/prod
// (no sandbox-exec) → unsandboxed with a warning. NOT a hard boundary (symlinks,
// and grep/find/ls if manually enabled, can still escape) — for real isolation
// use Docker/Gondolin/OpenShell. If a tool breaks, widen buildSandboxProfile()
// or set AIUI_SANDBOX=0.
const SANDBOX_AVAILABLE = fs.existsSync('/usr/bin/sandbox-exec')
const SANDBOX_ENABLED = process.env.AIUI_SANDBOX !== '0' && SANDBOX_AVAILABLE

function shellQuote(s) {
  return "'" + String(s).replace(/'/g, "'\\''") + "'"
}

function buildSandboxProfile() {
  const home = os.homedir()
  return `(version 1)
(allow default)
;; stat/traverse anywhere (no content revealed) so tools resolve paths
(allow file-read-metadata)
;; ── Confine HOME content; reopen only the data dir + dev toolchain/caches ──
(deny file-read* file-write* (subpath "${home}"))
(allow file-read* file-write*
  (subpath "${cwd}")                              ; the DATA directory
  (subpath "${home}/.pi/agent")                   ; auth/models/rg
  (subpath "${home}/.local")                      ; fnm / pnpm store
  (subpath "${home}/Library/pnpm")                ; pnpm
  (subpath "${home}/Library/Caches")
  (subpath "${home}/.cache") (subpath "${home}/.npm"))
;; system temp
(allow file-read* file-write*
  (subpath "/tmp") (subpath "/private/tmp")
  (subpath "/var/folders") (subpath "/private/var/folders"))
`
}

let SANDBOX_PROFILE_PATH = null
if (SANDBOX_ENABLED) {
  SANDBOX_PROFILE_PATH = path.join(cwd, '.sandbox.sb')
  fs.writeFileSync(SANDBOX_PROFILE_PATH, buildSandboxProfile())
  // give the workspace its own git repo so git stays inside the sandbox
  if (!fs.existsSync(path.join(cwd, '.git'))) {
    try {
      execSync('git init -q', { cwd, env: { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null' } })
    } catch {}
  }
  console.log(`πui sandbox ON (macOS seatbelt) — agent confined to ${cwd}`)
} else {
  console.log(process.env.AIUI_SANDBOX === '0'
    ? 'πui sandbox OFF (disabled by AIUI_SANDBOX=0)'
    : 'πui sandbox OFF (sandbox-exec not found — unsandboxed; macOS required for confinement)')
}

function sandboxSpawnHook({ command, cwd: workdir, env }) {
  return {
    command: `sandbox-exec -f ${shellQuote(SANDBOX_PROFILE_PATH)} /bin/bash -c ${shellQuote(command)}`,
    cwd: workdir,
    env: {
      ...env,
      // keep git from reading the user's global config under HOME (denied)
      GIT_CONFIG_GLOBAL: '/dev/null',
      GIT_CONFIG_SYSTEM: '/dev/null',
    },
  }
}

// ── Confine read/write/edit to the workspace via path-validated operations ──
function assertInWorkspace(absolutePath) {
  const rel = path.relative(cwd, path.resolve(absolutePath))
  if (rel === '..' || rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new Error(`Sandbox: path outside workspace denied: ${absolutePath}`)
  }
}

const IMG_EXT = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp' }
async function detectImageMimeByExt(absolutePath) {
  return IMG_EXT[path.extname(absolutePath).toLowerCase().replace('.', '')] || null
}

const confinedReadOps = {
  readFile: async (p) => { assertInWorkspace(p); return fsReadFile(p) },
  access: async (p) => { assertInWorkspace(p); return fsAccess(p, fsConstants.R_OK) },
  detectImageMimeType: detectImageMimeByExt,
}
const confinedWriteOps = {
  writeFile: async (p, c) => { assertInWorkspace(p); return fsWriteFile(p, c, 'utf-8') },
  mkdir: async (d) => { assertInWorkspace(d); return fsMkdir(d, { recursive: true }) },
}
const confinedEditOps = {
  readFile: async (p) => { assertInWorkspace(p); return fsReadFile(p) },
  writeFile: async (p, c) => { assertInWorkspace(p); return fsWriteFile(p, c, 'utf-8') },
  access: async (p) => { assertInWorkspace(p); return fsAccess(p, fsConstants.R_OK | fsConstants.W_OK) },
}

// Override the built-in file tools with sandboxed variants when enabled.
const customTools = SANDBOX_ENABLED ? [
  createBashTool(cwd, { spawnHook: sandboxSpawnHook }),
  createReadTool(cwd, { operations: confinedReadOps }),
  createWriteTool(cwd, { operations: confinedWriteOps }),
  createEditTool(cwd, { operations: confinedEditOps }),
] : undefined

let authStorage = null
let modelRegistry = null
let session = null
let sessionStartedAt = null  // epoch ms when the current session was created (for uptime)
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
  sessionStartedAt = null
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
    customTools,
    sessionManager: SessionManager.continueRecent(cwd, SESSION_DIR),
  })
  session = s
  sessionStartedAt = Date.now()
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
    customTools,
    sessionManager: SessionManager.create(cwd, SESSION_DIR),
  })
  session = s
  sessionStartedAt = Date.now()
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
