import test from 'node:test'
import assert from 'node:assert/strict'
import {
  visibleWindow, growWindow, captureScrollDistance, restoreScrollTop,
  isAtTail, growWithStream, PAGE_SIZE, TAIL_TOLERANCE,
} from './chat-window.js'

test('visibleWindow: Fenster liegt auf dem Ende', () => {
  const w = visibleWindow(300, 50)
  assert.equal(w.startIndex, 250)
  assert.equal(w.visibleCount, 50)
  assert.equal(w.hasMore, true)
})

test('visibleWindow: kurze Historie wird komplett gezeigt', () => {
  const w = visibleWindow(30, 50)
  assert.equal(w.startIndex, 0)
  assert.equal(w.visibleCount, 30)
  assert.equal(w.hasMore, false)
})

test('visibleWindow: visibleCount wird auf total geklemmt', () => {
  const w = visibleWindow(10, 999)
  assert.equal(w.visibleCount, 10)
  assert.equal(w.startIndex, 0)
})

test('visibleWindow: 0 Entries ist leer, ohne hasMore', () => {
  const w = visibleWindow(0, 50)
  assert.deepEqual(w, { startIndex: 0, visibleCount: 0, hasMore: false })
})

test('growWindow: wächst um pageSize', () => {
  assert.equal(growWindow(50), 100)
  assert.equal(growWindow(50, 20), 70)
})

test('capture/restore: Scroll-Distanz bleibt beim Einmontieren erhalten', () => {
  // Vorher: 8000px hoch, 3000px gescrollt → Distanz vom Ende 5000
  const dist = captureScrollDistance(8000, 3000)
  assert.equal(dist, 5000)
  // Nachher: 50 Entries mehr, Seite 12000px hoch → scrollTop so, dass
  // die Distanz wieder 5000 ist (kein Sprung fürs Auge).
  assert.equal(restoreScrollTop(12000, dist), 7000)
})

test('isAtTail: Toleranzgrenze', () => {
  assert.equal(isAtTail(3000, 800, 3800), true)   // genau am Ende (Distanz 0)
  assert.equal(isAtTail(2992, 800, 3800), true)   // Distanz 8 — noch am Ende
})

test('isAtTail: Toleranz 8 — 10px über dem Ende ist NICHT am Ende', () => {
  assert.equal(isAtTail(2990, 800, 3800), false) // 3800-2990-800 = 10 > 8
  assert.equal(isAtTail(2995, 800, 3800), true)  // 5 ≤ 8
})

test('growWithStream: am Ende wächst das Fenster mit', () => {
  assert.equal(growWithStream(50, 120, true), 120)
  assert.equal(growWithStream(120, 125, true), 125)
})

test('growWithStream: weggecrollt bleibt das Fenster fixiert', () => {
  assert.equal(growWithStream(50, 120, false), 50)
})

test('growWithStream: Fenster nie kleiner machen', () => {
  assert.equal(growWithStream(100, 60, true), 100)
})

test('Konstanten', () => {
  assert.equal(PAGE_SIZE, 50)
  assert.equal(TAIL_TOLERANCE, 8)
})
