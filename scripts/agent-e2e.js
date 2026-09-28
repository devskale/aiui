#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════
// agent-e2e — wiederverwendbare Agent-E2E-Suite
//
// Bootet einen isolierten Server (freier Port, wie smoke.js) — oder nutzt
// mit --url einen laufenden — und fährt Cases aus scripts/e2e-cases/*.json:
// pro Case Agent aktivieren (neue Session mit Model-Pin) → SSE mithören →
// Prompt senden → Events falten → Erwartungen prüfen.
//
// Run:  node scripts/agent-e2e.js [--suite firmenindex] [--case <id>]
//                               [--slow] [--url http://127.0.0.1:3107] [--json]
// Exit 0 = alle Cases grün, 1 = mindestens ein FAIL/Timeout.
//
// Reine Teile (foldEvents, evaluateExpectations) sind exportiert und in
// agent-e2e.test.js getestet. Cases sind Daten, keine Skripte.
// ════════════════════════════════════════════════════════════════════
import http from 'node:http'
import net from 'node:net'
import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const CASES_DIR = path.join(ROOT, 'scripts', 'e2e-cases')
const BOOT_TIMEOUT = 20_000

// ── CLI ────────────────────────────────────────────────────────────
function argValue(flag) {
  const i = process.argv.indexOf(flag)
  return i >= 0 ? process.argv[i + 1] : undefined
}
const SUITE = argValue('--suite') || 'firmenindex'
const ONLY = argValue('--case')
const SLOW = process.argv.includes('--slow')
const EXT_URL = argValue("--url")
const JSON_OUT = process.argv.includes('--json')

// ── Falten: Events → strukturierter Fold (rein, getestet) ───────────
export function foldEvents(events) {
  const fold = {
    text: '',
    thinkingChars: 0,
    tools: [],            // { name, args, resultHead }
    errors: [],           // error-Events (Bus)
    toolErrors: 0,        // tool_execution_end mit isError
    settled: false,
    model: null,
    agent: null,
  }
  for (const e of events) {
    switch (e.type) {
      case 'message_update': {
        const ev = e.assistantMessageEvent || {}
        if (ev.type === 'text_delta') fold.text += ev.delta || ''
        if (ev.type === 'thinking_delta') fold.thinkingChars += (ev.delta || '').length
        break
      }
      case 'tool_execution_start':
        fold.tools.push({ name: e.toolName, args: e.args || {}, resultHead: '' })
        break
      case 'tool_execution_update': {
        const t = fold.tools[fold.tools.length - 1]
        if (t) t.resultHead = String(e.update || e.output || t.resultHead)
        break
      }
      case 'tool_execution_end': {
        if (e.isError) fold.toolErrors++
        const t = fold.tools.find(x => x.resultHead === '' && x.name === e.toolName)
          || fold.tools[fold.tools.length - 1]
        if (t && e.result) {
          const c = e.result.content?.[0]?.text || ''
          t.resultHead = String(c).slice(0, 500)
        }
        break
      }
      case 'session_status':
        if (e.model) fold.model = e.model
        if (e.agent) fold.agent = e.agent
        break
      case 'agent_settled':
        fold.settled = true
        break
      case 'error':
        fold.errors.push(e.message || JSON.stringify(e).slice(0, 200))
        break
    }
  }
  return fold
}

// ── Erwartungen prüfen (rein, getestet) ────────────────────────────
export function evaluateExpectations(expect, fold, durationMs) {
  const failures = []
  const eq = (label, ok) => { if (!ok) failures.push(label) }
  const e = expect || {}

  if (e.settled !== false) eq('nicht settled', fold.settled)
  if (!e.allowErrorEvents && fold.errors.length) eq(`error-Events: ${fold.errors.join('; ').slice(0, 200)}`, false)
  if (e.toolMax != null && fold.tools.length > e.toolMax) eq(`zu viele Tool-Calls (${fold.tools.length} > ${e.toolMax})`, false)
  if (e.textMin != null && fold.text.length < e.textMin) eq(`Text zu kurz (${fold.text.length} < ${e.textMin})`, false)
  if (e.durationMax != null && durationMs > e.durationMax * 1000) eq(`zu langsam (${Math.round(durationMs / 1000)}s > ${e.durationMax}s)`, false)
  for (const s of e.textContains || []) {
    if (!fold.text.toLowerCase().includes(s.toLowerCase())) eq(`Text fehlt "${s}"`, false)
  }
  for (const s of e.toolSubstr || []) {
    const hit = fold.tools.some(t =>
      String(t.name).includes(s) || JSON.stringify(t.args).includes(s) || t.resultHead.includes(s))
    if (!hit) eq(`kein Tool-Call mit "${s}"`, false)
  }
  if (e.modelContains && !(fold.model || '').includes(e.modelContains)) {
    eq(`Model "${fold.model}" enthält nicht "${e.modelContains}"`, false)
  }
  return { pass: failures.length === 0, failures }
}

// ── Server-Boot (freier Port) oder laufender Server via --url ──────
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

function request(base, p, method = 'GET', data) {
  return new Promise((resolve, reject) => {
    const u = new URL(p, base)
    const payload = data ? JSON.stringify(data) : null
    const req = http.request(
      { hostname: u.hostname, port: u.port, path: u.pathname + u.search, method,
        headers: payload
          ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }
          : {} },
      res => {
        let body = ''
        res.on('data', c => (body += c))
        res.on('end', () => resolve({ status: res.statusCode, body }))
      })
    req.on('error', reject)
    if (payload) req.end(payload); else req.end()
  })
}

// SSE-Mithörer: sammelt geparste data-Events bis zum Abbruch.
// Manche Events (session_status) tragen ihren Typ NUR in der `event:`-Zeile —
// deshalb wird der Event-Name mitverfolgt und als Fallback-Typ injiziert.
function attachEvents(base, events) {
  const u = new URL('/api/events', base)
  const req = http.get({ hostname: u.hostname, port: u.port, path: '/api/events' }, res => {
    res.setEncoding('utf8')
    let buf = ''
    let eventName = ''
    res.on('data', c => {
      buf += c
      const lines = buf.split('\n')
      buf = lines.pop() || ''
      for (const line of lines) {
        if (line.startsWith('event:')) { eventName = line.slice(6).trim(); continue }
        if (!line.startsWith('data:')) continue
        try {
          const d = JSON.parse(line.slice(5).trim())
          if (!d.type && eventName) d.type = eventName
          events.push(d)
        } catch { /* Teilzeile */ }
      }
    })
  })
  req.on('error', () => {})
  return req
}

// ── Ein Case: Agent aktivieren → Prompt → bis settled sammeln ──────
async function runCase(base, c) {
  const timeoutMs = (c.timeout || 180) * 1000
  const events = []
  const sse = attachEvents(base, events)
  await new Promise(r => setTimeout(r, 400))

  const switched = await request(base, '/api/agent', 'POST', { agent: c.agent })
  if (switched.status !== 200) throw new Error(`/api/agent HTTP ${switched.status}: ${switched.body}`)

  const t0 = Date.now()
  const posted = await request(base, '/api/prompt', 'POST', { text: c.prompt })
  if (posted.status !== 200) throw new Error(`/api/prompt HTTP ${posted.status}: ${posted.body}`)

  while (Date.now() - t0 < timeoutMs) {
    if (events.some(e => e.type === 'agent_settled' || e.type === 'error')) break
    await new Promise(r => setTimeout(r, 500))
  }
  const duration = Date.now() - t0
  if (!events.some(e => e.type === 'agent_settled' || e.type === 'error')) {
    await request(base, '/api/abort', 'POST', {})   // hängenden Turn abräumen
  }
  sse.destroy()

  const fold = foldEvents(events)
  const verdict = evaluateExpectations(c.expect, fold, duration)
  return { fold, duration, ...verdict }
}

// ── Suite laden und fahren (nur bei Direktausführung) ──────────
async function main() {
const suitePath = path.join(CASES_DIR, `${SUITE}.json`)
if (!fs.existsSync(suitePath)) {
  console.error(`agent-e2e: Suite nicht gefunden: ${suitePath}`)
  process.exit(1)
}
const suite = JSON.parse(fs.readFileSync(suitePath, 'utf8'))
const cases = suite.cases
  .filter(c => (ONLY ? c.id === ONLY : true))
  .filter(c => (c.slow && !SLOW && !ONLY ? false : true))

let child = null
let base = EXT_URL
if (!base) {
  const port = await freePort()
  base = `http://127.0.0.1:${port}`
  child = spawn(process.execPath, [path.join(ROOT, 'server', 'index.js')], {
    env: { ...process.env, PORT: String(port) },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let serverLog = ''
  child.stdout.on('data', c => (serverLog += c))
  child.stderr.on('data', c => (serverLog += c))
  const deadline = Date.now() + BOOT_TIMEOUT
  let ready = false
  while (Date.now() < deadline && !ready) {
    await new Promise(r => setTimeout(r, 400))
    if (child.exitCode !== null) throw new Error(`Server-Process beendet (exit ${child.exitCode})\n${serverLog}`)
    try { ready = (await request(base, '/api/agents')).status === 200 } catch { /* noch bootend */ }
  }
  if (!ready) { child.kill('SIGTERM'); console.error(`agent-e2e: Server nach ${BOOT_TIMEOUT / 1000}s nicht bereit`); process.exit(1) }
}

console.log(`agent-e2e: Suite "${SUITE}" — ${cases.length} Case(s)${SLOW ? ' (inkl. slow)' : ''} gegen ${base}`)
let failed = 0
for (const c of cases) {
  process.stdout.write(`  ▶ ${c.id}${c.slow ? ' [slow]' : ''} … `)
  try {
    const r = await runCase(base, c)
    const secs = (r.duration / 1000).toFixed(1)
    if (r.pass) {
      console.log(`✓ ${secs}s — ${r.fold.tools.length} Tools, ${r.fold.text.length} Zeichen Text${JSON_OUT ? '' : ''}`)
    } else {
      failed++
      console.log(`✗ ${secs}s`)
      for (const f of r.failures) console.log(`      – ${f}`)
    }
    if (JSON_OUT) console.log(JSON.stringify({ id: c.id, ...r }, null, 2))
  } catch (err) {
    failed++
    console.log(`✗ ${err.message}`)
  }
}

if (child) child.kill('SIGTERM')
console.log(failed ? `agent-e2e: ${failed} FAIL` : 'agent-e2e: OK')
process.exit(failed ? 1 : 0)
}

const invoked = process.argv[1] && import.meta.url === new URL(`file://${path.resolve(process.argv[1])}`).href
if (invoked) await main()
