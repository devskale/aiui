// ════════════════════════════════════════════════════════════════════
// draft-store.test.js — tests the draft persistence helpers.
// Run: node --test src/lib/draft-store.test.js
// (localStorage is mocked on globalThis so the store imports cleanly under
//  node:test.)
// ════════════════════════════════════════════════════════════════════
import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { draftKey, saveDraft, loadDraft, clearDraft } from './draft-store.js'

// In-memory localStorage mock (node:test has no DOM).
const store = new Map()
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
}

beforeEach(() => store.clear())

test('draftKey: namespaced per user + session, sanitized', () => {
  assert.equal(draftKey('alice', 'sess-1'), 'aiui-draft:alice:sess-1')
  // unsafe chars are replaced so the key stays a valid localStorage key
  assert.equal(draftKey('a/b', 's:1'), 'aiui-draft:a_b:s_1')
})

test('draftKey: falls back to "new" when no session yet', () => {
  assert.equal(draftKey('alice', null), 'aiui-draft:alice:new')
  assert.equal(draftKey('alice', undefined), 'aiui-draft:alice:new')
})

test('save/load round-trips a draft', () => {
  const key = draftKey('alice', 'sess-1')
  saveDraft(key, 'half-typed prompt')
  assert.equal(loadDraft(key), 'half-typed prompt')
})

test('saveDraft with empty/whitespace text removes the entry', () => {
  const key = draftKey('alice', 'sess-1')
  saveDraft(key, 'something')
  saveDraft(key, '')
  assert.equal(loadDraft(key), '')
  saveDraft(key, '   ')
  assert.equal(loadDraft(key), '')
})

test('clearDraft removes the entry', () => {
  const key = draftKey('alice', 'sess-1')
  saveDraft(key, 'text')
  clearDraft(key)
  assert.equal(loadDraft(key), '')
})

test('drafts are scoped per session — sessions do not collide', () => {
  saveDraft(draftKey('alice', 'sess-1'), 'draft one')
  saveDraft(draftKey('alice', 'sess-2'), 'draft two')
  assert.equal(loadDraft(draftKey('alice', 'sess-1')), 'draft one')
  assert.equal(loadDraft(draftKey('alice', 'sess-2')), 'draft two')
})

test('loadDraft returns "" for a missing key', () => {
  assert.equal(loadDraft(draftKey('alice', 'sess-1')), '')
})
