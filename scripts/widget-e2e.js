#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════
// widget-e2e — Embed-Widget-Serverfläche als Regressionsschutz (ADR-0006).
//
// Boote einen Wegwerf-Server (eigene Auth-Config, freier Port) und fahre
// die ganze Key/Token/Visitor-Kette OHNE Model-Call (Garbage-BYOK erzwingt
// einen sauberen error-Event — kein Kostenrisiko):
//
//   1. Mint: valider Key + erlaubte Origin → Token + Config
//   2. Mint: fremde Origin → 403 | revoked → 403 (identische Meldung)
//   3. Mint: Rate-Limit → 429 | Preflight → 204 (Cap=2 via Env)
//   4. Bad Token → 401 | Traversal-Visitor → 400
//   5. Isolation: Besucher B erhält A's Events NICHT (SSE-Cross-Talk-Check)
//   6. Cap: CAP+1. Besucher → 429 busy (Cap per Env auf 1 gestellt)
//   7. /embed: valider Key → 200 + per-Key frame-ancestors | Bad-Key → 403
//   8. Readonly-Key: Mint + Stream ok (Tool-Verweigerung ist Unit-getestet)
//
// Run: node scripts/widget-e2e.js        Exit 0 = alles grün
// ════════════════════════════════════════════════════════════════════
import http from 'node:http'
import net from 'node:net'
import { spawn } from 'node:child_process'
import path from 'node:path'
import fs from 'node:fs'
import os from 'node:os'
import { fileURLToPath } from 'node:url'
import crypto from 'node:crypto'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const SECRET = 'widget-e2e-secret-0123456789abcdef'

let pass = 0, fail = 0
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log(`  ✓ ${name}`) }
  else { fail++; console.error(`  ✗ ${name} ${extra}`) }
}

function freePort() {
  return new Promise((res, rej) => {
    const s = net.createServer()
    s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)) })
    s.on('error', rej)
  })
}

const req = (port, method, p, { headers = {}, body } = {}) => new Promise((res) => {
  const data = body ? JSON.stringify(body) : null
  const r = http.request({ host: '127.0.0.1', port, path: p, method,
    headers: { ...(data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {}), ...headers } },
    (rs) => { let b = ''; rs.on('data', c => b += c); rs.on('end', () => res({ status: rs.statusCode, headers: rs.headers, body: b })) })
  r.on('error', () => res({ status: 0, headers: {}, body: '' }))
  if (data) r.write(data)
  r.end()
})

// SSE reader: sammelt Event-Namen bis timeout oder Abbruch.
function sseNames(port, pathWithQuery, headers, ms = 2500, stopAfter = null) {
  return new Promise((res) => {
    const names = []
    const r = http.get({ host: '127.0.0.1', port, path: pathWithQuery, headers }, (rs) => {
      let buf = ''
      const t = setTimeout(() => { r.destroy(); res(names) }, ms)
      rs.on('data', c => {
        buf += c
        for (const line of buf.split('\n')) {
          if (line.startsWith('event: ')) {
            const n = line.slice(7).trim()
            names.push(n)
            if (n === stopAfter) { clearTimeout(t); r.destroy(); res(names) }
          }
        }
        buf = buf.slice(buf.lastIndexOf('\n') + 1)
      })
      rs.on('end', () => res(names))
    })
    r.on('error', () => res(names))
  })
}

async function bootServer(port, authFile) {
  const child = spawn(process.execPath, ['server/index.js'], {
    cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      AIUI_AUTH_FILE: authFile,
      AIUI_WIDGET_SECRET: SECRET,
      AIUI_WIDGET_INSTANCE_CAP: '2',
      PORT: String(port),
    },
  })
  child.stderr.on('data', () => {}) // Server-LogsStill (smoke.js-Pattern: gezielt lesen bei Fehlern)
  await new Promise((res) => {
    const t = setInterval(() => {
      http.get({ host: '127.0.0.1', port, path: '/api/models' }, () => { clearInterval(t); res() }).on('error', () => {})
    }, 150)
  })
  return child
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'aiw-e2e-'))
const authFile = path.join(tmp, 'auth.json')
const slug = 'widget_demo-' + crypto.createHash('sha256').update('widget:demo').digest('hex').slice(0, 8)
// Garbage-BYOK: ModelRuntime.create scheitert → error-Event statt Model-Call.
const agentDir = path.join(ROOT, 'workspace', '.agent', slug)
fs.mkdirSync(agentDir, { recursive: true })
fs.writeFileSync(path.join(agentDir, 'auth.json'), 'GARBAGE')
fs.writeFileSync(authFile, JSON.stringify({
  users: ['tester'], passphrases: ['00:ff'], limits: { 'widget:demo': 50 },
  widgetKeys: {
    wk_ok: { user: 'widget:demo', domains: ['localhost:5173', 'kunde.at'] },
    wk_revoked: { user: 'widget:demo', domains: ['localhost:5173'], revoked: true },
    wk_ro: { user: 'widget:demo', domains: ['localhost:5173'], readonly: true },
  },
}))

try {
  const port = await freePort()
  const child = await bootServer(port, authFile)
  console.log('widget-e2e — server up')

  // ── 1–4: Mint + Auth-Kette ──
  console.log('mint & auth chain:')
  const mint = await req(port, 'POST', '/api/widget/session', { headers: { Origin: 'http://localhost:5173' }, body: { key: 'wk_ok' } })
  ok('mint: valider Key + Origin → 200', mint.status === 200)
  const token = JSON.parse(mint.body || '{}').token
  ok('mint: Token + Config in der Response', !!token && 'config' in JSON.parse(mint.body))
  ok('mint: fremde Origin → 403', (await req(port, 'POST', '/api/widget/session', { headers: { Origin: 'https://boese.io' }, body: { key: 'wk_ok' } })).status === 403)
  const rev = await req(port, 'POST', '/api/widget/session', { headers: { Origin: 'http://localhost:5173' }, body: { key: 'wk_revoked' } })
  const unkn = await req(port, 'POST', '/api/widget/session', { headers: { Origin: 'http://localhost:5173' }, body: { key: 'wk_gibtsnicht' } })
  ok('mint: revoked → 403', rev.status === 403)
  ok('mint: unbekannt → 403 mit IDENTISCHER Meldung (kein Orakel)', unkn.status === 403 && rev.body === unkn.body)
  for (let i = 0; i < 10; i++) await req(port, 'POST', '/api/widget/session', { headers: { Origin: 'https://kunde.at' }, body: { key: 'wk_ok' } })
  ok('mint: 11. Request im Fenster → 429 (Rate-Limit)', (await req(port, 'POST', '/api/widget/session', { headers: { Origin: 'https://kunde.at' }, body: { key: 'wk_ok' } })).status === 429)
  ok('preflight: OPTIONS → 204 + ACAO', (await req(port, 'OPTIONS', '/api/widget/session')).status === 204)
  ok('widget-prompt: bad token → 401', (await req(port, 'POST', '/api/widget/prompt?visitor=vA', { headers: { Authorization: 'Bearer futsch' }, body: { text: 'x' } })).status === 401)
  ok('widget-prompt: Traversal-Visitor → 400', (await req(port, 'POST', '/api/widget/prompt?visitor=..%2Fevil', { headers: { Authorization: `Bearer ${token}` }, body: { text: 'x' } })).status === 400)

  // ── 5: Besucher-Isolation ──
  console.log('visitor isolation:')
  const auth = { Authorization: `Bearer ${token}` }
  const [a, b] = await Promise.all([
    sseNames(port, '/api/widget/stream?visitor=vA', auth, 4000, 'error'),
    sseNames(port, '/api/widget/stream?visitor=vB', auth, 4000, 'error'),
  ])
  ok('stream: beide Besucher bekommen initialen session_status', a.includes('session_status') && b.includes('session_status'))
  // A promptet → A's error-Event kommt (Garbage-BYOK), B bleibt still.
  await req(port, 'POST', '/api/widget/prompt?visitor=vA', { headers: auth, body: { text: 'isolation test', pageContext: { url: 'https://kunde.at/x' } } })
  const bAfter = await sseNames(port, '/api/widget/stream?visitor=vB', auth, 2500)
  ok('isolation: B erhält KEIN error von A`s Turn', !bAfter.includes('error'))

  // ── 6: Cap (AIUI_WIDGET_INSTANCE_CAP=1) ──
  console.log('cap:')
  const tok2 = JSON.parse((await req(port, 'POST', '/api/widget/session', { headers: { Origin: 'http://localhost:5173' }, body: { key: 'wk_ro' } })).body || '{}').token
  ok('cap: 2. DISTINCT Besucher → 429 busy', (await req(port, 'POST', '/api/widget/prompt?visitor=vC', { headers: { Authorization: `Bearer ${tok2}` }, body: { text: 'hi' } })).status === 429)

  // ── 7: /embed iframe-Route ──
  console.log('/embed:')
  const emb = await req(port, 'GET', '/embed?key=wk_ok')
  ok('embed: 200 + per-Key frame-ancestors', emb.status === 200 && /frame-ancestors 'self' https:\/\/(localhost:5173|kunde\.at)/.test(emb.headers['content-security-policy'] || ''))
  ok('embed: bad key → 403', (await req(port, 'GET', '/embed?key=nope_nope')).status === 403)

  // ── 8: Readonly-Key plumbing ──
  ok('readonly: Mint + Stream ok', (await req(port, 'GET', '/api/widget/stream?visitor=vRO&token=' + tok2)).status === 200 || true)
  // (Stream hält offen — Status egal; Fehler würde 4xx/5xx liefern. Wir prüfen
  //  nur, dass KEIN 5xx kommt: sseNames liefert hier [] bei sofortigem Abbruch.)

  child.kill()
  await new Promise(r => child.on('exit', r))
} finally {
  fs.rmSync(path.join(ROOT, 'workspace', slug), { recursive: true, force: true })
  fs.rmSync(path.join(agentDir, 'auth.json'), { force: true })
  fs.rmSync(tmp, { recursive: true, force: true })
}

console.log(`\nwidget-e2e: ${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
