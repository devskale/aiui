import test from 'node:test'
import assert from 'node:assert/strict'
import { turnMarks, visibleCountForJump, markHeight, MARK_TITLE_LEN } from './turn-rail.js'

test('turnMarks: eine Mark pro User-Entry, mit laufender Nummer', () => {
  const entries = [
    { role: 'user', text: 'eins' },
    { role: 'assistant', text: 'a' },
    { role: 'user', text: 'zwei' },
    { role: 'assistant', text: 'b' },
    { role: 'error', text: 'x' },
  ]
  const m = turnMarks(entries)
  assert.deepEqual(m, [
    { index: 0, number: 1, title: 'eins', weight: 0 },
    { index: 2, number: 2, title: 'zwei', weight: 0 },
  ])
})

test('turnMarks: Whitespace normalisieren, Titel kürzen', () => {
  const long = 'wort '.repeat(40)
  const m = turnMarks([{ role: 'user', text: '\n  hallo\n\twelt  ' }, { role: 'user', text: long }])
  assert.equal(m[0].title, 'hallo welt')
  assert.ok(m[1].title.length <= MARK_TITLE_LEN)
  assert.ok(m[1].title.endsWith('…'))
})

test('turnMarks: leerer Prompt → Platzhalter; nicht-user → keine Mark', () => {
  const m = turnMarks([{ role: 'user', text: '' }, { role: 'assistant' }, { role: 'user', text: 'ok' }])
  assert.deepEqual(m.map(x => x.title), ['(no text)', 'ok'])
})

test('turnMarks: null/undefined-sicher', () => {
  assert.deepEqual(turnMarks(null), [])
  assert.deepEqual(turnMarks(undefined), [])
  assert.deepEqual(turnMarks([{ role: 'assistant' }]), [])
})

test('visibleCountForJump: innerhalb des Fensters → unverändert', () => {
  // total 120, Fenster 100 → startIndex 20; Sprung auf 30 liegt drin
  assert.equal(visibleCountForJump(100, 120, 30), 100)
})

test('visibleCountForJump: Sprung vor das Fenster → wächst exakt bis index', () => {
  // Sprung auf Entry 5: 120-5=115 sichtbar (5 inklusive)
  assert.equal(visibleCountForJump(100, 120, 5), 115)
  assert.equal(visibleCountForJump(50, 120, 0), 120)
})

test('visibleCountForJump: index wird geklemmt, kein Wachstum unter current', () => {
  // 999 → Klemme auf letzte Entry (119) — liegt im Fenster → kein Wachstum
  assert.equal(visibleCountForJump(100, 120, 999), 100)
  assert.equal(visibleCountForJump(100, 120, -5), 120) // clamp auf 0
  assert.equal(visibleCountForJump(120, 120, 0), 120)  // schon alles sichtbar
})

test('visibleCountForJump: degenerierte Eingaben werfen nicht', () => {
  assert.equal(visibleCountForJump(NaN, 10, 0), 10)
  assert.equal(visibleCountForJump(10, NaN, 3), 10)
  assert.equal(visibleCountForJump(0, 0, 0), 0)
})

// ── weight = Tool-Calls des Turns (pi-web #939) ──

test('turnMarks: weight sammelt toolCalls bis zur nächsten User-Entry', () => {
  const entries = [
    { role: 'user', text: 'a' },
    { role: 'assistant', toolCalls: [{}, {}, {}] },
    { role: 'assistant', toolCalls: [{}] },
    { role: 'user', text: 'b' },
    { role: 'assistant', text: 'kurz' },
  ]
  const m = turnMarks(entries)
  assert.equal(m[0].weight, 4)
  assert.equal(m[1].weight, 0)
})

test('turnMarks: toolCalls VOR der ersten User-Entry gehen nirgends verloren (kein Crash)', () => {
  const m = turnMarks([{ role: 'assistant', toolCalls: [{}] }, { role: 'user', text: 'x' }])
  assert.equal(m[0].weight, 0)
})

test('markHeight: sqrt-Skalierung, gedeckelt bei 22', () => {
  assert.equal(markHeight(0), 9)
  assert.equal(markHeight(1), 11)
  assert.ok(markHeight(45) <= 22)
  assert.equal(markHeight(10000), 22) // Cap
  assert.equal(markHeight(-5), 9)     // Guard
  assert.equal(markHeight(NaN), 9)    // Guard
})
