import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseCanvas } from './canvas-parse.js'

const MIN = JSON.stringify({ canvas: 1 })

test('minimal valid file: only the version field', () => {
  const r = parseCanvas(MIN)
  assert.equal(r.canvas, 1)
  assert.deepEqual(r.progress, [])
  assert.deepEqual(r.cards, [])
  assert.deepEqual(r.gaps, [])
  assert.deepEqual(r.next, [])
  assert.equal(r.report, null)
})

test('full file normalizes progress states and caps lengths', () => {
  const r = parseCanvas(JSON.stringify({
    canvas: 1,
    title: 'STRABAG SE',
    subtitle: 'Wer kontrolliert die STRABAG SE?',
    progress: [
      { label: '① Stammdaten', state: 'done', note: 'FN 88983h' },
      { label: '② Eigentümer', state: 'running' },
      { label: '③ Bilanzen', state: 'kaputt' },          // unbekannt → pending
      '④ Report',                                          // String → pending
    ],
    cards: [{ type: 'profile', title: 'STRABAG SE', data: { FN: '88983h' }, source: 'rohdaten/x.json' }],
    gaps: ['Anteile nicht öffentlich'],
    next: ['→ Konzernabschluss 2024 ziehen?'],
    report: 'report.md',
  }))
  assert.equal(r.title, 'STRABAG SE')
  assert.deepEqual(r.progress.map((p) => p.state), ['done', 'running', 'pending', 'pending'])
  assert.equal(r.progress[3].label, '④ Report')
  assert.equal(r.cards[0].type, 'profile')
  assert.equal(r.cards[0].source, 'rohdaten/x.json')
  assert.deepEqual(r.next, ['→ Konzernabschluss 2024 ziehen?'])
  assert.equal(r.report, 'report.md')
})

test('wrong major version → unsupported + raw', () => {
  const r = parseCanvas(JSON.stringify({ canvas: 2, title: 'x' }))
  assert.ok(r.unsupported)
  assert.ok(r.raw.includes('"canvas":2'))
})

test('non-object / array → unsupported', () => {
  assert.ok(parseCanvas('[1,2]').unsupported)
  assert.ok(parseCanvas('"hello"').unsupported)
  assert.ok(parseCanvas('null').unsupported)
})

test('broken JSON → parseError + raw head', () => {
  const r = parseCanvas('{"canvas":1, "title": "x"')
  assert.ok(r.parseError)
  assert.ok(r.raw.startsWith('{"canvas"'))
})

test('empty / wrong type → null', () => {
  assert.equal(parseCanvas(''), null)
  assert.equal(parseCanvas('   '), null)
  assert.equal(parseCanvas(null), null)
  assert.equal(parseCanvas(undefined), null)
})

test('caps: overlong lists are truncated', () => {
  const r = parseCanvas(JSON.stringify({
    canvas: 1,
    next: Array.from({ length: 20 }, (_, i) => `→ F${i}?`),
    cards: Array.from({ length: 150 }, () => ({ type: 'x' })),
  }))
  assert.equal(r.next.length, 8)
  assert.equal(r.cards.length, 100)
})

test('weird card shapes still normalize (generic fallbacks render them)', () => {
  const r = parseCanvas(JSON.stringify({ canvas: 1, cards: [null, 42, { type: 'profile' }] }))
  assert.deepEqual(r.cards.map((c) => c.type), ['string', 'string', 'profile'])
  assert.equal(r.cards[1].data, '42')
})
