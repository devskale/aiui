import express from 'express'
import multer from 'multer'
import { v4 as uuid } from 'uuid'
import path from 'node:path'
import fs from 'node:fs'
import { exec } from 'node:child_process'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'
import { bus } from './event-bus.js'
import * as Mime from './mime.js'
import { getOrCreateSession, prompt, abort, setModel, setThinkingLevel, getThinkingInfo, compactSession, abortCompaction, setAutoCompaction, listSessions, switchToSession, getAvailableModels, getCommands, getSessionInfo, getSessionStats, getSessionHistory, newSession } from './pi-session.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const cwd = path.join(__dirname, '..')
const uploadsDir = path.join(__dirname, '..', 'uploads')
fs.mkdirSync(uploadsDir, { recursive: true })

const execAsync = promisify(exec)

// ── Workspace file listing (for @-mention autocomplete) ──
// Git-aware: uses `git ls-files` so ignored dirs (node_modules, etc.) are excluded.
// Falls back to a bounded recursive walk if git is unavailable.
const IGNORED_DIRS = new Set(['node_modules', '.git', 'dist', 'uploads', 'session', 'test-results', 'coverage'])

async function gitListFiles() {
  const { stdout } = await execAsync('git ls-files', { cwd, maxBuffer: 32 * 1024 * 1024 })
  return stdout.split('\n').filter(Boolean)
}

function walkFiles(dir, base, out, depth) {
  if (depth > 6 || out.length >= 3000) return
  let entries
  try { entries = fs.readdirSync(dir, { withFileTypes: true }) } catch { return }
  for (const e of entries) {
    if (e.name.startsWith('.')) continue
    if (IGNORED_DIRS.has(e.name)) continue
    const full = path.join(dir, e.name)
    const rel = base ? path.join(base, e.name) : e.name
    if (e.isDirectory()) walkFiles(full, rel, out, depth + 1)
    else if (out.length < 3000) out.push(rel.split(path.sep).join('/'))
  }
}

async function listWorkspaceFiles(query) {
  let files
  try {
    files = await gitListFiles()
  } catch {
    files = []
    walkFiles(cwd, '', files, 0)
  }
  if (query) {
    const q = query.toLowerCase()
    files = files.filter(f => f.toLowerCase().includes(q))
  }
  return files.slice(0, 40)
}

const app = express()
app.use(express.json({ limit: '50mb' }))

// ── File upload setup ──
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadsDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname)
    const base = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9._-]/g, '_')
    const date = new Date().toISOString().slice(0, 10)
    cb(null, `${date}_${base}${ext}`)
  },
})
const upload = multer({ storage, limits: { fileSize: 50 * 1024 * 1024 } })

// ── SSE fan-out lives in ./event-bus.js (imported as `bus`) ──

// ═══ API ROUTES (must be before Vite middleware) ═══

// ── SSE stream ──
app.get('/api/events', (req, res) => {
  bus.attach(res)

  // Eagerly create/resume session so history is available immediately,
  // then drive the connect snapshot through the bus (one sending path).
  getOrCreateSession().then(() => {
    bus.send(res, 'session_status', getSessionInfo())
    const history = getSessionHistory()
    if (history.length) bus.send(res, 'session_history', { entries: history })
    const stats = getSessionStats()
    if (stats) bus.send(res, 'session_stats', stats)
  }).catch(err => {
    bus.send(res, 'error', { message: err.message })
  })

  req.on('close', () => bus.detach(res))
})

// ── Prompt ──
app.post('/api/prompt', async (req, res) => {
  const { text, attachments } = req.body
  if (!text?.trim() && (!attachments || attachments.length === 0)) return res.status(400).json({ error: 'empty prompt' })

  res.json({ ok: true })

  try {
    await getOrCreateSession()
    await prompt(text, attachments)
    bus.push('session_status', getSessionInfo())
    bus.push('session_stats', getSessionStats())
  } catch (err) {
    bus.push('error', { message: err.message })
  }
})

// ── Abort ──
app.post('/api/abort', async (_req, res) => {
  try { await abort() } catch {}
  res.json({ ok: true })
})

// ── Models ──
app.get('/api/models', async (_req, res) => {
  try {
    const models = await getAvailableModels()
    res.json(models)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ── Set model ──
app.post('/api/model', async (req, res) => {
  const { model } = req.body
  if (!model) return res.status(400).json({ error: 'no model' })
  try {
    await setModel(model)
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ── Thinking level ──
app.get('/api/thinking-level', (_req, res) => {
  res.json(getThinkingInfo())
})

app.post('/api/thinking-level', (req, res) => {
  const { level } = req.body
  if (!level) return res.status(400).json({ error: 'no level' })
  try {
    setThinkingLevel(level)
    bus.push('session_status', getSessionInfo())
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ── Commands ──
app.get('/api/commands', async (_req, res) => {
  try {
    const cmds = await getCommands()
    res.json(cmds)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ── Workspace files (for @-mention autocomplete) ──
app.get('/api/files', async (req, res) => {
  try {
    const files = await listWorkspaceFiles((req.query.q || '').toString())
    res.json({ files })
  } catch {
    res.json({ files: [] })
  }
})

// ── Session stats ──
app.get('/api/stats', (_req, res) => {
  const stats = getSessionStats()
  if (!stats) return res.json(null)
  res.json(stats)
})

// ── Session history ──
app.get('/api/history', (_req, res) => {
  res.json({ entries: getSessionHistory() })
})

// ── New session ──
app.post('/api/session/new', async (_req, res) => {
  try {
    await newSession()
    bus.push('session_status', getSessionInfo())
    bus.push('session_history', { entries: [] })
    bus.push('session_stats', getSessionStats())
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ── Compaction ──
app.post('/api/compact', async (_req, res) => {
  try {
    res.json({ ok: true })
    await compactSession()
    bus.push('session_status', getSessionInfo())
    bus.push('session_stats', getSessionStats())
  } catch (err) {
    // "Nothing to compact" is benign — don't pollute the chat with it
    if (!err.message.includes('Nothing to compact')) {
      bus.push('error', { message: err.message })
    }
  }
})

app.post('/api/compact/abort', (_req, res) => {
  abortCompaction()
  res.json({ ok: true })
})

app.post('/api/compaction/auto', (req, res) => {
  const { enabled } = req.body
  setAutoCompaction(enabled)
  bus.push('session_status', getSessionInfo())
  res.json({ ok: true })
})

// ── Session list + switching ──
app.get('/api/sessions', async (_req, res) => {
  try {
    const sessions = await listSessions()
    res.json(sessions)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.post('/api/session/switch', async (req, res) => {
  const { path: sessionPath } = req.body
  if (!sessionPath) return res.status(400).json({ error: 'no path' })
  try {
    res.json({ ok: true })
    await switchToSession(sessionPath)
    bus.push('session_status', getSessionInfo())
    bus.push('session_history', { entries: getSessionHistory() })
    bus.push('session_stats', getSessionStats())
  } catch (err) {
    bus.push('error', { message: err.message })
  }
})

// ── Release notes / changelog ──
app.get('/api/changelog', (_req, res) => {
  const file = path.join(__dirname, '..', 'CHANGELOG.md')
  fs.readFile(file, 'utf8', (err, data) => {
    if (err) return res.status(404).json({ error: 'CHANGELOG.md not found' })
    res.type('text/markdown').send(data)
  })
})

// ── File upload ──
app.post('/api/upload', upload.array('files', 10), (req, res) => {
  const files = (req.files || []).map(f => {
    const ext = path.extname(f.originalname).toLowerCase().replace('.', '')
    const mimetype = Mime.mimeFor(ext) || f.mimetype
    const isImage = Mime.isImage(mimetype)
    const info = {
      id: f.filename,
      name: f.originalname,
      path: `${process.env.VITE_BASE || ''}/uploads/${f.filename}`,
      size: f.size,
      mimetype,
      isImage,
    }
    if (isImage) {
      const data = fs.readFileSync(f.path)
      info.dataUrl = `data:${mimetype};base64,${data.toString('base64')}`
    }
    return info
  })
  res.json({ files })
})

if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '..', 'dist')))
}
const base = process.env.VITE_BASE || ''
// Mount uploads at both the base-prefixed path (direct access) and bare /uploads
// (nginx proxy_pass with trailing slash strips the /aiui/ prefix before reaching us).
app.use(`${base}/uploads`, express.static(uploadsDir))
app.use(`/uploads`, express.static(uploadsDir))

// ── Security headers ──
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('X-Frame-Options', 'SAMEORIGIN')
  next()
})

// ── Local-network-only binding ──
// Binds to 0.0.0.0 so it's reachable from LAN, but NOT from the internet.
// For extra safety, use a firewall rule or reverse proxy to restrict further.
const PORT = process.env.PORT || 3001
const HOST = process.env.HOST || '127.0.0.1'
app.listen(PORT, HOST, () => console.log(`πui server running on http://${HOST}:${PORT}`))
