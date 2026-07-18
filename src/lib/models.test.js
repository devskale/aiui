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
