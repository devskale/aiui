// ask.test.js — human-in-the-loop Tool: Parken, Antworten, Abort, Timeout.
import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { createAskTool, resolveAsk, abortAsks, pendingAskCount, _resetAskForTest, ASK_SCHEMA } from './ask.js'

const events = []
const bus = { push: (type, data) => events.push({ type, data }) }
const tool = createAskTool('user:test', bus, { timeoutMs: 60_000 })

beforeEach(() => { events.length = 0; _resetAskForTest() })

test('Schema: 1–4 Fragen, question Pflicht — Hand-TSchema ohne TypeBox-Dep', () => {
  assert.equal(ASK_SCHEMA.required[0], 'questions')
  const q = ASK_SCHEMA.properties.questions
  assert.equal(q.minItems, 1)
  assert.equal(q.maxItems, 4)
  assert.ok(q.items.required.includes('question'))
})

test('execute parkt + pusht ask-Event; resolveAsk bringt die Antwort als Tool-Result', async () => {
  const p = tool.execute('tc1', { questions: [{ question: 'Which database?', choices: ['postgres', 'sqlite'] }] })
  await Promise.resolve() // execute bis zum Parken laufen lassen
  assert.equal(events.length, 1)
  assert.equal(events[0].type, 'ask')
  assert.ok(events[0].data.id)
  assert.equal(pendingAskCount('user:test'), 1)
  assert.equal(resolveAsk('user:test', events[0].data.id, ['sqlite']), true)
  const result = await p
  assert.ok(result.content[0].text.includes('Which database? → sqlite'))
  assert.equal(result.details.answered, true)
  assert.equal(pendingAskCount('user:test'), 0)
})

test('unbekannte/fremde id → resolveAsk false; Garbage-Fragen → sofortiges Result', async () => {
  assert.equal(resolveAsk('user:test', 'nope', ['x']), false)
  const r = await tool.execute('tc2', { questions: [{ choices: ['a'] }] }) // ohne question
  assert.ok(r.content[0].text.includes('no valid question'))
})

test('abort des Runs löst geparkte Asks mit Hinweis auf (kein hängender Turn)', async () => {
  const p = tool.execute('tc3', { questions: [{ question: 'Continue?' }] })
  await Promise.resolve()
  assert.equal(abortAsks('user:test'), 1)
  const result = await p
  assert.ok(result.content[0].text.includes('aborted'))
  assert.equal(result.details.answered, false)
})

test('Scopes sind getrennt — Antwort des fremden Users erreicht das Park nicht', async () => {
  const other = createAskTool('user:other', bus, { timeoutMs: 60_000 })
  const p = tool.execute('tc4', { questions: [{ question: 'Mine?' }] })
  await Promise.resolve()
  assert.equal(resolveAsk('user:other', events[0].data.id, ['x']), false, 'falscher Scope')
  assert.equal(pendingAskCount('user:test'), 1)
  resolveAsk('user:test', events[0].data.id, ['ok'])
  await p
})
