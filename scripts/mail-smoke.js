#!/usr/bin/env node
// mail-smoke.js — CLI smoke for the mailer (phase 0/1). No HTTP route on
// purpose: an open mail endpoint is a spam-relay magnet, so ops runs this
// from a shell with the service env loaded. Usage:
//   node scripts/mail-smoke.js [to]        (default: MAIL_FROM's hub)
// On lubu, source env from the systemd drop-in first — see deploy notes.
import { sendTestMail, sendVerifyEmail, sendResetEmail, sendWelcomeEmail, peekMailBudget } from '../server/mailer.js'

const to = process.argv[2] || process.env.MAIL_FROM
if (!to) { console.error('usage: node scripts/mail-smoke.js <to> (or set MAIL_FROM)'); process.exit(1) }

const url = `${process.env.PUBLIC_URL || 'https://skale.dev/aiui'}/verify?token=smoke-token`
const shots = [
  ['test', () => sendTestMail(to)],
  ['verify', () => sendVerifyEmail(to, { url, ttlMinutes: 30 })],
  ['reset', () => sendResetEmail(to, { url: url.replace('verify', 'reset'), ttlMinutes: 30 })],
  ['welcome', () => sendWelcomeEmail(to, { loginUrl: process.env.PUBLIC_URL || 'https://skale.dev/aiui' })],
]

for (const [name, fn] of shots) {
  try {
    const r = await fn()
    console.log(`${name}: ${r.dryRun ? 'DRY-RUN (SMTP env not set!)' : 'sent ' + r.messageId}`)
  } catch (e) {
    console.error(`${name}: FAIL ${e.code || ''} ${e.message}`)
    process.exitCode = 1
  }
}
console.log('budget:', JSON.stringify(peekMailBudget()))
