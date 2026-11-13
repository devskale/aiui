// host-actions.test.js — ADR-0006 Phase 2: Allowlist, Parken, Confirm/
// Decline/Timeout/Abort. Ask-Tool-Muster (siehe ask.test.js).
import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import {
  createHostActionTool, resolveHostAction, abortHostActions, pendingHostActionCount,
  _resetHostActionsForTest, normalizeHostActions,
} from './host-actions.js'

const ACTIONS = [{ name: 'addToCart', description: 'Legt den markierten Artikel in den Warenkorb' }, { name: 'scroll-to', description: 'Scrollt zur Sektion' }]
const events = []
const bus = { push: (type, data) => events.push({ type, data }) }
const tool = createHostActionTool('widget:demo/v-test', bus, ACTIONS, { timeoutMs: 60_000 })

beforeEach(() => { events.length = 0; _resetHostActionsForTest() })

// ── normalizeHostActions ──

test('normalizeHostActions: valid entries pass, garbage/dupes/oversize dropped', () => {
  const out = normalizeHostActions([
    { name: 'ok', description: 'fine' },
    { name: 'ok', description: 'dupe — first wins' },
    { name: 'has space', description: 'x' },
    { name: 'noDesc' },
    'garbage',
    { name: 'x'.repeat(50), description: 'name too long' },
  ])
  assert.deepEqual(out, [{ name: 'ok', description: 'fine' }])
  assert.deepEqual(normalizeHostActions(undefined), [])
  assert.deepEqual(normalizeHostActions('nope'), [])
})

test('createHostActionTool: ohne Allowlist kein Tool', () => {
  assert.equal(createHostActionTool('s', bus, []), null)
  assert.equal(createHostActionTool('s', bus, undefined), null)
})

// ── Tool-Flow ──

test('Schema enumt genau die Allowlist; execute parkt + pusht host_action-Event', async () => {
  assert.deepEqual(tool.parameters.properties.action.enum.sort(), ['addToCart', 'scroll-to'])
  const p = tool.execute('tc1', { action: 'addToCart', args: { sku: 42 } })
  await Promise.resolve() // bis zum Parken laufen lassen
  assert.equal(events.length, 1)
  assert.equal(events[0].type, 'host_action')
  assert.equal(events[0].data.action, 'addToCart')
  assert.ok(events[0].data.id)
  assert.equal(events[0].data.args, JSON.stringify({ sku: 42 }, null, 1))
  assert.equal(pendingHostActionCount('widget:demo/v-test'), 1)
  // Host-Ergebnis relayt → Tool-Result
  assert.equal(resolveHostAction('widget:demo/v-test', events[0].data.id, { ok: true, result: 'cart updated' }), true)
  const result = await p
  assert.ok(result.content[0].text.includes('executed'))
  assert.ok(result.content[0].text.includes('cart updated'))
  assert.equal(result.details.executed, true)
  assert.equal(pendingHostActionCount('widget:demo/v-test'), 0)
})

test('nicht-allowlistete Aktion wird hart abgelehnt (Security-Grenze), parkt nie', async () => {
  const r = await tool.execute('tc2', { action: 'rm -rf' })
  assert.ok(r.content[0].text.includes('not allowlisted'))
  assert.equal(events.length, 0, 'kein SSE-Event für unallowlistete Aktion')
  assert.equal(pendingHostActionCount('widget:demo/v-test'), 0)
})

test('Decline löst mit Status, nicht mit Ausführung; Reach host nie', async () => {
  const p = tool.execute('tc3', { action: 'addToCart' })
  await Promise.resolve()
  resolveHostAction('widget:demo/v-test', events[0].data.id, { declined: true })
  const result = await p
  assert.ok(result.content[0].text.includes('DECLINED'))
  assert.equal(result.details.executed, false)
})

test('ok:false meldet Misserfolg statt Erfolg', async () => {
  const p = tool.execute('tc4', { action: 'addToCart' })
  await Promise.resolve()
  resolveHostAction('widget:demo/v-test', events[0].data.id, { ok: false, result: 'out of stock' })
  const result = await p
  assert.ok(result.content[0].text.includes('failure'))
  assert.ok(result.content[0].text.includes('out of stock'))
  assert.equal(result.details.executed, false)
})

test('Abort des Runs löst geparkte Actions mit Status auf (kein hängender Turn)', async () => {
  const p = tool.execute('tc5', { action: 'scroll-to' })
  await Promise.resolve()
  assert.equal(abortHostActions('widget:demo/v-test'), 1)
  const result = await p
  assert.ok(result.content[0].text.includes('not executed'))
  assert.ok(result.content[0].text.includes('aborted'))
})

test('Scopes sind getrennt — fremde Visitor-Antwort erreicht das Park nicht', async () => {
  const other = createHostActionTool('widget:demo/v-other', bus, ACTIONS, { timeoutMs: 60_000 })
  assert.ok(other, 'anderer Scope, eigenes Tool')
  const p = tool.execute('tc6', { action: 'addToCart' })
  await Promise.resolve()
  assert.equal(resolveHostAction('widget:demo/v-other', events[0].data.id, { ok: true }), false, 'falscher Scope')
  assert.equal(pendingHostActionCount('widget:demo/v-test'), 1)
  resolveHostAction('widget:demo/v-test', events[0].data.id, { ok: true, result: 'done' })
  await p
})
