import { test } from 'node:test'
import assert from 'node:assert/strict'
import { MAX_ATTACHMENTS, enforceAttachmentLimit } from './attachment-limit.js'

test('accepts everything when under the cap', () => {
  const r = enforceAttachmentLimit(0, 3)
  assert.deepEqual(r, { accepted: 3, rejected: 0, limit: MAX_ATTACHMENTS })
})

test('fills remaining room exactly at the cap', () => {
  const r = enforceAttachmentLimit(7, 5) // room = 3
  assert.deepEqual(r, { accepted: 3, rejected: 2, limit: MAX_ATTACHMENTS })
})

test('rejects everything when already at the cap', () => {
  const r = enforceAttachmentLimit(MAX_ATTACHMENTS, 4)
  assert.deepEqual(r, { accepted: 0, rejected: 4, limit: MAX_ATTACHMENTS })
})

test('handles over-limit existing count (defensive)', () => {
  const r = enforceAttachmentLimit(15, 2)
  assert.deepEqual(r, { accepted: 0, rejected: 2, limit: MAX_ATTACHMENTS })
})

test('handles non-finite / negative inputs defensively', () => {
  assert.deepEqual(enforceAttachmentLimit(NaN, 2), { accepted: 2, rejected: 0, limit: MAX_ATTACHMENTS })
  assert.deepEqual(enforceAttachmentLimit(-3, 2), { accepted: 2, rejected: 0, limit: MAX_ATTACHMENTS })
  assert.deepEqual(enforceAttachmentLimit(0, NaN), { accepted: 0, rejected: 0, limit: MAX_ATTACHMENTS })
})

test('zero incoming → nothing accepted', () => {
  assert.deepEqual(enforceAttachmentLimit(0, 0), { accepted: 0, rejected: 0, limit: MAX_ATTACHMENTS })
})
