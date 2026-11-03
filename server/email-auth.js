// ════════════════════════════════════════════════════════════════════
// email-auth — self-service registration with email verification
// (docs/proposal-email-registration.md, phase 2)
//
// Owns the registered-user store (~/.aiui-users.json, sibling of the auth
// config — home dir, outside every sandboxed workspace) and the single-use
// verify/reset tokens. auth.js consumes this module (never the other way
// — no import cycle: login flows through auth.js, registration flows here).
//
// Store shape (atomic tmp+rename, 0600, mtime-cached like auth.js):
//   { users:  [{ email, norm, hash, status, created, quota, invite }],
//     tokens: [{ hash, purpose, norm, expires }] }   // consumed = removed
//
// OWASP-verified properties (cheatsheet 2026):
//   - canonicalization: original kept for mail, `norm` (domain-lowercased,
//     NO provider munging) is the comparison key — equivalent-address
//     takeover needs two registers to collide, which norm prevents
//   - tokens: 32B random, stored sha256-only, single-use, TTL 30 min
//   - enumeration-safe: module returns rich results for tests/ops; the
//     ROUTE layer maps every outcome to the same HTTP response
//   - rate walls: per-IP register window (shared across register/verify/
//     resend/reset so no path bypasses it), per-email mail cooldown
//
// Registration mode (REGISTRATION_MODE=invite|open|closed, default invite):
// an agent service hands out shell+quota, so self-service signup stays
// invite-gated by default. Codes: auth file `inviteCodes` + env
// AIUI_INVITE_CODES (comma-sep) — env wins for tests/smoke.
// Default quota for self-registered users is LOW (5/day) until an admin
// raises it in the users file.
// ════════════════════════════════════════════════════════════════════
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { sendVerifyEmail, sendResetEmail, sendWelcomeEmail } from './mailer.js'

const USERS_FILE = process.env.AIUI_USERS_FILE || path.join(os.homedir(), '.aiui-users.json')
const AUTH_FILE = process.env.AIUI_AUTH_FILE || path.join(os.homedir(), '.aiui-auth.json')
export const TOKEN_TTL_MS = 30 * 60 * 1000
const DEFAULT_QUOTA = 5
// Global cap on NEW accounts per UTC day — derived from the store's `created`
// timestamps, so it survives restarts with no extra state. Kill-switch at 0.
const dailyNewUsersMax = () => parseInt(process.env.REGISTER_DAILY_MAX ?? '20', 10)
function createdTodayCount(now = new Date()) {
  const today = now.toISOString().slice(0, 10)
  return loadStore().users.filter(u => typeof u.created === 'string' && u.created.slice(0, 10) === today).length
}

// ── store ──
let store = null
let storeMtime = -1

function loadStore() {
  // Memory leads until a first successful save: stat failing (file not yet
  // written) must NOT clobber an in-progress store — the user pushed before
  // mintToken() would vanish. Only a real mtime change reloads.
  try {
    const st = fs.statSync(USERS_FILE)
    if (st.mtimeMs !== storeMtime) {
      const raw = JSON.parse(fs.readFileSync(USERS_FILE, 'utf-8'))
      store = { users: Array.isArray(raw.users) ? raw.users : [], tokens: Array.isArray(raw.tokens) ? raw.tokens : [] }
      storeMtime = st.mtimeMs
    }
  } catch {
    if (!store) store = { users: [], tokens: [] }
    storeMtime = -1
  }
  return store
}

function saveStore() {
  const now = Date.now()
  store.tokens = store.tokens.filter(t => t.expires > now)
  try {
    const tmp = USERS_FILE + '.tmp'
    fs.writeFileSync(tmp, JSON.stringify(store, null, 2), { mode: 0o600 })
    fs.renameSync(tmp, USERS_FILE)
    storeMtime = fs.statSync(USERS_FILE).mtimeMs
  } catch { /* best effort — memory stays leading */ }
}

// ── canonicalization ──
// Whole address lowercased for the identity key (case-folding is
// provider-agnostic — unlike Gmail dot/plus folding, which we DON'T do,
// per OWASP). Original kept verbatim for mail delivery.
export function normalizeEmail(email) {
  const raw = String(email || '').trim()
  const at = raw.lastIndexOf('@')
  if (at < 1 || at === raw.length - 1) return null
  const norm = raw.toLowerCase()
  return { original: raw, norm, ok: norm.length <= 254 && /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/.test(norm) }
}

// ── passphrase hashing (same salt:hash scrypt contract as hash-passphrase.js) ──
export function hashPassphrase(pw) {
  const salt = crypto.randomBytes(16)
  return `${salt.toString('hex')}:${crypto.scryptSync(pw, salt, 32).toString('hex')}`
}
function verifyHash(pw, entry) {
  const [saltHex, hashHex] = String(entry || '').split(':')
  if (!saltHex || !hashHex) return false
  const computed = crypto.scryptSync(pw, Buffer.from(saltHex, 'hex'), 32)
  return crypto.timingSafeEqual(computed, Buffer.from(hashHex, 'hex'))
}

// ── lookups (used by auth.js for the second credential source) ──
export function registeredUserFor(username) {
  if (typeof username !== 'string') return null
  const n = normalizeEmail(username)
  if (!n) return null
  return loadStore().users.find(u => u.norm === n.norm) || null
}
/** Registered quota (number) or undefined when not a registered user. */
export function registeredUserLimit(username) {
  const u = registeredUserFor(username)
  return u ? u.quota : undefined
}

// ── rate walls (in-memory like quota.js — restart resets, acceptable) ──
const ipWindows = new Map()   // ip → { start, count }  (register: 10/hour)
const mailCooldown = new Map() // norm → ts of last outbound auth mail (60s)
export function noteRegisterAttempt(ip) {
  const key = ip || '?'
  const now = Date.now()
  let w = ipWindows.get(key)
  if (!w || now - w.start > 3_600_000) w = { start: now, count: 0 }
  w.count++; ipWindows.set(key, w)
  return w.count <= 10
}
function mailCooldownOk(norm) {
  const last = mailCooldown.get(norm) || 0
  return Date.now() - last >= 60_000
}
function noteMailSent(norm) { mailCooldown.set(norm, Date.now()) }

// ── registration mode + invites ──
export function registrationMode() {
  const m = (process.env.REGISTRATION_MODE || 'invite').toLowerCase()
  return ['invite', 'open', 'closed'].includes(m) ? m : 'invite'
}
/** Day-cap visibility for ops/config endpoints. */
export function peekRegistrationBudget() {
  return { createdToday: createdTodayCount(), dailyMax: dailyNewUsersMax() }
}
function inviteCodes() {
  const env = (process.env.AIUI_INVITE_CODES || '').split(',').map(s => s.trim()).filter(Boolean)
  if (env.length) return env
  try { const c = JSON.parse(fs.readFileSync(AUTH_FILE, 'utf-8')).inviteCodes; return Array.isArray(c) ? c : [] } catch { return [] }
}

// ── tokens ──
function mintToken(purpose, norm, ttlMs = TOKEN_TTL_MS) {
  const token = crypto.randomBytes(32).toString('base64url')
  loadStore().tokens.push({ hash: crypto.createHash('sha256').update(token).digest('hex'), purpose, norm, expires: Date.now() + ttlMs })
  saveStore()
  return token
}
/** Consume a token: single-use, purpose-checked, expiry-checked. */
function consumeToken(token, purpose) {
  const h = crypto.createHash('sha256').update(String(token || '')).digest('hex')
  const s = loadStore()
  const i = s.tokens.findIndex(t => t.hash === h && t.purpose === purpose)
  if (i === -1) return null
  const t = s.tokens[i]
  s.tokens.splice(i, 1); saveStore()
  if (t.expires < Date.now()) return null
  return t
}

const publicUrl = () => (process.env.PUBLIC_URL || 'https://skale.dev/aiui').replace(/\/+$/, '')
// The mail text states the link TTL — derive it from TOKEN_TTL_MS so changing
// the real TTL can never leave the in-mail text lying.
const ttlMinutes = () => Math.round(TOKEN_TTL_MS / 60_000)

// ── flows (rich results; the ROUTE maps to uniform responses) ──

export async function registerUser({ email, passphrase, inviteCode, ip }) {
  if (registrationMode() === 'closed') return { status: 'closed' }
  if (!noteRegisterAttempt(ip)) return { status: 'rate-ip' }
  const n = normalizeEmail(email)
  if (!n || !n.ok) return { status: 'invalid-email' }
  if (typeof passphrase !== 'string' || passphrase.length < 8) return { status: 'weak-passphrase' }
  if (registrationMode() === 'invite') {
    const codes = inviteCodes()
    if (!inviteCode || !codes.includes(String(inviteCode).trim())) return { status: 'bad-invite' }
  }
  const s = loadStore()
  const existing = s.users.find(u => u.norm === n.norm)
  // Day-cap counts only NEW accounts (a pending re-register creates nothing).
  // Global, not per-email — an honest 429 leaks no account existence.
  if (!existing && createdTodayCount() >= dailyNewUsersMax()) return { status: 'day-cap' }
  if (existing && existing.status === 'active') {
    // No mail: a "you already have an account" send would burn real budget
    // on a fake-token link that 404s on click. The uniform response below
    // already leaks nothing (created | pending-resent | exists look alike).
    return { status: 'exists' }
  }
  if (!mailCooldownOk(n.norm)) return { status: 'cooldown' }
  if (!existing) {
    s.users.push({ email: n.original, norm: n.norm, hash: hashPassphrase(passphrase), status: 'pending', created: new Date().toISOString(), quota: DEFAULT_QUOTA, invite: inviteCode || null })
  } else {
    existing.hash = hashPassphrase(passphrase) // pending re-register: fresh hash, new mail
  }
  const token = mintToken('verify', n.norm)
  try {
    await sendVerifyEmail(n.original, { url: `${publicUrl()}/?verify=${token}`, ttlMinutes: ttlMinutes() })
    noteMailSent(n.norm)
  } catch (e) {
    saveStore() // keep user+token even if the mail failed — resend can recover
    return { status: 'mail-failed', error: e.code || e.message }
  }
  saveStore()
  return { status: existing ? 'pending-resent' : 'created' }
}

/** Consume a verify token → activate. Shares the per-IP register wall —
 *  token endpoints are guessing surfaces too (proposal §5: limiter on
 *  register/verify/resend/reset). Returns {status:'rate-ip'} or
 *  {status:'ok', user, email, wasPending}. */
export function verifyRegistration(token, ip) {
  if (!noteRegisterAttempt(ip)) return { status: 'rate-ip' }
  const t = consumeToken(token, 'verify')
  if (!t) return { status: 'invalid' }
  const u = loadStore().users.find(u => u.norm === t.norm)
  if (!u) return { status: 'invalid' }
  const wasPending = u.status === 'pending'
  u.status = 'active'
  saveStore()
  return { status: 'ok', user: u.norm, email: u.email, wasPending }
}

export async function resendVerification({ email, ip }) {
  if (!noteRegisterAttempt(ip)) return { status: 'rate-ip' }
  const n = normalizeEmail(email)
  if (!n) return { status: 'sent' } // uniform — never confirm existence
  const u = loadStore().users.find(u => u.norm === n.norm)
  if (!u || u.status !== 'pending') return { status: 'sent' }
  if (!mailCooldownOk(n.norm)) return { status: 'cooldown' }
  const token = mintToken('verify', n.norm)
  try {
    await sendVerifyEmail(u.email, { url: `${publicUrl()}/?verify=${token}`, ttlMinutes: ttlMinutes() })
    noteMailSent(n.norm)
  } catch (e) { return { status: 'mail-failed', error: e.code || e.message } }
  return { status: 'sent' }
}

export async function requestReset({ email, ip }) {
  if (!noteRegisterAttempt(ip)) return { status: 'rate-ip' }
  const n = normalizeEmail(email)
  if (!n) return { status: 'sent' }
  const u = loadStore().users.find(u => u.norm === n.norm)
  if (!u) return { status: 'sent' } // uniform
  if (!mailCooldownOk(n.norm)) return { status: 'cooldown' }
  const token = mintToken('reset', n.norm)
  try {
    await sendResetEmail(u.email, { url: `${publicUrl()}/?reset=${token}`, ttlMinutes: ttlMinutes() })
    noteMailSent(n.norm)
  } catch (e) { return { status: 'mail-failed', error: e.code || e.message } }
  return { status: 'sent' }
}

/** Consume a reset token → set new passphrase. Email possession is the proof.
 *  Shares the per-IP register wall like verify (token-guessing surface). */
export function consumeReset(token, newPassphrase, ip) {
  if (!noteRegisterAttempt(ip)) return { status: 'rate-ip' }
  if (typeof newPassphrase !== 'string' || newPassphrase.length < 8) return { status: 'weak-passphrase' }
  const t = consumeToken(token, 'reset')
  if (!t) return { status: 'invalid-token' }
  const u = loadStore().users.find(u => u.norm === t.norm)
  if (!u) return { status: 'invalid-token' }
  u.hash = hashPassphrase(newPassphrase)
  u.status = 'active'
  saveStore()
  return { status: 'ok', user: u.norm }
}

/** Welcome mail after first activation (fire-and-forget — budget-guarded). */
export async function maybeSendWelcome({ email, wasPending }) {
  if (!wasPending) return null
  try { return await sendWelcomeEmail(email, { loginUrl: publicUrl() }) } catch { return null }
}

/** Test seam: fresh store per case. */
export function _resetEmailAuthForTest() {
  store = null; storeMtime = -1
  ipWindows.clear(); mailCooldown.clear()
}
export const USERS_FILE_PATH = USERS_FILE
