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
