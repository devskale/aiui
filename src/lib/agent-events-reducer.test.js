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
