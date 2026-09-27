#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════
// smoke — boot the server and verify the live SDK wiring end to end
//
// Default (fast, no model call): boot → GET /api/models (non-empty provider
// catalog) → GET /api/agents (catalog loads) → shutdown.
// --full (real model call, needs provider credentials): additionally send an
// image-only prompt (1×1 PNG, empty text — the #9797 regression path) and
// wait for turn_end or an error event on the SSE stream.
//
// Run: node scripts/smoke.js [--full]
// Exit 0 = smoke passed, 1 = failure (server boot, endpoint, or model error).
// ════════════════════════════════════════════════════════════════════
import http from 'node:http'
import net from 'node:net'
import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const FULL = process.argv.includes('--full')
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const BOOT_TIMEOUT = 20_000
const TURN_TIMEOUT = 60_000

// 1×1 red PNG — content is irrelevant, only that the model receives it.
const TINY_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer()
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address()
      srv.close(() => resolve(port))
    })
    srv.on('error', reject)
  })
}

function getJson(port, p) {
  return new Promise((resolve, reject) => {
    http.get({ host: '127.0.0.1', port, path: p }, res => {
      let body = ''
      res.on('data', c => (body += c))
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(body) }) }
        catch { reject(new Error(`${p}: keine JSON-Antwort (HTTP ${res.statusCode})`)) }
      })
    }).on('error', reject)
  })
}

function postJson(port, p, data) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(data)
    const req = http.request(
      { host: '127.0.0.1', port, path: p, method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } },
      res => {
        let body = ''
        res.on('data', c => (body += c))
        res.on('end', () => resolve({ status: res.statusCode, body }))
      },
    )
    req.on('error', reject)
    req.end(payload)
  })
}

const port = await freePort()
const child = spawn(process.execPath, [path.join(ROOT, 'server', 'index.js')], {
  env: { ...process.env, PORT: String(port) },
  stdio: ['ignore', 'inherit', 'inherit'],
})

try {
  // Boot: poll /api/models until the server answers.
  const deadline = Date.now() + BOOT_TIMEOUT
  let models = null
  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, 400))
    if (child.exitCode !== null) throw new Error(`Server-Process beendet (exit ${child.exitCode})`)
    try { models = await getJson(port, '/api/models'); break } catch { /* noch nicht bereit */ }
  }
  if (!models) throw new Error(`Server nach ${BOOT_TIMEOUT / 1000}s nicht bereit`)

  const providerCount = Object.keys(models.body.providers || {}).length
  if (models.status !== 200 || providerCount === 0) throw new Error('/api/models: kein Provider-Katalog')
  console.log(`smoke: /api/models OK (${providerCount} Provider)`)

  const agents = await getJson(port, '/api/agents')
  const agentCount = (agents.body.agents || []).length
  if (agents.status !== 200 || agentCount === 0) throw new Error('/api/agents: kein Agent-Katalog')
  console.log(`smoke: /api/agents OK (${agentCount} Agents)`)

  if (FULL) {
    // SSE mitlauschen, dann Bild-only-Prompt (leerer Text) feuern.
    const events = []
    let sseErr = null
    const sse = http.get({ host: '127.0.0.1', port, path: '/api/events' }, res => {
      res.setEncoding('utf8')
      let buf = ''
      res.on('data', c => {
        buf += c
        for (const line of buf.split('\n')) {
          if (!line.startsWith('data:')) continue
          try { events.push(JSON.parse(line.slice(5))) } catch { /* Teilzeile */ }
        }
        buf = buf.slice(buf.lastIndexOf('\n') + 1)
      })
    })
    sse.on('error', e => (sseErr = e))
    await new Promise(r => setTimeout(r, 500))

    const posted = await postJson(port, '/api/prompt', {
      text: '',
      attachments: [{ isImage: true, dataUrl: TINY_PNG }],
    })
    if (posted.status !== 200) throw new Error(`/api/prompt: HTTP ${posted.status} — ${posted.body}`)

    const turnDeadline = Date.now() + TURN_TIMEOUT
    let turnEnd = null
    while (Date.now() < turnDeadline) {
      turnEnd = events.find(e => e.type === 'turn_end' || e.type === 'error')
      if (turnEnd) break
      await new Promise(r => setTimeout(r, 500))
    }
    sse.destroy()
    if (sseErr) throw new Error(`SSE-Stream fehlgeschlagen: ${sseErr.message}`)
    if (!turnEnd) throw new Error(`kein turn_end/error nach ${TURN_TIMEOUT / 1000}s`)
    if (turnEnd.type === 'error') throw new Error(`Agent-Fehler: ${turnEnd.message || JSON.stringify(turnEnd).slice(0, 200)}`)
    console.log('smoke: Bild-only-Roundtrip OK (turn_end erreicht, kein error)')
  }

  console.log('OK')
} catch (e) {
  console.error(`smoke FAIL: ${e.message}`)
  process.exitCode = 1
} finally {
  child.kill('SIGTERM')
}
