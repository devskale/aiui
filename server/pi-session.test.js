// pi-session.test.js — pure helpers from pi-session.js. Run: node --test server/
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { evictIdleContexts, attachMentionedImages, MAX_MENTION_IMAGE_BYTES, readModelPref, rememberModel, assertSessionPath, mergeDirInto, sweepVisitorDirs } from './pi-session.js'

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

// ── last-used model sidecar ──
test('model pref: remember/read roundtrip, malformed file → null', () => {
  const agentDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aiui-pref-'))
  const ctx = { agentDir }
  assert.equal(readModelPref(ctx), null, 'no file yet')
  rememberModel(ctx, { provider: 'zai', id: 'glm-5.3' })
  assert.deepEqual(readModelPref(ctx), { provider: 'zai', id: 'glm-5.3' })
  rememberModel(ctx, { provider: 'unii', id: 'tu@qwen-3.6-35b' })
  assert.deepEqual(readModelPref(ctx), { provider: 'unii', id: 'tu@qwen-3.6-35b' }, 'latest wins')
  fs.writeFileSync(path.join(agentDir, '.aiui-model.json'), '{broken')
  assert.equal(readModelPref(ctx), null, 'corrupt file tolerated')
  rememberModel(ctx, null)
  rememberModel(ctx, { id: 'no-provider' })
  assert.equal(readModelPref(ctx), null, 'invalid remembers ignored')
  fs.rmSync(agentDir, { recursive: true, force: true })
})

// ── session path guard (rename/delete/switch share it) ──
test('assertSessionPath: accepts own sessionDir .jsonl, rejects cross-user/traversal/non-jsonl', () => {
  const ctx = { sessionDir: '/ws/alice/sessions' }
  assert.equal(assertSessionPath(ctx, '/ws/alice/sessions/abc.jsonl'), '/ws/alice/sessions/abc.jsonl')
  assert.equal(assertSessionPath(ctx, '/ws/alice/sessions/./x/../y.jsonl'), '/ws/alice/sessions/y.jsonl')
  assert.throws(() => assertSessionPath(ctx, '/ws/bob/sessions/x.jsonl'), /invalid session path/)
  assert.throws(() => assertSessionPath(ctx, '/ws/alice/sessions/../../bob/sessions/x.jsonl'), /invalid session path/)
  assert.throws(() => assertSessionPath(ctx, '/ws/alice/sessions/notes.txt'), /invalid session path/)
  assert.throws(() => assertSessionPath(ctx, '/ws/alice/sessions-evil/x.jsonl'), /invalid session path/, 'prefix must end at a dir boundary')
})

// ── mergeDirInto (legacy workspace migration at login) ──
test('mergeDirInto: moves non-colliding entries, recurses into shared dirs, canonical wins collisions', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aiui-merge-'))
  const from = path.join(root, 'legacy')
  const to = path.join(root, 'canonical')
  fs.mkdirSync(path.join(from, 'sessions'), { recursive: true })
  fs.mkdirSync(path.join(to, 'sessions'), { recursive: true })
  fs.writeFileSync(path.join(from, 'sessions', 'a.jsonl'), 'A')
  fs.writeFileSync(path.join(from, 'sessions', 'b.jsonl'), 'B-legacy')
  fs.writeFileSync(path.join(to, 'sessions', 'b.jsonl'), 'B-canonical')
  fs.writeFileSync(path.join(from, 'upload.pdf'), 'PDF')
  mergeDirInto(from, to)
  assert.equal(fs.readFileSync(path.join(to, 'sessions', 'a.jsonl'), 'utf8'), 'A', 'non-colliding file moved')
  assert.equal(fs.readFileSync(path.join(to, 'sessions', 'b.jsonl'), 'utf8'), 'B-canonical', 'collision: canonical copy wins')
  assert.equal(fs.readFileSync(path.join(to, 'upload.pdf'), 'utf8'), 'PDF', 'top-level file moved')
  assert.deepEqual(fs.readdirSync(path.join(from, 'sessions')), ['b.jsonl'], 'only the collision stays in legacy')
  fs.rmSync(root, { recursive: true, force: true })
})

test('mergeDirInto: drops the legacy dir once empty; missing source is a no-op', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aiui-merge-'))
  const from = path.join(root, 'legacy')
  const to = path.join(root, 'canonical')
  fs.mkdirSync(from, { recursive: true })
  fs.writeFileSync(path.join(from, 'notes.md'), 'x')
  mergeDirInto(from, to)
  assert.ok(fs.readFileSync(path.join(to, 'notes.md'), 'utf8') === 'x')
  assert.ok(!fs.existsSync(from), 'fully drained legacy dir removed')
  mergeDirInto(path.join(root, 'never-existed'), to) // must not throw
  fs.rmSync(root, { recursive: true, force: true })
})

// ── sweepVisitorDirs (ADR-0006 D2: old visitor dirs) ──
test('sweepVisitorDirs: drops stale visitor dirs, keeps fresh ones and main workspaces', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aiui-sweep-'))
  const stale = path.join(root, 'w-demo-aaaa1111', 'visitors', 'v-old')
  const fresh = path.join(root, 'w-demo-aaaa1111', 'visitors', 'v-new')
  fs.mkdirSync(path.join(stale, 'sessions'), { recursive: true })
  fs.mkdirSync(path.join(fresh, 'sessions'), { recursive: true })
  fs.writeFileSync(path.join(stale, 'sessions', 'a.jsonl'), 'old')
  fs.writeFileSync(path.join(fresh, 'sessions', 'b.jsonl'), 'new')
  const old = new Date(Date.now() - 8 * 24 * 3600 * 1000)
  fs.utimesSync(path.join(stale, 'sessions', 'a.jsonl'), old, old)
  fs.utimesSync(path.join(stale, 'sessions'), old, old)
  fs.utimesSync(stale, old, old)
  const home = path.join(root, 'w-demo-aaaa1111', 'uploads')
  fs.mkdirSync(home, { recursive: true })
  fs.writeFileSync(path.join(home, 'x.pdf'), 'kept')
  const removed = sweepVisitorDirs(root, 7 * 24 * 3600 * 1000)
  assert.ok(!fs.existsSync(stale), 'stale visitor dir removed (recursive newest mtime)')
  assert.ok(fs.existsSync(fresh), 'fresh visitor dir kept')
  assert.ok(fs.existsSync(path.join(home, 'x.pdf')), 'main workspace untouched')
  assert.equal(removed.length, 1)
  fs.rmSync(root, { recursive: true, force: true })
})
