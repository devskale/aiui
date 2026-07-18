// ════════════════════════════════════════════════════════════════════
// models.test.js — tests the pure list helpers (image-capable + toggles)
// Run: node --test src/lib/models.test.js
// (models.js only touches localStorage inside get/set fns, so it imports
//  cleanly under node:test.)
// ════════════════════════════════════════════════════════════════════
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  toggleModelInList,
  toggleProviderInList,
  flattenModels,
  selectModels,
} from './models.js'

const ALL = ['amd@a', 'amd@b', 'openai@gpt-4o']

// ── toggleModelInList ──

test('toggleModelInList: removing one from "all" yields the rest', () => {
  // null = all; toggle off 'a' → list of the other two
  assert.deepEqual(toggleModelInList('amd@a', null, ALL), ['amd@b', 'openai@gpt-4o'])
})

test('toggleModelInList: re-adding the last removed model collapses to null (all)', () => {
  const selected = ['amd@b', 'openai@gpt-4o']   // 'a' was removed
  assert.equal(toggleModelInList('amd@a', selected, ALL), null)
})

test('toggleModelInList: toggling a non-member adds it', () => {
  assert.deepEqual(toggleModelInList('openai@gpt-4o', ['amd@tu@a'], ALL), ['amd@tu@a', 'openai@gpt-4o'])
})

// ── toggleProviderInList ──

test('toggleProviderInList: turning a whole provider off removes its models', () => {
  // null = all; toggle off the 'amd' provider (ids a, b) → only openai remains
  assert.deepEqual(toggleProviderInList('amd', ['a', 'b'], null, ALL), ['openai@gpt-4o'])
})

test('toggleProviderInList: turning the last-off provider back on collapses to null', () => {
  const selected = ['openai@gpt-4o']   // amd fully removed
  assert.equal(toggleProviderInList('amd', ['a', 'b'], selected, ALL), null)
})

// ── flattenModels sanity (used to build ALL) ──

test('flattenModels: { provider: [ids] } → "provider@id" strings', () => {
  assert.deepEqual(
    flattenModels({ amd: ['a', 'b'] }),
    ['amd@a', 'amd@b'],
  )
})

// ── selectModels (the pure core of useModels) ──

test('selectModels: all flattens providers, visible filters by allow-list, imageModels passes through', () => {
  const data = { providers: { amd: ['a', 'b'], openai: ['gpt'] }, imageModels: ['amd@a', 'openai@gpt'] }
  const r = selectModels(data, ['amd@a'])
  assert.deepEqual(r.all, ['amd@a', 'amd@b', 'openai@gpt'])
  assert.deepEqual(r.visible, ['amd@a'])
  assert.deepEqual(r.imageModels, ['amd@a', 'openai@gpt'])
})

test('selectModels: null/empty allow-list → visible = all', () => {
  const data = { providers: { amd: ['a', 'b'] }, imageModels: [] }
  assert.deepEqual(selectModels(data, null).visible, ['amd@a', 'amd@b'])
  assert.deepEqual(selectModels(data, []).visible, ['amd@a', 'amd@b'])
})

test('selectModels: tolerates missing / malformed input', () => {
  assert.deepEqual(selectModels(null, null), { all: [], visible: [], imageModels: [] })
  assert.deepEqual(selectModels({}, null), { all: [], visible: [], imageModels: [] })
  assert.deepEqual(selectModels({ providers: { amd: ['a'] } }, null).imageModels, [])
})
