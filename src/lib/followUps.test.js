// Unit tests for the trailing follow-up parser (src/lib/followUps.js).
// Pure function — replay-safe, no DOM, no fetch.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseFollowUps } from './followUps.js'

const TAIL = `**Kernaussagen**

Hier steht der Bericht.

**Nicht gefunden / Lücken**

- nichts Öffentliches zu X

**Mögliche Vertiefungen**

- → Konzernabschluss 2024 (PDF) ziehen und auswerten?
- → Steuerliche Sondereffekte im Lagebericht nachvollziehen?
`

test('parses a clean tail section and strips it from the body', () => {
  const r = parseFollowUps(TAIL)
  assert.ok(r)
  assert.equal(r.questions.length, 2)
  assert.equal(r.questions[0], 'Konzernabschluss 2024 (PDF) ziehen und auswerten?')
  assert.equal(r.questions[1], 'Steuerliche Sondereffekte im Lagebericht nachvollziehen?')
  assert.ok(!r.bodyText.includes('Vertiefung'), 'section is removed from the body')
  assert.ok(r.bodyText.includes('Kernaussagen'), 'report body is kept')
})

test('accepts heading variants: ##, colon, bold Folgefragen', () => {
  for (const h of ['## Mögliche Vertiefungen', 'Mögliche Vertiefungen:', '**Folgefragen**', '**Mögliche Vertiefungen:**']) {
    const r = parseFollowUps(`${h}\n→ A?\n→ B?`)
    assert.ok(r, `heading did not parse: ${h}`)
    assert.deepEqual(r.questions, ['A?', 'B?'])
  }
})

test('accepts item variants: no marker, bullets, numbers, bold', () => {
  const r = parseFollowUps('**Mögliche Vertiefungen**\n→ Eins?\n- → Zwei?\n* → Drei?\n1. → Vier?\n2) → Fünf?\n- **→ Sechs?**')
  assert.deepEqual(r.questions, ['Eins?', 'Zwei?', 'Drei?', 'Vier?', 'Fünf?', 'Sechs?'])
})

test('arrow prose without a heading section → null', () => {
  assert.equal(parseFollowUps('Plan: Frage → Quelle → Ergebnis\n→ mehr Prosa'), null)
})

test('prose after the section → null (degrade, nothing is lost)', () => {
  assert.equal(parseFollowUps('**Mögliche Vertiefungen**\n- → A?\n\nSag einfach Bescheid.'), null)
})

test('heading-like words inside a prose sentence do not match', () => {
  assert.equal(parseFollowUps('Mögliche Vertiefungen gibt es mehrere\n- → A?'), null)
})

test('no match / empty / null → null', () => {
  assert.equal(parseFollowUps('Ganz normale Antwort ohne Pfeile.'), null)
  assert.equal(parseFollowUps(''), null)
  assert.equal(parseFollowUps(null), null)
  assert.equal(parseFollowUps(undefined), null)
})

test('blank lines between items are fine', () => {
  const r = parseFollowUps('**Mögliche Vertiefungen**\n\n- → A?\n\n- → B?\n')
  assert.deepEqual(r.questions, ['A?', 'B?'])
})

test('caps at 8 questions', () => {
  const qs = Array.from({ length: 12 }, (_, i) => `- → F${i}?`).join('\n')
  const r = parseFollowUps(`**Mögliche Vertiefungen**\n${qs}`)
  assert.equal(r.questions.length, 8)
})

test('drops a trailing hr that only separated the section', () => {
  const r = parseFollowUps('Bericht.\n\n---\n\n**Mögliche Vertiefungen**\n- → A?')
  assert.ok(!/---/.test(r.bodyText), 'hr before the section is stripped')
  assert.ok(r.bodyText.endsWith('Bericht.'))
})

test('last heading wins when several sections match', () => {
  const r = parseFollowUps('**Folgefragen**\n- → alt?\n\nText.\n\n**Mögliche Vertiefungen**\n- → neu?')
  assert.deepEqual(r.questions, ['neu?'])
  assert.ok(r.bodyText.includes('→ alt?'), 'the older section stays in the body')
})

test('a heading with zero items → null', () => {
  assert.equal(parseFollowUps('Bericht.\n\n**Mögliche Vertiefungen**'), null)
})
