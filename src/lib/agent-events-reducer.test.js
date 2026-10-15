// ════════════════════════════════════════════════════════════════════
// useAgentEvents.test.js — reducer (pure): Provider-Fehler-Turns
// sichtbar. Der Hook selbst ist React-Thema; hier geht es um die
// Event→State-Faltung.
// Run: node --test src/hooks/useAgentEvents.test.js
// ════════════════════════════════════════════════════════════════════
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { reducer } from './agent-events-reducer.js'

const S0 = { entries: [], current: null, streaming: false }

test('reducer: fehlgeschlagener Turn → Error-Row am agent_settled', () => {
  let s = reducer(S0, { type: 'agent_start', agentId: 'default' })
  s = reducer(s, { type: 'message_start' })
  s = reducer(s, { type: 'message_end', message: { role: 'assistant', content: [], stopReason: 'error', errorMessage: 'rate limited' } })
  s = reducer(s, { type: 'agent_settled' })
  assert.equal(s.streaming, false)
  const last = s.entries[s.entries.length - 1]
  assert.equal(last.role, 'error', 'letzte Row ist Fehler')
  assert.equal(last.text, 'rate limited')
})

test('reducer: Antworttext trotz errorMessage bleibt Assistant-Row', () => {
  let s = reducer(S0, { type: 'agent_start', agentId: 'default' })
  s = reducer(s, { type: 'message_start' })
  s = reducer(s, { type: 'message_update', assistantMessageEvent: { type: 'text_delta', delta: 'Teilantwort' } })
  s = reducer(s, { type: 'message_end', message: { role: 'assistant', content: [], stopReason: 'error', errorMessage: 'x' } })
  s = reducer(s, { type: 'agent_settled' })
  const last = s.entries[s.entries.length - 1]
  assert.equal(last.role, 'assistant')
  assert.equal(last.text, 'Teilantwort')
})

// ── per-attempt usage (Issue per-turn-usage-workdetails) ──

test('message_end stasht usage am current; turn_end committet es mit', () => {
  const usage = { input: 10, output: 5, cacheRead: 0, cacheWrite: 0, totalTokens: 15, cost: { total: 0.001 } }
  let s = reducer(S0, { type: 'agent_start' })
  s = reducer(s, { type: 'turn_start' })
  s = reducer(s, { type: 'message_start' })
  s = reducer(s, { type: 'message_update', assistantMessageEvent: { type: 'text_delta', delta: 'Antwort' } })
  s = reducer(s, { type: 'message_end', message: { usage } })
  assert.equal(s.current.usage, usage)
  s = reducer(s, { type: 'turn_end' })
  const committed = s.entries[s.entries.length - 1]
  assert.equal(committed.role, 'assistant')
  assert.equal(committed.usage, usage)
})

test('message_end ohne usage behält vorhandenen Stash (defensiv)', () => {
  const usage = { input: 1, output: 1, totalTokens: 2 }
  let s = reducer(S0, { type: 'agent_start' })
  s = reducer(s, { type: 'turn_start' })
  s = reducer(s, { type: 'message_start' })
  s = reducer(s, { type: 'message_update', assistantMessageEvent: { type: 'text_delta', delta: 'x' } })
  s = reducer(s, { type: 'message_end', message: { usage } })
  s = reducer(s, { type: 'message_end', message: {} })
  assert.equal(s.current.usage, usage)
})

// ── Streaming-Robustheit (Ledger streaming-robustness-e2e-pins) ──
// Pins für die zwei realexistierenden Bruchkanten:
//   1. First-Chunk/Replay-Duplikate (Reconnect pushed History zurück)
//   2. StrictMode-Doppel-Open (zwei EventSources liefern interleaved Events)

test('text_delta vor message_start ist No-Op — kein verwaistes current', () => {
  // Out-of-order erster Chunk (Replay-Fenster): ohne current wird das Delta
  // verworfen, nicht in ein Pseudo-Entry gelogen.
  const s = reducer(S0, { type: 'message_update', assistantMessageEvent: { type: 'text_delta', delta: 'früh' } })
  assert.equal(s.current, null)
  assert.deepEqual(s.entries, [])
})

test('message_start resettet current — zwei Nachrichten konkatenieren nicht', () => {
  let s = reducer(S0, { type: 'agent_start' })
  s = reducer(s, { type: 'turn_start' })
  s = reducer(s, { type: 'message_start' })
  s = reducer(s, { type: 'message_update', assistantMessageEvent: { type: 'text_delta', delta: 'erste' } })
  s = reducer(s, { type: 'message_end', message: {} })
  s = reducer(s, { type: 'message_start' }) // zweite Message im selben Turn
  assert.equal(s.current.text, '') // NICHT 'erste' + weiter — First-Chunk beginnt leer
  s = reducer(s, { type: 'message_update', assistantMessageEvent: { type: 'text_delta', delta: 'zweite' } })
  assert.equal(s.current.text, 'zweite')
})

test('session_history ERSETZT — optimistisches user_prompt wird nicht dupliziert', () => {
  // Reconnect-Mitten-im-Turn: Client hat user_prompt optimistisch eingefügt,
  // der Server-Replay enthält dieselbe Nachricht erneut. Replace-Semantik
  // muss genau EIN Exemplar hinterlassen.
  let s = reducer(S0, { type: 'user_prompt', text: 'hi' })
  s = reducer(s, { type: 'agent_start' })
  s = reducer(s, { type: 'turn_start' })
  s = reducer(s, { type: 'message_start' })
  s = reducer(s, { type: 'message_update', assistantMessageEvent: { type: 'text_delta', delta: 'teil' } })
  // Reconnect: Server pushed Status + History (User-Turn committed, Assistant-Teil im Replay)
  const history = [{ role: 'user', text: 'hi' }]
  s = reducer(s, { type: 'session_history', entries: history })
  const his = s.entries.filter(e => e.role === 'user' && e.text === 'hi')
  assert.equal(his.length, 1, `genau ein 'hi', bekam ${his.length}`)
  assert.equal(s.current, null, 'current wird durch den Replay zurückgesetzt')
})

test('doppeltes session_history-Replay ist idempotent (StrictMode-Doppel-Open)', () => {
  // Zwei EventSources (Remount-Rennen) pushen dieselbe History zweimal —
  // der Zustand muss identisch bleiben, kein Append.
  const history = [
    { role: 'user', text: 'q' },
    { role: 'assistant', text: 'a' },
  ]
  const once = reducer(S0, { type: 'session_history', entries: history })
  const twice = reducer(once, { type: 'session_history', entries: history })
  assert.deepEqual(twice.entries, history)
  assert.equal(twice.entries.length, 2)
  assert.deepEqual(once.entries, twice.entries)
})
