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
delete process.env.SMTP_HOST; delete process.env.SMTP_USER; delete process.env.SMTP_PASS; delete process.env.MAIL_FROM

const m = await import('./email-auth.js')
const {
  _resetEmailAuthForTest, normalizeEmail, hashPassphrase, registeredUserFor, registeredUserLimit,
  registerUser, resendVerification, requestReset, consumeReset, registrationMode, noteRegisterAttempt,
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

test('hashPassphrase format matches the auth contract (salt:hash scrypt-32)', () => {
  const [s, v] = hashPassphrase('secretsecret').split(':')
  assert.equal(s.length, 32)
  assert.equal(v.length, 64)
})
