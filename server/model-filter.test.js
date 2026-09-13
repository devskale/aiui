// model-filter.test.js — include / notInclude pattern semantics. Run: node --test server/
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { patternsOf, modelAllowed, filterModels } from './model-filter.js'

const CATALOG = [
  { provider: 'unii@tu', id: 'qwen-3.6-35b-vllm' },
  { provider: 'unii@tu', id: 'qwen-3.6-35b' },
  { provider: 'unii@tu', id: 'llama-4-70b' },
  { provider: 'openai-codex', id: 'gpt-6-astra' },
]

const allowed = (filter, provider, id) => modelAllowed(filter, `${provider}@${id}`, id)

test('patternsOf: normalizes strings, arrays, wildcards, empties', () => {
  assert.deepEqual(patternsOf('unii@tu@'), ['unii@tu@'])
  assert.deepEqual(patternsOf(['unii@tu@qwen*', ' x ']), ['unii@tu@qwen', 'x'])
  assert.deepEqual(patternsOf(undefined), [])
  assert.deepEqual(patternsOf(['', '  ']), [])
})

test('exact model id matches precisely (and is a prefix of itself)', () => {
  const f = { include: ['unii@tu@qwen-3.6-35b-vllm'], notInclude: [] }
  assert.ok(allowed(f, 'unii@tu', 'qwen-3.6-35b-vllm'))
  assert.ok(!allowed(f, 'unii@tu', 'llama-4-70b'))
})

test('provider prefix "unii@tu@" lets every model of that provider through', () => {
  const f = { include: ['unii@tu@'], notInclude: [] }
  assert.ok(allowed(f, 'unii@tu', 'qwen-3.6-35b-vllm'))
  assert.ok(allowed(f, 'unii@tu', 'llama-4-70b'))
  assert.ok(!allowed(f, 'openai-codex', 'gpt-6-astra'))
})

test('wildcard prefix "unii@tu@qwen*" matches only qwen models there', () => {
  const f = { include: ['unii@tu@qwen*'], notInclude: [] }
  assert.ok(allowed(f, 'unii@tu', 'qwen-3.6-35b'))
  assert.ok(allowed(f, 'unii@tu', 'qwen-3.6-35b-vllm'))
  assert.ok(!allowed(f, 'unii@tu', 'llama-4-70b'))
  assert.ok(!allowed(f, 'openai-codex', 'gpt-6-astra'))
})

test('bare model id fallback: "qwen*" works when ids are unique', () => {
  const f = { include: ['qwen*'], notInclude: [] }
  assert.ok(allowed(f, 'unii@tu', 'qwen-3.6-35b'))
  assert.ok(!allowed(f, 'unii@tu', 'llama-4-70b'))
})

test('notInclude wins over include', () => {
  const f = { include: ['unii@tu@'], notInclude: ['unii@tu@llama*'] }
  assert.ok(allowed(f, 'unii@tu', 'qwen-3.6-35b'))
  assert.ok(!allowed(f, 'unii@tu', 'llama-4-70b'))
})

test('empty include = everything, minus notInclude', () => {
  const f = { include: [], notInclude: ['openai-codex@'] }
  assert.ok(allowed(f, 'unii@tu', 'qwen-3.6-35b'))
  assert.ok(!allowed(f, 'openai-codex', 'gpt-6-astra'))
})

test('filterModels filters the catalog, preserving order', () => {
  const f = { include: ['unii@tu@qwen*'], notInclude: ['unii@tu@qwen-3.6-35b-vllm'] }
  assert.deepEqual(filterModels(CATALOG, f), [{ provider: 'unii@tu', id: 'qwen-3.6-35b' }])
  assert.deepEqual(filterModels(CATALOG, { include: [], notInclude: [] }), CATALOG)
})
