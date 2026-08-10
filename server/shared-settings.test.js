// ════════════════════════════════════════════════════════════════════
// shared-settings.test.js — tests the shared behavioral-settings loader
// Run: node --test server/shared-settings.test.js
// ════════════════════════════════════════════════════════════════════
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

// Point the loader at a throwaway file so the test doesn't depend on the
// real skaleshare config (or its absence) on any machine.
const TMP = path.join(os.tmpdir(), `aiui-shared-settings-${process.pid}.json`)
process.env.AIUI_SHARED_SETTINGS = TMP

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// The loader caches on file mtime, so ensure distinct mtimes between writes.
async function writeShared(obj) {
  fs.writeFileSync(TMP, JSON.stringify(obj, null, 2))
  await sleep(5)
}

test('sharedRetrySettings: returns the retry block from the shared file', async () => {
  await writeShared({ retry: { maxRetries: 8, baseDelayMs: 2000, provider: { maxRetries: 5 } }, voice: { enabled: true } })
  const { sharedRetrySettings } = await import('./shared-settings.js')
  assert.deepEqual(sharedRetrySettings(), { maxRetries: 8, baseDelayMs: 2000, provider: { maxRetries: 5 } })
})

test('sharedBehavioralSettings: only inherits SHARED_KEYS (not voice/auth/etc.)', async () => {
  await writeShared({ retry: { maxRetries: 3 }, voice: { enabled: true }, packages: ['x'] })
  const { sharedBehavioralSettings } = await import('./shared-settings.js')
  assert.deepEqual(sharedBehavioralSettings(), { retry: { maxRetries: 3 } })
})

test('sharedRetrySettings: undefined when the shared file has no retry', async () => {
  await writeShared({ defaultModel: 'm' })
  const { sharedRetrySettings } = await import('./shared-settings.js')
  assert.equal(sharedRetrySettings(), undefined)
})

test('sharedRetrySettings: empty when the shared file is missing/unreadable', async () => {
  fs.rmSync(TMP, { force: true })
  const { sharedRetrySettings, sharedBehavioralSettings } = await import('./shared-settings.js')
  assert.equal(sharedRetrySettings(), undefined)
  assert.deepEqual(sharedBehavioralSettings(), {})
})

fs.rmSync(TMP, { force: true })
