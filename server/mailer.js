// ════════════════════════════════════════════════════════════════════
// mailer — outbound transactional mail (registration blueprint, phase 1)
//
// One transport for the whole app, configured purely from env (the same
// env shape every skale service uses — see docs/proposal-email-registration.md):
//   SMTP_HOST / SMTP_PORT / SMTP_USER / SMTP_PASS / MAIL_FROM
//
// Provider-agnostic by design: today all-inkl kasserver (hub mailbox
// mail@skale.dev), tomorrow OCI Email Delivery — switch is env-only.
//
// Budget guard: sending caps are enforced HERE, not by the provider, so a
// later move to OCI (3.000/month, 100/day, 10/min hard) is safe by
// construction and a runaway loop (resend-hammering in phase 2) hits a
// wall in-process. In-memory like quota.js (UTC-day reset) — a restart
// resets the counters, which is acceptable: the caps protect the channel,
// not the accounting.
//
// Unconfigured → dry-run mode: renders the mail, returns {dryRun:true,
// preview} instead of sending. Dev on the Mac needs no SMTP creds, and
// tests never touch the network.
// ════════════════════════════════════════════════════════════════════
import nodemailer from 'nodemailer'

const DAY_MS = 24 * 60 * 60 * 1000

// Defaults are OCI Email Delivery's hard caps — the tightest provider we
// might switch to. Env-tunable for local testing (test files set 0/∞).
const dailyMax = () => parseInt(process.env.MAIL_DAILY_MAX ?? '100', 10)
const perMinuteMax = () => parseInt(process.env.MAIL_PER_MINUTE ?? '10', 10)

let sentToday = 0
let dayKey = ''
const minuteStamps = []

function budgetState(now = Date.now()) {
  const today = new Date(now).toISOString().slice(0, 10)
  if (today !== dayKey) { dayKey = today; sentToday = 0 }
  // slide the minute window
  while (minuteStamps.length && now - minuteStamps[0] >= 60_000) minuteStamps.shift()
  return { sentToday, minuteCount: minuteStamps.length }
}

/** Throws when the next send would exceed a cap. Read-only peek for /api. */
export function assertMailBudget(now = Date.now()) {
  const s = budgetState(now)
  if (s.sentToday >= dailyMax()) {
    const err = new Error(`mail budget: daily cap reached (${dailyMax()})`)
    err.code = 'EMAIL_BUDGET_DAILY'
    throw err
  }
  if (s.minuteCount >= perMinuteMax()) {
    const err = new Error(`mail budget: per-minute cap reached (${perMinuteMax()})`)
    err.code = 'EMAIL_BUDGET_MINUTE'
    throw err
  }
}

export function peekMailBudget() { return { ...budgetState(), dailyMax: dailyMax(), perMinuteMax: perMinuteMax() } }

// ── transport (lazy: created on first send, so import stays side-effect-free) ──
let transport = null
let transportError = null

export function mailConfigured() {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS && process.env.MAIL_FROM)
}

function getTransport() {
  if (transportError) throw transportError
  if (transport) return transport
  if (!mailConfigured()) {
    transportError = new Error('mailer: SMTP_HOST/SMTP_USER/SMTP_PASS/MAIL_FROM not set')
    throw transportError
  }
  transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    secure: false, // 587 + STARTTLS
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  })
  return transport
}

/** Test hook: reset counters + transport between cases. */
export function _resetMailerForTest() {
  sentToday = 0; dayKey = ''; minuteStamps.length = 0
  transport = null; transportError = null
}

// ── core send ──
export async function sendMail({ to, subject, text, html }) {
  assertMailBudget()
  const from = process.env.MAIL_FROM
  const consume = () => { const now = Date.now(); budgetState(now); sentToday += 1; minuteStamps.push(now) }
  if (!mailConfigured()) {
    // dry-run consumes budget too — the wall must behave identically in dev/tests
    consume()
    return { dryRun: true, from, to, subject, text, html }
  }
  const info = await getTransport().sendMail({ from, to, subject, text, html })
  consume() // only on successful submission — a failed send frees the slot
  return { dryRun: false, messageId: info.messageId, accepted: info.accepted }
}

// ── templates (SOTA per docs/proposal-email-registration.md §3) ──
// One purpose, one CTA; link AND button to the same URL; TTL stated in-mail;
// plain-text part is the source of truth, html a styled rendering.

function baseHtml(title, bodyHtml, ctaLabel, url, footer) {
  return `<!doctype html><html><body style="margin:0;padding:0;background:#fafaf9;font-family:system-ui,-apple-system,'Segoe UI',sans-serif;color:#1a1a1a;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:2rem 1rem;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:34rem;background:#ffffff;border:1px solid #e5e5e5;border-radius:.5rem;">
<tr><td style="padding:1.5rem 1.75rem;">
<h2 style="margin:0 0 .75rem;font-size:1.15rem;">${title}</h2>
<p style="margin:0 0 1rem;line-height:1.55;color:#374151;">${bodyHtml}</p>
<p style="margin:1.25rem 0 .5rem;"><a href="${url}" style="display:inline-block;background:#1a1a1a;color:#ffffff;text-decoration:none;padding:.65rem 1.1rem;border-radius:.35rem;">${ctaLabel}</a></p>
<p style="margin:0 0 .25rem;font-size:.85rem;color:#6b7280;">Or copy this link:<br><a href="${url}" style="color:#1a1a1a;word-break:break-all;">${url}</a></p>
<p style="margin:1.5rem 0 0;padding-top:1rem;border-top:1px solid #e5e5e5;font-size:.78rem;color:#9ca3af;line-height:1.5;">${footer}</p>
</td></tr></table></td></tr></table></body></html>`
}

const footerFor = () => `You received this because of an action on aiui — the π agent web UI at ${process.env.PUBLIC_URL || 'https://skale.dev/aiui'}.`

/** Verify link at registration. `ttlMinutes` is stated in the mail — pass the real TTL. */
export async function sendVerifyEmail(to, { url, ttlMinutes = 30 }) {
  const subject = 'aiui: verify your email'
  const text = `Verify your email for aiui.\n\nOpen this link to activate your account (valid for ${ttlMinutes} minutes):\n${url}\n\nIf you did not request this, you can ignore this mail.\n\n${footerFor()}`
  const html = baseHtml(
    'Verify your email',
    'Open the link below to activate your aiui account.',
    'Verify email',
    url,
    `Link valid for <strong>${ttlMinutes} minutes</strong>. Didn&rsquo;t request this? Ignore this mail.<br>${footerFor()}`,
  )
  return sendMail({ to, subject, text, html })
}

/** Password/passphrase reset link. Enumeration-safe wording lives in the route, not here. */
export async function sendResetEmail(to, { url, ttlMinutes = 30 }) {
  const subject = 'aiui: reset your passphrase'
  const text = `A passphrase reset was requested for aiui.\n\nOpen this link to set a new passphrase (valid for ${ttlMinutes} minutes):\n${url}\n\nIf you did not request this, ignore this mail — your passphrase stays unchanged.\n\n${footerFor()}`
  const html = baseHtml(
    'Reset your passphrase',
    'A reset was requested for your aiui account.',
    'Reset passphrase',
    url,
    `Link valid for <strong>${ttlMinutes} minutes</strong>. Didn&rsquo;t request this? Ignore this mail — your passphrase stays unchanged.<br>${footerFor()}`,
  )
  return sendMail({ to, subject, text, html })
}

/** Welcome after successful verification. */
export async function sendWelcomeEmail(to, { loginUrl }) {
  const subject = 'Welcome to aiui'
  const text = `Your aiui account is active.\n\nSign in:\n${loginUrl}\n\nWhat to know:\n- You get a private workspace and an isolated agent session.\n- Daily quota applies; your key stays yours (bring-your-own optional).\n\n${footerFor()}`
  const html = baseHtml(
    'Welcome to aiui',
    'Your account is active. Your workspace and agent session are ready.',
    'Open aiui',
    loginUrl,
    `Private workspace, isolated session, daily quota.<br>${footerFor()}`,
  )
  return sendMail({ to, subject, text, html })
}

/** Ops smoke: proves transport end-to-end (phase 0 CLI, later admin panel). */
export async function sendTestMail(to) {
  const subject = 'aiui mailer test'
  const text = `Mailer transport test from aiui.\n\nIf you read this, SMTP submission works end to end.\n\n${footerFor()}`
  const html = baseHtml('Mailer test', 'SMTP submission works end to end.', 'Open aiui', process.env.PUBLIC_URL || 'https://skale.dev/aiui', footerFor())
  return sendMail({ to, subject, text, html })
}
