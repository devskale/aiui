// ════════════════════════════════════════════════════════════════════
// widget-transport.test.js — die mockbaren Teile der Embed-Naht:
// Besucher-ID, Prompt-Body (inkl. pageContext), Page-Context-Sammlung,
// schmaler Reducer (Entry-Form via shared/entry.js) und Theme-Sicherheit.
// Run: node --test src/embed/widget-transport.test.js
// ════════════════════════════════════════════════════════════════════
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { visitorIdFor, buildPromptBody, WidgetTransport } from './widget-transport.js'
import { widgetReducer, initialState } from './widget-chat.js'
import { collectPageContext } from './useWidgetChat.js'
import { applyTheme, safeText } from './theme.js'

// ── visitorIdFor ──

test('visitorIdFor: stable per key, charset-safe, per-key getrennt', () => {
  const store = new Map()
  const ls = { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) }
  const a1 = visitorIdFor('wk_a', ls)
  const a2 = visitorIdFor('wk_a', ls)
  const b = visitorIdFor('wk_b', ls)
  assert.equal(a1, a2) // stabil
  assert.notEqual(a1, b) // pro Key eigener Besucher
  assert.match(a1, /^[\w-]{1,64}$/) // serverseitiges VISITOR_RE
})

test('visitorIdFor: gesperrtes localStorage → flüchtige, aber gültige ID', () => {
  const throwing = { getItem: () => { throw new Error('denied') }, setItem: () => { throw new Error('denied') } }
  assert.match(visitorIdFor('wk_a', throwing), /^v\w+$/)
})

// ── buildPromptBody / collectPageContext ──

test('buildPromptBody: text + pageContext als Datenfeld', () => {
  assert.deepEqual(
    buildPromptBody('Frage', { url: 'https://x.at', title: 'X' }),
    { text: 'Frage', pageContext: { url: 'https://x.at', title: 'X' } },
  )
  assert.deepEqual(buildPromptBody('Frage', undefined), { text: 'Frage', pageContext: {} })
})

test('collectPageContext: sammelt URL/Title/Referrer/Locale/Selection', () => {
  const pc = collectPageContext({
    location: { href: 'https://kunde.at/p?q=1' },
    title: 'Produkte',
    getSelection: () => 'markierter Text',
  })
  assert.equal(pc.url, 'https://kunde.at/p?q=1')
  assert.equal(pc.title, 'Produkte')
  assert.equal(pc.selection, 'markierter Text')
  assert.equal(pc.referrer, '')
  assert.ok(typeof pc.locale === 'string')
})

// ── WidgetTransport (fetch gemockt) ──

function mockFetch(handlers) {
  const calls = []
  const f = async (url, opts) => {
    calls.push({ url, opts })
    for (const h of handlers) if (h.test(url)) return h.respond()
    return { ok: false, status: 404, json: async () => ({ error: 'nope' }) }
  }
  f.calls = calls
  return f
}

test('transport.connect: mintet einmal, hält Token+Config; zweiter connect ist No-op', async () => {
  const f = mockFetch([{
    test: u => u.endsWith('/api/widget/session'),
    respond: () => ({ ok: true, json: async () => ({ token: 'tok1', expiresAt: Date.now() + 3600_000, config: { greeting: 'Hi!' } }) }),
  }])
  const t = new WidgetTransport({ apiBase: 'https://aiui.at/', key: 'wk_x', fetchImpl: f })
  await t.connect()
  await t.connect() // noch gültig → kein zweiter Mint
  assert.equal(f.calls.length, 1)
  assert.equal(t.token, 'tok1')
  assert.equal(t.config.greeting, 'Hi!')
  assert.equal(f.calls[0].opts.body, JSON.stringify({ key: 'wk_x' }))
})

test('transport.sendPrompt: trägt Bearer + visitor + pageContext', async () => {
  const f = mockFetch([
    { test: u => u.endsWith('/api/widget/session'), respond: () => ({ ok: true, json: async () => ({ token: 'tok1', expiresAt: Date.now() + 3600_000, config: {} }) }) },
    { test: u => u.includes('/api/widget/prompt?visitor='), respond: () => ({ ok: true, json: async () => ({ ok: true }) }) },
  ])
  const t = new WidgetTransport({ apiBase: 'https://aiui.at', key: 'wk_x', fetchImpl: f })
  await t.connect()
  await t.sendPrompt('Hallo', { url: 'https://host.at/' })
  const call = f.calls.find(c => c.url.includes('/prompt'))
  assert.equal(call.opts.headers.Authorization, 'Bearer tok1')
  assert.match(call.url, /visitor=[\w-]+/)
  assert.deepEqual(JSON.parse(call.opts.body), { text: 'Hallo', pageContext: { url: 'https://host.at/' } })
})

test('transport: Fehlerstatus wird mit Meldung gereicht', async () => {
  const f = mockFetch([{
    test: u => u.endsWith('/api/widget/session'),
    respond: () => ({ ok: false, status: 403, json: async () => ({ error: 'invalid key' }) }),
  }])
  const t = new WidgetTransport({ apiBase: 'https://aiui.at', key: 'wk_bad', fetchImpl: f })
  await assert.rejects(() => t.connect(), /invalid key/)
})

// ── widgetReducer (Entry-Form via shared/entry.js) ──

test('reducer: user_prompt → User-Entry + streaming; agent_settled committet', () => {
  let s = widgetReducer(initialState, { type: 'user_prompt', text: 'Hi' })
  assert.equal(s.entries.length, 1)
  assert.equal(s.entries[0].role, 'user')
  assert.equal(s.entries[0].text, 'Hi')
  assert.equal(s.streaming, true)

  s = widgetReducer(s, { type: 'message_start' })
  s = widgetReducer(s, { type: 'message_update', assistantMessageEvent: { type: 'text_delta', delta: 'Antwort' } })
  s = widgetReducer(s, { type: 'message_update', assistantMessageEvent: { type: 'thinking_delta', delta: 'hmm' } })
  s = widgetReducer(s, { type: 'message_end' })
  s = widgetReducer(s, { type: 'agent_settled' })
  assert.equal(s.streaming, false)
  assert.equal(s.entries.length, 2)
  assert.equal(s.entries[1].role, 'assistant')
  assert.ok(s.entries[1].text.includes('Antwort'))
  assert.ok(s.entries[1].thinkingText.includes('hmm'))
})

test('reducer: session_history ersetzt die Entries (Reload/Reconnect)', () => {
  const s = widgetReducer(initialState, { type: 'session_history', entries: [{ role: 'user', text: 'alt', images: [] }] })
  assert.equal(s.entries.length, 1)
  assert.equal(s.entries[0].text, 'alt')
})

// ── theme ──

test('applyTheme: sichere Farben ja, Injection nein', () => {
  const el = { style: { setProperty(k, v) { this[k] = v } } }
  applyTheme(el, { accent: '#ff5500' })
  assert.equal(el.style['--aiw-accent'], '#ff5500')
  applyTheme(el, { accent: 'red;} body{display:none' }) // Injection-Versuch
  assert.notEqual(el.style['--aiw-accent'], 'red;} body{display:none')
})

test('safeText: Markup-ähnliche Werte fallen auf den Fallback', () => {
  assert.equal(safeText('Chat', 'X'), 'Chat')
  assert.equal(safeText('<script>', 'Fallback'), 'Fallback')
})
