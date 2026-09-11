// agents.test.js — Agent catalog (ADR-0004). Run: node server/agents.test.js
import assert from 'node:assert/strict'
import { listAgents, getAgent, requireAgent, DEFAULT_AGENT } from './agents.js'

// ── Catalog shape ──
const ids = listAgents().map(a => a.id)
assert.ok(ids.includes('default'), 'default agent present')
assert.ok(ids.includes('english-teacher'), 'english-teacher present')
assert.ok(ids.includes('deutsch'), 'deutsch present')

// Metadata only — no prompt bodies in the list payload.
for (const a of listAgents()) {
  assert.equal(a.systemPrompt, undefined)
  assert.equal(a.skillPaths, undefined)
  assert.equal(a.extensionPaths, undefined)
}

// ── Full defs ──
const teacher = getAgent('english-teacher')
assert.ok(teacher.systemPrompt.includes('English teacher'), 'persona body parsed')
assert.equal(teacher.stt, true)
assert.equal(teacher.sttLanguage, 'auto', 'auto-detect (kid may mix DE/EN)')
assert.equal(teacher.tts, true, 'spoken answers')
assert.equal(teacher.model, 'unii@tu@qwen-3.6-35b', 'vision model pin (worksheet photos)')
assert.equal(teacher.skillPaths.length, 1, 'carries its skills dir')

const deutsch = getAgent('deutsch')
assert.ok(deutsch.systemPrompt.length > 50, 'persona body parsed')
assert.equal(deutsch.stt, false)
assert.equal(deutsch.tts, false)
assert.equal(deutsch.model, 'unii@tu@qwen-3.6-35b', 'model pin parsed')
assert.ok(deutsch.extensionPaths.length === 0, 'pdf-tools moved to baseline (no carried extensions)')

// ── Fallbacks ──
assert.equal(getAgent('does-not-exist'), DEFAULT_AGENT)
assert.equal(getAgent(null), DEFAULT_AGENT)
assert.throws(() => requireAgent('does-not-exist'), /Unknown agent/)
assert.equal(requireAgent('default'), DEFAULT_AGENT)

console.log('agents.test.js ✓')
