// ════════════════════════════════════════════════════════════════════
// sandbox.test.js — tests the Sandbox interface directly
// Run: node --test server/sandbox.test.js
// ════════════════════════════════════════════════════════════════════
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { assertInside, createTools } from './sandbox.js'

const WS = '/tmp/ws'

// ── assertInside (the path guard — the load-bearing logic) ──

test('assertInside: path inside the base is allowed (no throw)', () => {
  assert.doesNotThrow(() => assertInside(WS, '/tmp/ws/sub/file.txt'))
  assert.doesNotThrow(() => assertInside(WS, '/tmp/ws'))            // base itself
  assert.doesNotThrow(() => assertInside(WS, '/tmp/ws/a/b/c'))
})

test('assertInside: sibling/parent path throws', () => {
  assert.throws(() => assertInside(WS, '/tmp/secret'), /outside workspace/)
  assert.throws(() => assertInside(WS, '/etc/passwd'), /outside workspace/)
  assert.throws(() => assertInside(WS, '/tmp'), /outside workspace/)
})

test('assertInside: relative escape via .. throws', () => {
  assert.throws(() => assertInside(WS, '/tmp/ws/../secret'), /outside workspace/)
  assert.throws(() => assertInside(WS, '/tmp/ws/../../etc'), /outside workspace/)
})

test('assertInside: works on nonexistent paths (realpath climbs to the deepest existing ancestor)', () => {
  assert.throws(() => assertInside('/tmp/ws', '/tmp/ws/../etc/shadow'), /outside workspace/)
  assert.doesNotThrow(() => assertInside('/tmp/ws', '/tmp/ws/deeply/nested/ghost'))
})

test('assertInside: symlink to outside is denied (realpath pass)', () => {
  const ws = fs.mkdtempSync(path.join(os.tmpdir(), 'aiui-guard-ws-'))
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'aiui-guard-out-'))
  fs.writeFileSync(path.join(outside, 'secret.txt'), 'x')
  fs.symlinkSync(outside, path.join(ws, 'leak'))
  fs.mkdirSync(path.join(ws, 'sub'))
  assert.doesNotThrow(() => assertInside(ws, path.join(ws, 'sub')), 'real dir still fine')
  assert.throws(() => assertInside(ws, path.join(ws, 'leak', 'secret.txt')), /outside workspace/,
    'read through symlink → denied')
  assert.throws(() => assertInside(ws, path.join(ws, 'leak', 'newfile.txt')), /outside workspace/,
    'missing tail through symlink → denied (climb lands on the real target)')
  assert.doesNotThrow(() => assertInside(ws, path.join(ws, 'sub', 'newfile.txt')),
    'missing tail inside the workspace → fine (write target)')
  fs.rmSync(ws, { recursive: true, force: true })
  fs.rmSync(outside, { recursive: true, force: true })
})

test('assertInside: message names the denied path', () => {
  try {
    assertInside(WS, '/etc/passwd')
    assert.fail('should have thrown')
  } catch (err) {
    assert.match(err.message, /\/etc\/passwd/)
  }
})

// ── createTools (the off-switch) ──

test('createTools: returns undefined when AIUI_SANDBOX=0', () => {
  const saved = process.env.AIUI_SANDBOX
  process.env.AIUI_SANDBOX = '0'
  try {
    assert.equal(createTools('/tmp/irrelevant'), undefined)
  } finally {
    process.env.AIUI_SANDBOX = saved
  }
})

// Note: the enabled path (returns 4 tools) writes a seatbelt profile and
// `git init`s the workspace — real fs side effects we don't mock here. The
// off-switch + assertInside cover the pure, load-bearing logic; the enabled
// path is exercised live by `pnpm dev:server` (see the "sandbox ON" log).
