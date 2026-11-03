// mailer.test.js — budget guard, dry-run, templates. No network: unconfigured
// env means sendMail renders instead of sending (by design).
import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import {
  _resetMailerForTest, assertMailBudget, peekMailBudget,
  mailConfigured, sendMail, sendVerifyEmail, sendResetEmail, sendWelcomeEmail, sendTestMail,
} from './mailer.js'

const ENV = { ...process.env }
beforeEach(() => {
  process.env = { ...ENV }
  delete process.env.SMTP_HOST; delete process.env.SMTP_USER; delete process.env.SMTP_PASS; delete process.env.MAIL_FROM
  _resetMailerForTest()
})

test('unconfigured env → dry-run, no throw', async () => {
  assert.equal(mailConfigured(), false)
  const r = await sendTestMail('mail@skale.dev')
  assert.equal(r.dryRun, true)
  assert.equal(r.to, 'mail@skale.dev')
  assert.ok(r.subject.includes('aiui'))
  assert.ok(r.text.length > 0 && r.html.length > 0)
})

test('budget: daily cap enforced with clear code (dry-run consumes too)', async () => {
  process.env.MAIL_DAILY_MAX = '2'
  await sendTestMail('a@x.io'); await sendTestMail('a@x.io')
  assert.equal(peekMailBudget().sentToday, 2)
  assert.throws(() => assertMailBudget(), (e) => e.code === 'EMAIL_BUDGET_DAILY')
  await assert.rejects(sendTestMail('a@x.io'), (e) => e.code === 'EMAIL_BUDGET_DAILY')
})

test('budget: per-minute cap enforced (OCI default 10)', async () => {
  process.env.MAIL_PER_MINUTE = '3'
  for (let i = 0; i < 3; i++) await sendTestMail('a@x.io')
  assert.throws(() => assertMailBudget(), (e) => e.code === 'EMAIL_BUDGET_MINUTE')
  const p = peekMailBudget()
  assert.equal(p.minuteCount, 3); assert.equal(p.perMinuteMax, 3)
})

test('budget: minute cap visible in peek', async () => {
  process.env.MAIL_PER_MINUTE = '3'
  for (let i = 0; i < 3; i++) await sendTestMail('a@x.io')
  assert.throws(() => assertMailBudget(), (e) => e.code === 'EMAIL_BUDGET_MINUTE')
  const p = peekMailBudget()
  assert.equal(p.minuteCount, 3); assert.equal(p.perMinuteMax, 3)
})

test('budget: MAIL_DAILY_MAX=0 is a kill-switch', async () => {
  process.env.MAIL_DAILY_MAX = '0'
  await assert.rejects(sendTestMail('a@x.io'), (e) => e.code === 'EMAIL_BUDGET_DAILY')
})

test('verify template: link + TTL in text AND html, ignore-hint present', async () => {
  const r = await sendVerifyEmail('u@x.io', { url: 'https://skale.dev/aiui/?verify=abc', ttlMinutes: 30 })
  for (const part of [r.text, r.html]) {
    assert.ok(part.includes('https://skale.dev/aiui/?verify=abc'), 'link in part')
    assert.ok(part.includes('30 minutes'), 'TTL stated')
  }
  assert.ok(r.text.includes('did not request'), 'ignore-hint in text')
  assert.ok(r.subject === 'aiui: verify your email')
})

test('reset template: "stays unchanged" reassurance', async () => {
  const r = await sendResetEmail('u@x.io', { url: 'https://skale.dev/aiui/reset?token=z' })
  assert.ok(r.text.includes('passphrase stays unchanged'))
  assert.ok(r.html.includes('valid for'))
})

test('welcome template: login URL + all three spec bullets (quota, BYOK, scope)', async () => {
  process.env.PUBLIC_URL = 'https://skale.dev/aiui'
  const r = await sendWelcomeEmail('u@x.io', { loginUrl: 'https://skale.dev/aiui' })
  const t = r.text.toLowerCase()
  assert.ok(t.includes('quota'))
  assert.ok(t.includes('own key'))   // settings/BYOK bullet
  assert.ok(t.includes('sandboxed')) // the agent's scope on the machine
  assert.ok(r.html.includes('Open aiui'))
})

test('all templates carry the same neutral footer brand (aiui, not a service alias)', async () => {
  for (const r of [await sendTestMail('a@x.io'),
                   await sendVerifyEmail('a@x.io', { url: 'https://x/v?t=1' }),
                   await sendResetEmail('a@x.io', { url: 'https://x/r?t=1' })]) {
    assert.ok(r.text.includes('aiui'))
  }
})
