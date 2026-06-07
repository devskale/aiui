import express from 'express'
import multer from 'multer'
import { v4 as uuid } from 'uuid'
import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import { getOrCreateSession, prompt, abort, setModel, getAvailableModels, getCommands } from './pi-session.js'

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
    cb(null, uuid() + ext)
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
  })
  res.write('\n')
  clients.add(res)
  req.on('close', () => clients.delete(res))
})

// ── Prompt ──
app.post('/api/prompt', async (req, res) => {
  const { text, attachments } = req.body
  if (!text?.trim()) return res.status(400).json({ error: 'empty prompt' })

  res.json({ ok: true })

  try {
    const session = await getOrCreateSession()
    const unsubscribe = session.subscribe((event) => {
      broadcast(event.type, event)
    })
    await prompt(text, attachments)
    unsubscribe()
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

// ── Commands ──
app.get('/api/commands', async (_req, res) => {
  try {
    const cmds = await getCommands()
    res.json(cmds)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ── File upload ──
app.post('/api/upload', upload.array('files', 10), (req, res) => {
  const files = (req.files || []).map(f => ({
    id: f.filename,
    name: f.originalname,
    path: f.path,
    size: f.size,
  }))
  res.json({ files })
})

// ═══ STATIC FILES (production only) ═══
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '..', 'dist')))
}

const PORT = process.env.PORT || 3001
app.listen(PORT, () => console.log(`πui API server running on http://localhost:${PORT}`))
