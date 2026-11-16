// smooth-stream.test.js — SOTA-Buffer: Deltas bündeln, rAF-Takt, Reihenfolge.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createSmoothStream } from './smooth-stream.js'

test('push bündelt text/thinking-Deltas zu EINEM Flush pro Frame', () => {
  const flushed = []
  const scheduled = []
  const ss = createSmoothStream({ onFlush: (t, th) => flushed.push({ t, th }), schedule: (fn) => { scheduled.push(fn); return scheduled.length } })
  const upd = (type, delta) => ({ type: 'message_update', assistantMessageEvent: { type, delta } })
  assert.equal(ss.push('message_update', upd('text_delta', 'Hallo ')), true, 'text_delta gebuffert')
  assert.equal(ss.push('message_update', upd('text_delta', 'Welt')), true)
  assert.equal(ss.push('message_update', upd('thinking_delta', 'denke')), true)
  assert.equal(scheduled.length, 1, 'nur EIN Schedule trotz 3 Deltas')
  assert.equal(flushed.length, 0, 'noch nicht geflushed')
  scheduled[0]() // Frame feuert
  assert.deepEqual(flushed, [{ t: 'Hallo Welt', th: 'denke' }])
  assert.equal(ss.buffered(), false)
})

test('flush vor diskreten Events wahrt die Reihenfolge (message_end-Reset-safe)', () => {
  const flushed = []
  const ss = createSmoothStream({ onFlush: (t, th) => flushed.push({ t, th }), schedule: (fn) => fn() }) // sofort
  const upd = (type, delta) => ({ type: 'message_update', assistantMessageEvent: { type, delta } })
  ss.push('message_update', upd('text_delta', 'erstes'))
  assert.deepEqual(flushed, [{ t: 'erstes', th: '' }], 'Sofort-Schedule flushed synchron')
  // diskretes Event: push meldet false → Aufrufer ruft flush() vor dem Dispatch
  assert.equal(ss.push('message_end', {}), false)
  ss.flush()
  assert.equal(flushed.length, 1, 'kein Doppel-Flush bei leerem Buffer')
})

test('message_update ohne Delta-Subevent ist kein Delta (kein Buffer)', () => {
  const flushed = []
  const scheduled = []
  const ss = createSmoothStream({ onFlush: (t, th) => flushed.push({ t, th }), schedule: (fn) => { scheduled.push(fn); return 1 } })
  assert.equal(ss.push('message_update', { assistantMessageEvent: { type: 'tool_call_start' } }), false)
  assert.equal(ss.push('message_update', { type: 'tool_execution_start' }), false)
  assert.equal(scheduled.length, 0)
  assert.equal(flushed.length, 0)
})
