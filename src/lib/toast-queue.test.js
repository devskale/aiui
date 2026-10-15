import test from 'node:test'
import assert from 'node:assert/strict'
import { pushToast, dismissToast, MAX_TOASTS, DEFAULT_TTL } from './toast-queue.js'

const t = (id, text = `t${id}`) => ({ id, text })

test('pushToast: hängt an und defaultet kind/ttl', () => {
  const out = pushToast([], { id: 1, text: 'hi' })
  assert.deepEqual(out, [{ id: 1, text: 'hi', kind: 'info', ttl: DEFAULT_TTL }])
})

test('pushToast: explizites kind/ttl bleibt', () => {
  const out = pushToast([], { id: 1, text: 'x', kind: 'error', ttl: 0 })
  assert.equal(out[0].kind, 'error')
  assert.equal(out[0].ttl, 0)
})

test('pushToast: kappt auf max — älteste fliegen zuerst', () => {
  let l = []
  for (let i = 1; i <= 5; i++) l = pushToast(l, t(i))
  assert.equal(l.length, MAX_TOASTS)
  assert.deepEqual(l.map(x => x.id), [3, 4, 5])
})

test('pushToast: benutzerdefiniertes max', () => {
  const l = pushToast(pushToast(pushToast([], t(1)), t(2)), t(3), 2)
  assert.deepEqual(l.map(x => x.id), [2, 3])
})

test('pushToast: ohne id unverändert (Guard)', () => {
  const l = [t(1)]
  assert.equal(pushToast(l, { text: 'no id' }), l)
  assert.deepEqual(pushToast(null, { text: 'no id' }), [])
})

test('pushToast: Eingabe-Liste wird nicht mutiert', () => {
  const l = [t(1)]
  pushToast(l, t(2))
  assert.equal(l.length, 1)
})

test('dismissToast: entfernt genau die id', () => {
  const l = pushToast(pushToast(pushToast([], t(1)), t(2)), t(3))
  assert.deepEqual(dismissToast(l, 2).map(x => x.id), [1, 3])
})

test('dismissToast: unbekannte id → unverändert; null-sicher', () => {
  const l = [t(1)]
  assert.equal(dismissToast(l, 99).length, 1)
  assert.deepEqual(dismissToast(null, 1), [])
})
