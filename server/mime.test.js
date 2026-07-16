// ════════════════════════════════════════════════════════════════════
// mime.test.js — tests the mime interface directly
// Run: node --test server/mime.test.js
// ════════════════════════════════════════════════════════════════════
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mimeFor, isImage } from './mime.js'

// ── mimeFor ──

test('mimeFor: ext → mime', () => {
  assert.equal(mimeFor('png'), 'image/png')
  assert.equal(mimeFor('jpg'), 'image/jpeg')
  assert.equal(mimeFor('jpeg'), 'image/jpeg')
  assert.equal(mimeFor('gif'), 'image/gif')
  assert.equal(mimeFor('webp'), 'image/webp')
})

test('mimeFor: tolerates leading dot and any case', () => {
  assert.equal(mimeFor('.PNG'), 'image/png')
  assert.equal(mimeFor('Jpg'), 'image/jpeg')
  assert.equal(mimeFor('.webp'), 'image/webp')
})

test('mimeFor: unknown / missing / falsy → null', () => {
  assert.equal(mimeFor('bmp'), null)       // intentionally excluded
  assert.equal(mimeFor('heic'), null)
  assert.equal(mimeFor('pdf'), null)
  assert.equal(mimeFor(''), null)
  assert.equal(mimeFor(null), null)
  assert.equal(mimeFor(undefined), null)
})

// ── isImage ──

test('isImage: true for every mime the table produces', () => {
  assert.equal(isImage('image/png'), true)
  assert.equal(isImage('image/jpeg'), true)
  assert.equal(isImage('image/gif'), true)
  assert.equal(isImage('image/webp'), true)
})

test('isImage: false for non-table mimes and falsy', () => {
  assert.equal(isImage('image/bmp'), false)   // the drift is dead
  assert.equal(isImage('image/heic'), false)
  assert.equal(isImage('application/pdf'), false)
  assert.equal(isImage(null), false)
  assert.equal(isImage(''), false)
})

// ── the anti-drift guarantee (the whole point of candidate #3) ──

test('isImage is derived from mimeFor: they agree for every table ext', () => {
  for (const ext of ['png', 'jpg', 'jpeg', 'gif', 'webp']) {
    const m = mimeFor(ext)
    assert.equal(isImage(m), true, `${ext} → ${m} must be an image`)
  }
  // And the reverse: if mimeFor can't resolve it, isImage won't either.
  assert.equal(isImage(mimeFor('bmp')), false)
  assert.equal(isImage(mimeFor('heic')), false)
})
