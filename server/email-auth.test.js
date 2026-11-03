// email-auth.test.js — registration flow invariants (dry-run mailer, tmp users file).
// Import-order discipline (same as auth.test.js): env FIRST, then dynamic
// import — a static import would run email-auth.js before AIUI_USERS_FILE is
// set and the tests would write the real ~/.aiui-users.json.
import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'aiui-users-'))
const USERS = path.join(TMP, 'users.json')
process.env.AIUI_USERS_FILE = USERS
process.env.AIUI_INVITE_CODES = 'TESTCODE'
process.env.PUBLIC_URL = 'https://skale.dev/aiui'
// Dry-run battery: dry-run sends consume budget too (mailer wall behaves
// identically in dev/tests) — this file fires ~10 sends, which would trip the
// default 10/minute cap. Budget semantics are tested in mailer.test.js.
process.env.MAIL_PER_MINUTE = '100'
delete process.env.SMTP_HOST; delete process.env.SMTP_USER; delete process.env.SMTP_PASS; delete process.env.MAIL_FROM

const m = await import('./email-auth.js')
const {
  _resetEmailAuthForTest, normalizeEmail, hashPassphrase, registeredUserFor, registeredUserLimit,
  registerUser, verifyRegistration, resendVerification, requestReset, consumeReset, registrationMode, noteRegisterAttempt,
} = m

beforeEach(() => {
  delete process.env.REGISTRATION_MODE
  delete process.env.REGISTER_DAILY_MAX
  try { fs.unlinkSync(USERS) } catch { }
  _resetEmailAuthForTest()
})

test('canonicalization: whole address lowered for the key, original kept, junk rejected', () => {
  const n = normalizeEmail('  Foo.Bar@X.IO ')
  assert.equal(n.norm, 'foo.bar@x.io') // provider-agnostic case-fold; NOT dot-folding
  assert.equal(n.original, 'Foo.Bar@X.IO')
  assert.ok(n.ok)
  assert.equal(normalizeEmail('nope'), null)
  assert.ok(!normalizeEmail('a@b').ok) // no TLD — object, but not ok
  assert.ok(!normalizeEmail('a @b.io').ok)
})

test('register happy path: created, pending, quota 5, found via normalized email', async () => {
  const r = await registerUser({ email: 'User@Example.io', passphrase: 'longenough1', inviteCode: 'TESTCODE', ip: '1.1.1.1' })
  assert.equal(r.status, 'created')
  const u = registeredUserFor('user@example.IO') // any case reaches the same account
  assert.equal(u.status, 'pending')
  assert.equal(registeredUserLimit('user@example.io'), 5)
  assert.equal(registeredUserLimit('any@else.io'), undefined)
  const disk = JSON.parse(fs.readFileSync(USERS, 'utf-8'))
  assert.equal(disk.users.length, 1)
  assert.equal(disk.users[0].email, 'User@Example.io') // original preserved for mail
  assert.equal(disk.tokens.length, 1) // verify token persisted (hashed)
  assert.equal(disk.tokens[0].hash.length, 64)
})

test('register guards: invite, weak passphrase, bad email, closed mode', async () => {
  assert.equal((await registerUser({ email: 'a@b.io', passphrase: 'longenough1', inviteCode: 'WRONG', ip: '2.2.2.2' })).status, 'bad-invite')
  assert.equal((await registerUser({ email: 'a@b.io', passphrase: 'short', inviteCode: 'TESTCODE', ip: '2.2.2.2' })).status, 'weak-passphrase')
  assert.equal((await registerUser({ email: 'notanemail', passphrase: 'longenough1', inviteCode: 'TESTCODE', ip: '2.2.2.2' })).status, 'invalid-email')
  process.env.REGISTRATION_MODE = 'closed'
  assert.equal((await registerUser({ email: 'a@b.io', passphrase: 'longenough1', inviteCode: 'TESTCODE', ip: '2.2.2.2' })).status, 'closed')
  assert.equal(registrationMode(), 'closed')
})

test('open mode needs no invite code', async () => {
  process.env.REGISTRATION_MODE = 'open'
  const r = await registerUser({ email: 'open@b.io', passphrase: 'longenough1', ip: '3.3.3.3' })
  assert.equal(r.status, 'created')
})

test('duplicate register within cooldown: cooldown, no second user on disk', async () => {
  await registerUser({ email: 'dup@b.io', passphrase: 'longenough1', inviteCode: 'TESTCODE', ip: '4.4.4.4' })
  const r = await registerUser({ email: 'DUP@B.IO', passphrase: 'otherenough2', inviteCode: 'TESTCODE', ip: '4.4.4.5' })
  assert.equal(r.status, 'cooldown') // same norm — the 60s mail wall catches it first
  assert.equal(JSON.parse(fs.readFileSync(USERS, 'utf-8')).users.length, 1)
})

test('register rate wall: 11th attempt per IP rejected, other IP unaffected', () => {
  for (let i = 0; i < 10; i++) assert.ok(noteRegisterAttempt('9.9.9.9'))
  assert.equal(noteRegisterAttempt('9.9.9.9'), false)
  assert.ok(noteRegisterAttempt('8.8.8.8'))
})

test('verify/reset share the register wall — no unthrottled token endpoint', async () => {
  process.env.REGISTRATION_MODE = 'open'
  await registerUser({ email: 'wall@b.io', passphrase: 'longenough1', ip: '10.0.0.1' })
  for (let i = 0; i < 10; i++) assert.ok(noteRegisterAttempt('10.0.0.2'))
  // both token endpoints burn the same wall → 429 territory before token checks
  assert.equal(verifyRegistration('whatever', '10.0.0.2').status, 'rate-ip')
  assert.equal(consumeReset('whatever', 'newenough99', '10.0.0.2').status, 'rate-ip')
  // an unthrottled IP just gets the normal uniform failure, not the wall
  assert.equal(verifyRegistration('garbage', '10.0.0.3').status, 'invalid')
  assert.equal(consumeReset('garbage', 'newenough99', '10.0.0.3').status, 'invalid-token')
})

test('reset: garbage token rejected, weak new passphrase rejected early', async () => {
  await registerUser({ email: 'reset@b.io', passphrase: 'longenough1', inviteCode: 'TESTCODE', ip: '5.5.5.5' })
  assert.equal(consumeReset('garbage', 'newenough99').status, 'invalid-token')
  assert.equal(consumeReset('garbage', 'short').status, 'weak-passphrase')
})

test('resend is uniform for unknown; pending hits the shared cooldown', async () => {
  assert.equal((await resendVerification({ email: 'ghost@b.io', ip: '6.6.6.6' })).status, 'sent')
  await registerUser({ email: 'pend@b.io', passphrase: 'longenough1', inviteCode: 'TESTCODE', ip: '6.6.6.6' })
  assert.equal((await resendVerification({ email: 'PEND@b.io', ip: '6.6.6.7' })).status, 'cooldown')
})

test('requestReset uniform for unknown address', async () => {
  assert.equal((await requestReset({ email: 'nobody@b.io', ip: '7.7.7.7' })).status, 'sent')
})

test('day-cap: REGISTER_DAILY_MAX counts NEW accounts only, restart-safe by derivation', async () => {
  process.env.REGISTER_DAILY_MAX = '2'
  process.env.REGISTRATION_MODE = 'open'
  assert.equal((await registerUser({ email: 'a@b.io', passphrase: 'longenough1', ip: '1.1.1.1' })).status, 'created')
  assert.equal((await registerUser({ email: 'c@b.io', passphrase: 'longenough1', ip: '1.1.1.2' })).status, 'created')
  assert.equal((await registerUser({ email: 'd@b.io', passphrase: 'longenough1', ip: '1.1.1.3' })).status, 'day-cap')
  // pending re-register creates nothing → must not burn the cap (cooldown cleared)
  _resetEmailAuthForTest()
  assert.equal((await registerUser({ email: 'a@b.io', passphrase: 'longenough1', ip: '1.1.1.4' })).status, 'pending-resent')
  assert.equal((await registerUser({ email: 'e@b.io', passphrase: 'longenough1', ip: '1.1.1.5' })).status, 'day-cap') // still capped
})

test('day-cap: REGISTER_DAILY_MAX=0 is a registration kill-switch', async () => {
  process.env.REGISTER_DAILY_MAX = '0'
  process.env.REGISTRATION_MODE = 'open'
  assert.equal((await registerUser({ email: 'x@b.io', passphrase: 'longenough1', ip: '2.1.1.1' })).status, 'day-cap')
})

test('token invalidation: a fresh mint kills the older same-purpose token', async () => {
  process.env.REGISTRATION_MODE = 'open'
  await registerUser({ email: 'inv@b.io', passphrase: 'longenough1', ip: '12.0.0.1' })
  assert.equal(JSON.parse(fs.readFileSync(USERS, 'utf-8')).tokens.length, 1)
  _resetEmailAuthForTest() // clears the 60s mail cooldown; store reloads from disk
  const r = await registerUser({ email: 'inv@b.io', passphrase: 'otherenough2', ip: '12.0.0.2' })
  assert.equal(r.status, 'pending-resent')
  const verify = JSON.parse(fs.readFileSync(USERS, 'utf-8')).tokens.filter(t => t.purpose === 'verify')
  assert.equal(verify.length, 1, 'only the freshest verify link exists — older mails are dead')
})

test('hashPassphrase format matches the auth contract (salt:hash scrypt-32)', () => {
  const [s, v] = hashPassphrase('secretsecret').split(':')
  assert.equal(s.length, 32)
  assert.equal(v.length, 64)
})

// ── admin surface (proposal §4 phase 3) ──
const { listRegisteredUsers, setRegisteredQuota, deactivateRegisteredUser, inviteCodeUsage } = m

test('admin: list ist sanitisiert — Hashes verlassen das Modul nie', async () => {
  process.env.REGISTRATION_MODE = 'open'
  await registerUser({ email: 'adm@b.io', passphrase: 'longenough1', ip: '13.0.0.1' })
  const list = listRegisteredUsers()
  assert.equal(list.length, 1)
  assert.ok(!('hash' in list[0]), 'kein hash-Feld')
  assert.equal(list[0].email, 'adm@b.io')
})

test('admin: Quota setzen — nur existierende User, nur Zahl ≥ 0', async () => {
  process.env.REGISTRATION_MODE = 'open'
  await registerUser({ email: 'q@b.io', passphrase: 'longenough1', ip: '13.0.0.2' })
  assert.equal(setRegisteredQuota('Q@B.IO', 50), true)   // any case → norm
  assert.equal(registeredUserLimit('q@b.io'), 50)
  assert.equal(setRegisteredQuota('ghost@b.io', 10), false)
  assert.equal(setRegisteredQuota('q@b.io', -1), false)
  assert.equal(setRegisteredQuota('q@b.io', 'lots'), false)
})

test('admin: deaktivierter User login-gesperrt, Daten bleiben', async () => {
  process.env.REGISTRATION_MODE = 'open'
  await registerUser({ email: 'ban@b.io', passphrase: 'longenough1', ip: '13.0.0.3' })
  assert.equal(deactivateRegisteredUser('ban@b.io'), true)
  assert.equal(deactivateRegisteredUser('ghost@b.io'), false)
  const u = listRegisteredUsers()[0]
  assert.equal(u.status, 'deactivated')
  assert.equal(registeredUserLimit('ban@b.io'), 5, 'Quota bleibt Mapping-fähig (kein unlimited leak)')
})

test('admin: invite-usage aggregiert pro Code', async () => {
  await registerUser({ email: 'i1@b.io', passphrase: 'longenough1', inviteCode: 'TESTCODE', ip: '13.0.0.4' })
  await registerUser({ email: 'i2@b.io', passphrase: 'longenough1', inviteCode: 'TESTCODE', ip: '13.0.0.5' })
  const usage = inviteCodeUsage()
  assert.equal(usage['TESTCODE'].total, 2)
  assert.equal(usage['TESTCODE'].pending, 2)
})
