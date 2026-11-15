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

// ── turnToolCalls (Turn-Level-Gruppierung fürs Chat-Rendering) ──
import { turnToolCalls } from './turn-rail.js'

test('turnToolCalls: Replay-Zeilen (je 1 Call) gruppieren an die letzte Tool-Entry des Turns', () => {
  const tool = (name) => ({ name, status: 'done' })
  const entries = [
    { role: 'user', text: 'q' },
    { role: 'assistant', toolCalls: [tool('read')] },
    { role: 'assistant', toolCalls: [tool('bash')] },
    { role: 'assistant', text: 'Zwischenstand ① ✓' },
    { role: 'assistant', toolCalls: [tool('write')] },
    { role: 'assistant', text: 'Antwort' },
  ]
  const g = turnToolCalls(entries)
  assert.equal(g[0], null, 'user-Entry: keine Gruppe')
  assert.deepEqual(g[1], [], 'frühere Tool-Entry: suppress')
  assert.deepEqual(g[2], [], 'frühere Tool-Entry: suppress')
  assert.equal(g[3], null, 'Text-Entry zwischenrein: null')
  assert.equal(g[4].length, 3, 'letzte Tool-Entry: alle Calls des Turns')
  assert.deepEqual(g[4].map(c => c.name), ['read', 'bash', 'write'])
  assert.equal(g[5], null, 'Antwort-Entry ohne Tools: null')
})

test('turnToolCalls: User-Entry beendet den Turn (neue Gruppe)', () => {
  const entries = [
    { role: 'user', text: 'a' },
    { role: 'assistant', toolCalls: [{ name: 'x' }] },
    { role: 'user', text: 'b' },
    { role: 'assistant', toolCalls: [{ name: 'y' }, { name: 'z' }] },
  ]
  const g = turnToolCalls(entries)
  assert.deepEqual(g[1], [{ name: 'x' }])
  assert.deepEqual(g[3], [{ name: 'y' }, { name: 'z' }])
})

test('turnToolCalls: Kopf ohne User-Entry zählt als ein Turn; leer/null-sicher', () => {
  const g = turnToolCalls([
    { role: 'assistant', toolCalls: [{ name: 'a' }] },
    { role: 'assistant', toolCalls: [{ name: 'b' }] },
  ])
  assert.deepEqual(g[0], [], 'frühere Tool-Entry: suppress')
  assert.equal(g[1].length, 2)
  assert.deepEqual(turnToolCalls([]), [])
  assert.deepEqual(turnToolCalls(null), [])
  const noTools = turnToolCalls([{ role: 'assistant', text: 'x' }])
  assert.deepEqual(noTools, [null])
})
