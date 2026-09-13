// auth.test.js — credential resolution (per-User override vs shared list).
// Run: node --test server/
import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

// Hash helper mirroring scripts/hash-passphrase.js + auth.verifyHash:
// "salt:hash", both hex.
function makeHash(pw) {
  const salt = crypto.randomBytes(16)
  return `${salt.toString('hex')}:${crypto.scryptSync(pw, salt, 32).toString('hex')}`
}

const cfg = {
  users: ['hak', 'demo'],
  passphrases: [makeHash('shared-secret')],
  credentials: { hak: makeHash('hackler26') },
  limits: { demo: 10 },
  models: { include: ['unii@tu@'], notInclude: ['unii@tu@llama*'] },
  userModels: { demo: { include: ['q*'] } },
}
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aiui-auth-'))
const authFile = path.join(dir, 'auth.json')
fs.writeFileSync(authFile, JSON.stringify(cfg))
process.env.AIUI_AUTH_FILE = authFile

const { authEnabled, verifyCredentials, userLimit, modelFilterFor } = await import('./auth.js')

test('per-User credential replaces the shared passphrase for that User', () => {
  assert.equal(verifyCredentials('hak', 'hackler26'), true, 'own password works')
  assert.equal(verifyCredentials('hak', 'shared-secret'), false, 'shared password no longer works for hak')
})

test('Users without an override verify against the shared list', () => {
  assert.equal(verifyCredentials('demo', 'shared-secret'), true)
  assert.equal(verifyCredentials('demo', 'hackler26'), false, 'hak password does not leak to demo')
})

test('unknown users always fail; auth counts credentials as a source; limits intact', () => {
  assert.equal(verifyCredentials('nobody', 'shared-secret'), false)
  assert.equal(authEnabled(), true)
  assert.equal(userLimit('demo'), 10)
  assert.equal(userLimit('hak'), null)
})

test('modelFilterFor: user block replaces the global one, global for the rest', () => {
  assert.deepEqual(modelFilterFor('demo'), { include: ['q*'], notInclude: [] })
  assert.deepEqual(modelFilterFor('hak'), { include: ['unii@tu@'], notInclude: ['unii@tu@llama*'] })
  assert.deepEqual(modelFilterFor(null), { include: ['unii@tu@'], notInclude: ['unii@tu@llama*'] })
})

// Cleanup after the tests ran — top-level rmSync would delete the config
// before the deferred test callbacks execute.
after(() => fs.rmSync(dir, { recursive: true, force: true }))
