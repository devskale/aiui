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

// ── persistente Sessions (Restart-Survival, Hash-only-Storage) ──
const sessionsFile = path.join(dir, '.aiui-sessions.json')

test('issueSession persistiert gehasht — Restart überlebt, roher Token nie auf Platte', async () => {
  const a1 = await import('./auth.js')
  const token = a1.issueSession('hak')
  assert.ok(a1.lookupSession(token), 'live lookup ok')
  const raw = fs.readFileSync(sessionsFile, 'utf8')
  assert.ok(!raw.includes(token), 'raw token NIE in der Datei')
  assert.ok(raw.includes(crypto.createHash('sha256').update(token).digest('hex')), 'hash-key vorhanden')
  // Restart-Simulation: frische Modul-Instanz mit gleichem ENV/Datei
  const a2 = await import('./auth.js?restart=1')
  const s = a2.lookupSession(token)
  assert.ok(s, 'lookup überlebt den Restart')
  assert.equal(s.user, 'hak')
})

test('revokeSession entfernt den Eintrag auch persistent', async () => {
  const a1 = await import('./auth.js?r1')
  const token = a1.issueSession('demo')
  a1.revokeSession(token)
  const a2 = await import('./auth.js?r2')
  assert.equal(a2.lookupSession(token), null, 'nach Restart ebenfalls weg')
})

test('abgelaufene Einträge werden beim Laden entfernt', async () => {
  // Craft: eigener Token + abgelaufener Eintrag in der Datei
  const myToken = 'tok-' + crypto.randomBytes(8).toString('hex')
  const h = crypto.createHash('sha256').update(myToken).digest('hex')
  const now = Date.now()
  const data = JSON.parse(fs.readFileSync(sessionsFile, 'utf8') || '{}')
  data[h] = { user: 'demo', expiresAt: now + 60_000 }
  data['deadbeef'] = { user: 'demo', expiresAt: now - 1000 }
  fs.writeFileSync(sessionsFile, JSON.stringify(data), { mode: 0o600 })
  const a3 = await import('./auth.js?r3')
  assert.equal(a3.lookupSession(myToken)?.user, 'demo', 'gültiger Eintrag überlebt')
  assert.equal(a3.lookupSession('deadbeef-old'), null)
  const after = JSON.parse(fs.readFileSync(sessionsFile, 'utf8'))
  assert.ok(!after['deadbeef'], 'abgelaufener Eintrag aus der Datei geputzt (beim nächsten save)')
})
