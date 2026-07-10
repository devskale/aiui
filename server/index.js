import express from 'express'
import multer from 'multer'
import { v4 as uuid } from 'uuid'
import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import { getOrCreateSession, prompt, abort, setModel, setThinkingLevel, getThinkingInfo, getAvailableModels, getCommands, setEventBroadcaster, getSessionInfo, getSessionStats } from './pi-session.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const uploadsDir = path.join(__dirname, '..', 'uploads')
fs.mkdirSync(uploadsDir, { recursive: true })

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

// ── SSE clients ──
const clients = new Set()

function broadcast(event, data) {
  const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
  for (const res of clients) {
    try { res.write(msg) } catch { clients.delete(res) }
  }
}

// ═══ API ROUTES (must be before Vite middleware) ═══

// ── SSE stream ──
app.get('/api/events', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  'X-Accel-Buffering': 'no',
  })
  res.write('\n')
  clients.add(res)
  // Send current session status immediately on connect
  const info = getSessionInfo()
  res.write(`event: session_status\ndata: ${JSON.stringify(info)}\n\n`)
  // Send stats too if session is alive
  const stats = getSessionStats()
  if (stats) res.write(`event: session_stats\ndata: ${JSON.stringify(stats)}\n\n`)
  // Keepalive every 30s to prevent idle proxy/bridge disconnects
  const keepalive = setInterval(() => {
    try { res.write(': keepalive\n\n') } catch { clearInterval(keepalive) }
  }, 30000)
  req.on('close', () => { clearInterval(keepalive); clients.delete(res) })
})

// ── Prompt ──
app.post('/api/prompt', async (req, res) => {
  const { text, attachments } = req.body
  if (!text?.trim() && (!attachments || attachments.length === 0)) return res.status(400).json({ error: 'empty prompt' })

  res.json({ ok: true })

  try {
    const session = await getOrCreateSession()
    // Wire up broadcaster if not yet done
    setEventBroadcaster((type, data) => broadcast(type, data))
    await prompt(text, attachments)
    broadcast('session_status', getSessionInfo())
    broadcast('session_stats', getSessionStats())
  } catch (err) {
    broadcast('error', { message: err.message })
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
    broadcast('session_status', getSessionInfo())
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

// ── Session stats ──
app.get('/api/stats', (_req, res) => {
  const stats = getSessionStats()
  if (!stats) return res.json(null)
  res.json(stats)
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
const IMG_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp']
const EXT_TO_MIME = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp' }

app.post('/api/upload', upload.array('files', 10), (req, res) => {
  const files = (req.files || []).map(f => {
    const ext = path.extname(f.originalname).toLowerCase().replace('.', '')
    const mimetype = EXT_TO_MIME[ext] || f.mimetype
    const isImage = IMG_TYPES.includes(mimetype)
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

app.get('/api/test-image', async (_req, res) => {
  const { getOrCreateSession, setEventBroadcaster } = await import('./pi-session.js')
  const session = await getOrCreateSession()
  setEventBroadcaster((type, data) => broadcast(type, data))

  const fs = await import('node:fs')
  const path = await import('node:path')
  const uploadsDir = path.join(__dirname, '..', 'uploads')
  const files = fs.readdirSync(uploadsDir).filter(f => /\.(png|jpg|jpeg|gif|webp)$/i.test(f))
  if (!files.length) return res.status(404).json({ error: 'no images in uploads/' })

  const file = files[files.length - 1] // latest image
  const imgPath = path.join(uploadsDir, file)
  const ext = path.extname(file).toLowerCase().replace('.', '')
  const mimeMap = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp' }
  const mediaType = mimeMap[ext] || 'image/png'
  const data = fs.readFileSync(imgPath).toString('base64')

  res.json({ ok: true, file, mediaType, size: data.length })
  await session.prompt(`Describe this image: ${file}`, {
    images: [{ type: 'image', mimeType: mediaType, data }],
  })
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
