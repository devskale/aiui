#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════
// smoke — boot the server and verify the live SDK wiring end to end
//
// Default (fast, no model call): boot → GET /api/models (non-empty provider
// catalog) → GET /api/agents (catalog loads) → ask-route contract (400/404)
// → shutdown.
// --full (real model calls, needs provider credentials): additionally send an
// image-only prompt (1×1 PNG, empty text — the #9797 regression path), wait
// for turn_end, check the reconnect history replay, then run the ask-e2e:
// prompt the model to call ask → answer the parked card via /api/ask/answer
// → verify the tool result reached the model and the run settled.
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

// SSE-Connect öffnen, data-Events (JSON mit .type) sammeln. Resolve beim
// ersten Event (Verbindung steht), req zurück zum Aufräumen.
function openSse(port, events) {
  return new Promise((resolve, reject) => {
    const req = http.get({ host: '127.0.0.1', port, path: '/api/events' }, res => {
      res.setEncoding('utf8')
      let buf = ''
      let pendingEvent = null
      res.on('data', c => {
        buf += c
        for (const line of buf.split('\n')) {
          if (line.startsWith('event:')) { pendingEvent = line.slice(6).trim(); continue }
          if (!line.startsWith('data:')) continue
          try {
            // SDK-Events tragen .type im Payload; Lifecycle-Pushes (session_*)
            // nur in der event:-Zeile — beides zusammenführen wie der Browser-Hook.
            const data = JSON.parse(line.slice(5))
            events.push(data && data.type ? data : { type: pendingEvent, ...data })
          } catch { /* Teilzeile */ }
        }
        buf = buf.slice(buf.lastIndexOf('\n') + 1)
      })
      resolve(req)
    })
    req.on('error', reject)
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

  // ── SSE-Resync-Vertrag (Ledger streaming-robustness): jede FRISCHE
  // Verbindung bekommt das Status-Bundle gepusht — die Grundlage, auf der
  // der Client nach Reconnect (Deploy-Fenster, StrictMode-Remount) ohne
  // Duplikate resynct. Zwei parallele Connects = StrictMode-Doppel-Open.
  {
    const ev1 = [], ev2 = []
    const s1 = await openSse(port, ev1)
    await new Promise(r => setTimeout(r, 300))
    const s2 = await openSse(port, ev2) // zweiter Connect während erster offen ist
    await new Promise(r => setTimeout(r, 700))
    s1.destroy(); s2.destroy()
    const gotStatus = (ev) => ev.some(e => e.type === 'session_status')
    if (!gotStatus(ev1) || !gotStatus(ev2)) {
      throw new Error(`SSE-Resync-Vertrag verletzt: session_status fehlt (connect1: ${gotStatus(ev1)}, connect2: ${gotStatus(ev2)})`)
    }
    console.log('smoke: SSE-Resync OK (session_status auf jedem frischen Connect ×2)')
  }

  // ── Ask-Contract (ask-Tool): Answer-Route lehnt malformed/unknown ab —
  // 400 ohne id/answers, 404 für eine unbekannte (nie geparkte) id.
  {
    const malformed = await postJson(port, '/api/ask/answer', {})
    if (malformed.status !== 400) throw new Error(`/api/ask/answer ohne body: HTTP ${malformed.status}, erwartet 400`)
    const unknown = await postJson(port, '/api/ask/answer', { id: 'smoke-no-such-id', answers: ['x'] })
    if (unknown.status !== 404) throw new Error(`/api/ask/answer unbekannte id: HTTP ${unknown.status}, erwartet 404`)
    console.log('smoke: Ask-Contract OK (400 malformed / 404 unknown)')
  }

  if (FULL) {
    // SSE mitlauschen, dann Bild-only-Prompt (leerer Text) feuern.
    // openSse merged die event:-Zeile — aiui-eigene Pushes (error etc.) tragen
    // das type NUR in der event:-Zeile, nicht im Payload.
    const events = []
    const sse = await openSse(port, events)
    const sseErr = null
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

    // Reconnect nach beendetem Turn: die neue Verbindung muss die History
    // REPLAYEN (session_history mit Entries) — Replace- statt Append-Semantik
    // im Client-Reducer macht das resync idempotent (kein First-Chunk-Duplikat).
    const evRe = []
    const sre = await openSse(port, evRe)
    await new Promise(r => setTimeout(r, 700))
    sre.destroy()
    const replay = evRe.find(e => e.type === 'session_history')
    if (!replay || !Array.isArray(replay.entries) || replay.entries.length === 0) {
      throw new Error('Reconnect-Replay fehlt: kein session_history mit Entries nach abgeschlossenem Turn')
    }
    console.log(`smoke: Reconnect-Replay OK (session_history mit ${replay.entries.length} Entries)`)

    // ── Ask-e2e (ask-Tool): Modell ruft ask → Smoke antwortet → Turn
    // settled mit der Antwort. Beweist die ganze Kette: Tool-Registration,
    // SSE-Card-Event, Answer-Route, Tool-Result zurück ans Modell.
    {
      const ev2 = []
      const sse2 = await openSse(port, ev2) // merged event:-Zeile (aiui-Pushes haben kein .type im Payload)
      await new Promise(r => setTimeout(r, 500))

      const postedAsk = await postJson(port, '/api/prompt', {
        text: 'Call your ask tool NOW with exactly one question "Which database should we use?" and the choices ["Postgres", "SQLite"]. Do nothing else — no other tool, no text.',
      })
      if (postedAsk.status !== 200) throw new Error(`/api/prompt (ask): HTTP ${postedAsk.status} — ${postedAsk.body}`)

      // Auf die ask-Card warten (ask-Event-Payload trägt id + questions, kein .type)
      const askDeadline = Date.now() + TURN_TIMEOUT
      let ask = null
      while (Date.now() < askDeadline) {
        ask = ev2.find(e => e.id && Array.isArray(e.questions))
        if (ask) break
        if (ev2.some(e => e.type === 'error')) throw new Error(`Ask-e2e: Agent-Fehler vor dem ask-Call: ${JSON.stringify(ev2.find(e => e.type === 'error')).slice(0, 200)}`)
        await new Promise(r => setTimeout(r, 500))
      }
      if (!ask) throw new Error(`Ask-e2e: kein ask-Event nach ${TURN_TIMEOUT / 1000}s — Modell hat das Tool nicht gerufen`)
      console.log(`smoke: ask-Card OK (1 Frage, ${ask.questions[0]?.choices?.length || 0} Choices)`)

      const answered = await postJson(port, '/api/ask/answer', { id: ask.id, answers: ['Postgres'] })
      if (answered.status !== 200) throw new Error(`/api/ask/answer: HTTP ${answered.status} — ${answered.body}`)

      const settleDeadline = Date.now() + TURN_TIMEOUT
      let settled = null
      while (Date.now() < settleDeadline) {
        settled = ev2.find(e => e.type === 'agent_settled' || e.type === 'error')
        if (settled) break
        await new Promise(r => setTimeout(r, 500))
      }
      sse2.destroy()
      if (!settled) throw new Error(`Ask-e2e: kein agent_settled nach der Antwort (${TURN_TIMEOUT / 1000}s)`)
      if (settled.type === 'error') throw new Error(`Ask-e2e: Agent-Fehler nach der Antwort: ${JSON.stringify(settled).slice(0, 200)}`)
      const answerEcho = ev2.some(e => (e.messages || []).some?.(m => JSON.stringify(m.content || '').includes('Postgres')))
        || ev2.some(e => JSON.stringify(e).includes('Postgres'))
      if (!answerEcho) throw new Error('Ask-e2e: Antwort „Postgres" kam nie beim Modell an (kein Tool-Result sichtbar)')
      console.log('smoke: Ask-e2e OK (Tool-Call → Card → Antwort → Tool-Result → Settle)')
    }

    // ── Mid-Run-Model-Switch (pi-web #1527): das SDK liest das Model pro
    // Request aus dem Live-Agent-State — ein Switch WÄHREND eines Streams
    // gilt ab dem nächsten Request, ohne den Turn zu zerbrechen. Pin: Prompt
    // feuern, nach dem ersten Text-Delta auf ein zweites Modell desselben
    // Providers schalten, verlangen: kein error + Settle + Status zeigt das
    // neue Modell (aus dem Live-State, nicht dem Session-File).
    {
      const cats = await getJson(port, '/api/models')
      const providers = cats.body.providers || {}
      const pairs = Object.entries(providers).filter(([, ids]) => ids.length >= 2)
      if (!pairs.length) throw new Error('Mid-Run-Switch: kein Provider mit ≥2 Modellen im Katalog')
      const sse3 = []
      const sseSwitch = await openSse(port, sse3)
      await new Promise(r => setTimeout(r, 400))
      const statusBefore = sse3.filter(e => e.type === 'session_status').at(-1)
      const current = statusBefore?.model // "provider@id"
      if (!current) throw new Error('Mid-Run-Switch: keine aktuelle session_status.model')
      const curProvider = current.split('@')[0]
      const targetId = (providers[curProvider] || []).find(id => `${curProvider}@${id}` !== current)
      if (!targetId) throw new Error(`Mid-Run-Switch: kein Zweitmodell bei Provider ${curProvider}`)
      const target = `${curProvider}@${targetId}`

      const postedCount = await postJson(port, '/api/prompt', {
        text: 'Count from 1 to 60, one number per line. Do not use any tool. Finish with the word DONE on its own line.',
      })
      if (postedCount.status !== 200) throw new Error(`/api/prompt (switch): HTTP ${postedCount.status}`)

      // Erster Text-Fluss = der Turn streamt → JETZT mitten im Run schalten
      const streamDeadline = Date.now() + TURN_TIMEOUT
      while (Date.now() < streamDeadline) {
        if (sse3.some(e => e.type === 'message_update' && JSON.stringify(e).includes('text_delta'))) break
        if (sse3.some(e => e.type === 'error')) throw new Error('Mid-Run-Switch: error vor dem Stream-Start')
        await new Promise(r => setTimeout(r, 200))
      }
      const switched = await postJson(port, '/api/model', { model: target })
      if (switched.status !== 200) throw new Error(`/api/model mid-run: HTTP ${switched.status} — ${switched.body}`)

      const settleDeadline = Date.now() + 2 * TURN_TIMEOUT
      let settle = null
      while (Date.now() < settleDeadline) {
        settle = sse3.find(e => e.type === 'agent_settled' || e.type === 'error')
        if (settle) break
        await new Promise(r => setTimeout(r, 500))
      }
      sseSwitch.destroy()
      if (!settle) throw new Error(`Mid-Run-Switch: kein Settle nach dem Switch (${2 * TURN_TIMEOUT / 1000}s)`)
      if (settle.type === 'error') throw new Error(`Mid-Run-Switch brach den Turn: ${JSON.stringify(settle).slice(0, 200)}`)
      const statusAfter = sse3.filter(e => e.type === 'session_status').at(-1)
      if (statusAfter?.model !== target) {
        throw new Error(`Mid-Run-Switch: Status zeigt ${statusAfter?.model}, erwartet ${target} (Live-State)`)
      }
      console.log(`smoke: Mid-Run-Model-Switch OK (${current} → ${target} mitten im Turn, ohne Bruch)`)
    }

    // ── #dokname-e2e (Bibliothek): Upload → Prompt mit #token → das Modell
    // kennt den Magic-String nur aus dem INLINE-Dokument (kein Tool-Call).
    {
      const fd = new FormData()
      fd.append('files', new Blob(['The magic string is MAGIC-XYZZY-42.'], { type: 'text/markdown' }), 'smoke-doc.md')
      const up = await fetch(`http://127.0.0.1:${port}/api/upload`, { method: 'POST', body: fd })
      if (!up.ok) throw new Error(`/api/upload (library): HTTP ${up.status}`)
      const lib = await getJson(port, '/api/library?q=smoke-doc')
      if (!lib.body.docs?.some(d => d.name === 'smoke-doc.md')) throw new Error('/api/library: smoke-doc.md fehlt in der Liste')

      const ev4 = []
      const sse4 = await openSse(port, ev4)
      await new Promise(r => setTimeout(r, 400))
      const postedDoc = await postJson(port, '/api/prompt', {
        text: '#smoke-doc Repeat the magic string from this document verbatim. Answer with ONLY the string.',
      })
      if (postedDoc.status !== 200) throw new Error(`/api/prompt (#doc): HTTP ${postedDoc.status}`)

      const docDeadline = Date.now() + TURN_TIMEOUT
      let docSettled = null
      while (Date.now() < docDeadline) {
        docSettled = ev4.find(e => e.type === 'agent_settled' || e.type === 'error')
        if (docSettled) break
        await new Promise(r => setTimeout(r, 500))
      }
      sse4.destroy()
      if (!docSettled) throw new Error(`#dokname-e2e: kein Settle (${TURN_TIMEOUT / 1000}s)`)
      if (docSettled.type === 'error') throw new Error(`#dokname-e2e: Agent-Fehler: ${JSON.stringify(docSettled).slice(0, 200)}`)
      if (!ev4.some(e => JSON.stringify(e).includes('MAGIC-XYZZY-42'))) {
        throw new Error('#dokname-e2e: Magic-String kam nie zurück — Inline-Inlining wirkte nicht')
      }
      console.log('smoke: #dokname-e2e OK (Upload → #token → Inline → Modell-Echo)')
    }

    // ── Vision-Bridge-e2e: auf ein Text-only-Modell schalten und ein
    // @-mentiones Bild prompten — der alte Weg endete in undefinierter
    // Fehlerlage, jetzt beschreibt die Bridge und der Turn settled.
    {
      const cats = await getJson(port, '/api/models')
      const imageModels = new Set(cats.body.imageModels || [])
      const providers = cats.body.providers || {}
      const textOnlyRef = Object.entries(providers)
        .flatMap(([p, ids]) => ids.map(id => `${p}@${id}`))
        .find(ref => !imageModels.has(ref))
      if (!textOnlyRef) {
        console.log('smoke: Vision-Bridge übersprungen (kein Text-only-Modell im Katalog)')
      } else {
        const fd = new FormData()
        const pngB64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
        fd.append('files', new Blob([Buffer.from(pngB64, 'base64')], { type: 'image/png' }), 'smoke-red.png')
        const up = await fetch(`http://127.0.0.1:${port}/api/upload`, { method: 'POST', body: fd })
        if (!up.ok) throw new Error(`/api/upload (bridge): HTTP ${up.status}`)

        const sw = await postJson(port, '/api/model', { model: textOnlyRef })
        if (sw.status !== 200) throw new Error(`/api/model (text-only): HTTP ${sw.status} — ${sw.body}`)

        const ev5 = []
        const sse5 = await openSse(port, ev5)
        await new Promise(r => setTimeout(r, 400))
        const postedImg = await postJson(port, '/api/prompt', {
          text: '@uploads/smoke-red.png What color is this image? One short sentence.',
        })
        if (postedImg.status !== 200) throw new Error(`/api/prompt (bridge): HTTP ${postedImg.status}`)

        const bridgeDeadline = Date.now() + 2 * TURN_TIMEOUT
        let settled = null
        while (Date.now() < bridgeDeadline) {
          settled = ev5.find(e => e.type === 'agent_settled' || e.type === 'error')
          if (settled) break
          await new Promise(r => setTimeout(r, 500))
        }
        sse5.destroy()
        if (!settled) throw new Error(`Vision-Bridge-e2e: kein Settle (${2 * TURN_TIMEOUT / 1000}s)`)
        if (settled.type === 'error') throw new Error(`Vision-Bridge-e2e: Agent-Fehler: ${JSON.stringify(settled).slice(0, 200)}`)
        console.log(`smoke: Vision-Bridge-e2e OK (Text-only ${textOnlyRef} + @-Bild → Beschreibung, Turn settled)`)
      }
    }
  }

  console.log('OK')
} catch (e) {
  console.error(`smoke FAIL: ${e.message}`)
  process.exitCode = 1
} finally {
  child.kill('SIGTERM')
}
