import express from 'express'
import multer from 'multer'
import path from 'node:path'
import fs from 'node:fs'
import { exec } from 'node:child_process'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'
import { getBus } from './event-bus.js'
import * as Mime from './mime.js'
import { authEnabled, verifyCredentials, issueSession, lookupSession, revokeSession, userLimit, setSessionCookie, clearSessionCookie, readSessionCookie, requireAuth, noteLoginAttempt } from './auth.js'
import { consumeQuota, peekQuota } from './quota.js'
import { getOrCreateSession, disposeSession, prompt, abort, setModel, setThinkingLevel, getThinkingInfo, compactSession, abortCompaction, setAutoCompaction, listSessions, switchToSession, getAvailableModels, getCommands, getSessionInfo, getSessionStats, getSessionHistory, newSession, workspaceCwd } from './pi-session.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.join(__dirname, '..')
const uploadsDir = path.join(__dirname, '..', 'uploads')
fs.mkdirSync(uploadsDir, { recursive: true })

const execAsync = promisify(exec)

// ── Workspace file listing (for @-mention autocomplete) ──
// Scoped to the requesting user's workspace dir (the only place the agent can
// read). Git-aware (git ls-files); falls back to a bounded walk if no git.
const IGNORED_DIRS = new Set(['node_modules', '.git', 'dist', 'uploads', 'session', 'test-results', 'coverage'])

async function gitListFiles(dir) {
  const { stdout } = await execAsync('git ls-files', { cwd: dir, maxBuffer: 32 * 1024 * 1024 })
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

async function listWorkspaceFiles(dir, query) {
  let files
  try {
    files = await gitListFiles(dir)
  } catch {
    files = []
    walkFiles(dir, '', files, 0)
  }
  if (query) {
    const q = query.toLowerCase()
    files = files.filter(f => f.toLowerCase().includes(q))
  }
  return files.slice(0, 40)
}

const app = express()
app.set('trust proxy', true) // behind nginx in prod → real client IP for the login throttle
app.use(express.json({ limit: '50mb' }))

// ── Security headers (before routes so they apply to every response) ──
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff')
  // Allow skale.dev to embed aiui in an iframe (URL bar stays skale.dev/aiui
  // while the app streams direct from here). Replaces X-Frame-Options:
  // SAMEORIGIN, which blocked cross-origin embedding.
  res.setHeader('Content-Security-Policy', "frame-ancestors 'self' https://skale.dev https://www.skale.dev")
  next()
})

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

// ═══ API ROUTES (must be before Vite middleware) ═══

// ── Auth (public — login/logout/me sit BEFORE requireAuth) ──
app.post('/api/login', (req, res) => {
  const { username, passphrase } = req.body || {}
  if (!noteLoginAttempt(req.ip)) return res.status(429).json({ error: 'too many attempts, slow down' })
  if (!verifyCredentials(username, passphrase)) return res.status(401).json({ error: 'invalid credentials' })
  setSessionCookie(res, issueSession(username), req.secure)
  res.json({ ok: true, user: username })
})
app.post('/api/logout', (req, res) => {
  if (req.user) disposeSession(req.user) // drop the in-memory session → next login is fresh
  revokeSession(readSessionCookie(req))
  clearSessionCookie(res, req.secure)
  res.json({ ok: true })
})
app.get('/api/me', (req, res) => {
  if (!authEnabled()) return res.json({ authed: true, authRequired: false, user: null, quota: null })
  const s = lookupSession(readSessionCookie(req))
  if (!s) return res.json({ authed: false, authRequired: true })
  res.json({ authed: true, authRequired: true, user: s.user, quota: peekQuota(s.user, userLimit(s.user)) })
})

// Everything else under /api requires a session when auth is configured.
app.use('/api', requireAuth)

// ── SSE stream (per-user bus: Events only fan out to this user's clients) ──
app.get('/api/events', (req, res) => {
  const userBus = getBus(req.user)
  userBus.attach(res)

  getOrCreateSession(req.user).then(() => {
    userBus.send(res, 'session_status', getSessionInfo(req.user))
    const history = getSessionHistory(req.user)
    if (history.length) userBus.send(res, 'session_history', { entries: history })
    const stats = getSessionStats(req.user)
    if (stats) userBus.send(res, 'session_stats', stats)
  }).catch(err => {
    userBus.send(res, 'error', { message: err.message })
  })

  req.on('close', () => userBus.detach(res))
})

// ── Prompt ──
app.post('/api/prompt', async (req, res) => {
  const { text, attachments } = req.body
  if (!text?.trim() && (!attachments || attachments.length === 0)) return res.status(400).json({ error: 'empty prompt' })

  // Per-user daily quota (e.g. guest: 10/day). Auth off → req.user null → no cap.
  const limit = req.user ? userLimit(req.user) : null
  if (limit !== null && !consumeQuota(req.user, limit).allowed) {
    getBus(req.user).push('error', { message: `Daily limit reached (${limit} queries/day for "${req.user}").` })
    return res.status(429).json({ error: 'daily limit reached' })
  }

  res.json({ ok: true })
  try {
    await getOrCreateSession(req.user)
    await prompt(req.user, text, attachments)
    getBus(req.user).push('session_status', getSessionInfo(req.user))
    getBus(req.user).push('session_stats', getSessionStats(req.user))
  } catch (err) {
    getBus(req.user).push('error', { message: err.message })
  }
})

// ── Abort ──
app.post('/api/abort', async (req, res) => {
  try { await abort(req.user) } catch {}
  res.json({ ok: true })
})

// ── Models (global catalog — your shared keys) ──
app.get('/api/models', async (_req, res) => {
  try {
    res.json(await getAvailableModels())
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ── Set model ──
app.post('/api/model', async (req, res) => {
  const { model } = req.body
  if (!model) return res.status(400).json({ error: 'no model' })
  try {
    await setModel(req.user, model)
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ── Thinking level ──
app.get('/api/thinking-level', (req, res) => {
  res.json(getThinkingInfo(req.user))
})
app.post('/api/thinking-level', (req, res) => {
  const { level } = req.body
  if (!level) return res.status(400).json({ error: 'no level' })
  try {
    setThinkingLevel(req.user, level)
    getBus(req.user).push('session_status', getSessionInfo(req.user))
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ── Commands ──
app.get('/api/commands', async (req, res) => {
  try {
    res.json(await getCommands(req.user))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ── Workspace files (for @-mention autocomplete) — scoped to the user's dir ──
app.get('/api/files', async (req, res) => {
  try {
    const files = await listWorkspaceFiles(workspaceCwd(req.user), (req.query.q || '').toString())
    res.json({ files })
  } catch {
    res.json({ files: [] })
  }
})

// ── Session stats / history ──
app.get('/api/stats', (req, res) => {
  const stats = getSessionStats(req.user)
  res.json(stats || null)
})
app.get('/api/history', (req, res) => {
  res.json({ entries: getSessionHistory(req.user) })
})

// ── New session ──
app.post('/api/session/new', async (req, res) => {
  try {
    await newSession(req.user)
    const bus = getBus(req.user)
    bus.push('session_status', getSessionInfo(req.user))
    bus.push('session_history', { entries: [] })
    bus.push('session_stats', getSessionStats(req.user))
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ── Compaction ──
app.post('/api/compact', async (req, res) => {
  try {
    res.json({ ok: true })
    await compactSession(req.user)
    const bus = getBus(req.user)
    bus.push('session_status', getSessionInfo(req.user))
    bus.push('session_stats', getSessionStats(req.user))
  } catch (err) {
    if (!err.message.includes('Nothing to compact')) {
      getBus(req.user).push('error', { message: err.message })
    }
  }
})
app.post('/api/compact/abort', (req, res) => {
  abortCompaction(req.user)
  res.json({ ok: true })
})
app.post('/api/compaction/auto', (req, res) => {
  const { enabled } = req.body
  setAutoCompaction(req.user, enabled)
  getBus(req.user).push('session_status', getSessionInfo(req.user))
  res.json({ ok: true })
})

// ── Session list + switching ──
app.get('/api/sessions', async (req, res) => {
  try {
    res.json(await listSessions(req.user))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})
app.post('/api/session/switch', async (req, res) => {
  const { path: sessionPath } = req.body
  if (!sessionPath) return res.status(400).json({ error: 'no path' })
  try {
    res.json({ ok: true })
    await switchToSession(req.user, sessionPath)
    const bus = getBus(req.user)
    bus.push('session_status', getSessionInfo(req.user))
    bus.push('session_history', { entries: getSessionHistory(req.user) })
    bus.push('session_stats', getSessionStats(req.user))
  } catch (err) {
    getBus(req.user).push('error', { message: err.message })
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

const PORT = process.env.PORT || 3001
const HOST = process.env.HOST || '127.0.0.1'
app.listen(PORT, HOST, () => console.log(`πui server running on http://${HOST}:${PORT}`))
