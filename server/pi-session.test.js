// pi-session.test.js — pure helpers from pi-session.js. Run: node --test server/
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { evictIdleContexts, attachMentionedImages, MAX_MENTION_IMAGE_BYTES } from './pi-session.js'

// ── evictIdleContexts ──
test('evict: idle non-streaming contexts are dropped and disposed', () => {
  const now = Date.now()
  let disposed = 0
  const map = new Map([
    ['fresh', { lastUsed: now - 1000, runtime: { session: { isStreaming: false }, dispose: () => { disposed++ } } }],
    ['idle', { lastUsed: now - 25 * 3600 * 1000, runtime: { session: { isStreaming: false }, dispose: () => { disposed++ } } }],
    ['idle-streaming', { lastUsed: now - 25 * 3600 * 1000, runtime: { session: { isStreaming: true }, dispose: () => { disposed++ } } }],
    ['no-runtime', { lastUsed: now - 25 * 3600 * 1000, runtime: null }],
  ])
  const evicted = evictIdleContexts(map, 24 * 3600 * 1000, now)
  assert.deepEqual(evicted.sort(), ['idle', 'no-runtime'])
  assert.ok(map.has('fresh'), 'fresh user kept')
  assert.ok(map.has('idle-streaming'), 'mid-stream user kept even when idle')
  assert.equal(disposed, 1, 'only the evicted runtime was disposed')
})

test('evict: falls back to startedAt when lastUsed is unset', () => {
  const now = Date.now()
  const map = new Map([['old', { startedAt: now - 30 * 3600 * 1000, runtime: null }]])
  assert.deepEqual(evictIdleContexts(map, 24 * 3600 * 1000, now), ['old'])
})

// ── attachMentionedImages ──
test('mention: small workspace image is embedded and its token stripped', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aiui-mention-'))
  const png = path.join(dir, 'pic.png')
  fs.writeFileSync(png, Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4]))
  const images = []
  const out = attachMentionedImages('see @pic.png here', dir, images)
  assert.equal(images.length, 1)
  assert.equal(images[0].type, 'image')
  assert.equal(images[0].mimeType, 'image/png')
  assert.equal(images[0].data, Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4]).toString('base64'))
  assert.equal(out, 'see here')
  fs.rmSync(dir, { recursive: true, force: true })
})

test('mention: oversized image keeps its token instead of being embedded', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aiui-mention-'))
  const big = path.join(dir, 'huge.png')
  fs.writeFileSync(big, Buffer.alloc(MAX_MENTION_IMAGE_BYTES + 1, 1))
  const images = []
  const out = attachMentionedImages('look at @huge.png now', dir, images)
  assert.equal(images.length, 0, 'oversized image not embedded')
  assert.ok(out.includes('@huge.png'), 'token preserved so the model still sees the path')
  fs.rmSync(dir, { recursive: true, force: true })
})

test('mention: missing files and non-image paths keep their tokens', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aiui-mention-'))
  const images = []
  const out = attachMentionedImages('@gone.png and @notes.md stay', dir, images)
  assert.equal(images.length, 0)
  assert.ok(out.includes('@gone.png'))
  fs.rmSync(dir, { recursive: true, force: true })
})
