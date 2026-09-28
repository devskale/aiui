// ════════════════════════════════════════════════════════════════════
// agent-e2e.test.js — Unit-Tests für die reinen Teile des E2E-Runners
// (foldEvents, evaluateExpectations). Die Cases selbst fahren gegen einen
// echten Server (node scripts/agent-e2e.js) — hier wird nur die Logik gepinnt.
// ════════════════════════════════════════════════════════════════════
import test from 'node:test'
import assert from 'node:assert/strict'
import { foldEvents, evaluateExpectations } from './agent-e2e.js'

// ── foldEvents ─────────────────────────────────────────────────────
test('foldEvents: text_delta häuft sich, thinking zählt Zeichen', () => {
  const f = foldEvents([
    { type: 'message_update', assistantMessageEvent: { type: 'text_delta', delta: 'Brant' } },
    { type: 'message_update', assistantMessageEvent: { type: 'thinking_delta', delta: 'denk' } },
    { type: 'message_update', assistantMessageEvent: { type: 'text_delta', delta: 'ner GmbH' } },
  ])
  assert.equal(f.text, 'Brantner GmbH')
  assert.equal(f.thinkingChars, 4)
})

test('foldEvents: tool-Start/Update/End ergeben einen Tool-Eintrag mit Resultat-Kopf', () => {
  const f = foldEvents([
    { type: 'tool_execution_start', toolName: 'bash', args: { command: 'curl search/rich' } },
    { type: 'tool_execution_update', toolName: 'bash', update: 'läuft' },
    { type: 'tool_execution_end', toolName: 'bash', isError: false, result: { content: [{ type: 'text', text: '{"fn":"475207i"}' }] } },
  ])
  assert.equal(f.tools.length, 1)
  assert.equal(f.tools[0].name, 'bash')
  assert.equal(f.tools[0].resultHead, '{"fn":"475207i"}')
  assert.equal(f.toolErrors, 0)
})

test('foldEvents: error-Events + isError zählen; settled und Model kommen mit', () => {
  const f = foldEvents([
    { type: 'error', message: 'boom' },
    { type: 'tool_execution_end', toolName: 'x', isError: true, result: { content: [{ type: 'text', text: 'nope' }] } },
    { type: 'session_status', model: 'unii@kilo@stepfun/step-3.7-flash:free', agent: 'firmenindex' },
    { type: 'agent_settled' },
  ])
  assert.deepEqual(f.errors, ['boom'])
  assert.equal(f.toolErrors, 1)
  assert.ok(f.settled)
  assert.equal(f.agent, 'firmenindex')
  assert.match(f.model, /stepfun/)
})

// ── evaluateExpectations ───────────────────────────────────────────
const OK_FOLD = {
  text: 'Brantner Österreich GmbH (FN 475207 i), Geschäftsführer: …',
  thinkingChars: 10,
  tools: [
    { name: 'bash', args: { command: 'curl "…?e=lookup%2Fmerged&fn=475207i"' }, resultHead: '{"fn":"475207i"}' },
  ],
  errors: [],
  toolErrors: 0,
  settled: true,
  model: 'unii@kilo@stepfun/step-3.7-flash:free',
  agent: 'firmenindex',
}

test('evaluateExpectations: erfüllte Erwartungen bestehen', () => {
  const v = evaluateExpectations(
    { settled: true, textContains: ['475207', 'geschäftsführer'], toolSubstr: ['lookup%2Fmerged'], modelContains: 'stepfun', toolMax: 5, textMin: 20, durationMax: 200 },
    OK_FOLD, 45_000,
  )
  assert.ok(v.pass, JSON.stringify(v.failures))
})

test('evaluateExpectations: jede Verletzung benennt ihren Grund', () => {
  const v = evaluateExpectations(
    { textContains: ['Strabag'], toolSubstr: ['netzwerk'], toolMax: 0, textMin: 9999, durationMax: 5, modelContains: 'tu@' },
    { ...OK_FOLD, settled: false, errors: ['upstream weg'] }, 90_000,
  )
  assert.ok(!v.pass)
  const joined = v.failures.join(' | ')
  assert.match(joined, /nicht settled/)
  assert.match(joined, /error-Events/)
  assert.match(joined, /Text fehlt "Strabag"/)
  assert.match(joined, /kein Tool-Call mit "netzwerk"/)
  assert.match(joined, /zu viele Tool-Calls/)
  assert.match(joined, /Text zu kurz/)
  assert.match(joined, /zu langsam/)
  assert.match(joined, /enthält nicht "tu@"/)
})

test('evaluateExpectations: textContains ist groß-/kleinschreibungs-agnostisch', () => {
  const v = evaluateExpectations({ textContains: ['BRANTNER'] }, OK_FOLD, 1000)
  assert.ok(v.pass, JSON.stringify(v.failures))
})
