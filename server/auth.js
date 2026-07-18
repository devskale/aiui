// ════════════════════════════════════════════════════════════════════
// auth — user login for the aiui instance
//
// Guards who can drive aiui (and thus the pi credentials it fronts). A JSON
// config file lists allowed usernames + one-or-more scrypt-hashed passphrases;
// login succeeds iff the username is known AND the passphrase matches any hash.
// Sessions are random tokens in an in-memory Map (revocable; cleared on
// restart). When no config is present, auth is OFF (dev-friendly).
//
// Config (AIUI_AUTH_FILE, default ~/.aiui-auth.json):
//   { "users": ["johann","guest"], "passphrases": ["salt:hash", ...],
//     "limits": { "guest": 10 } }
// Generate a hash:  node scripts/hash-passphrase.js <passphrase>
// ════════════════════════════════════════════════════════════════════
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const AUTH_FILE = process.env.AIUI_AUTH_FILE || path.join(os.homedir(), '.aiui-auth.json')
export const COOKIE_NAME = 'aiui_session'
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7 // 7 days

// session token → { user, expiresAt }
const sessions = new Map()

// config cache (reloaded when the file mtime changes → live edits)
let config = null
let configMtime = -1

function loadConfig() {
  try {
    const st = fs.statSync(AUTH_FILE)
    if (st.mtimeMs !== configMtime) {
      config = JSON.parse(fs.readFileSync(AUTH_FILE, 'utf-8'))
      configMtime = st.mtimeMs
    }
    return config
  } catch {
    config = null
    configMtime = -1
    return null
  }
}

/** Auth is "on" only when the config defines users AND passphrases. */
export function authEnabled() {
  const c = loadConfig()
  return !!(c && c.users?.length && c.passphrases?.length)
}

// scrypt verify a passphrase against a "salt:hash" (both hex) entry.
function verifyHash(passphrase, entry) {
  const [saltHex, hashHex] = String(entry).split(':')
  if (!saltHex || !hashHex) return false
  const salt = Buffer.from(saltHex, 'hex')
  const expected = Buffer.from(hashHex, 'hex')
  const computed = crypto.scryptSync(passphrase, salt, expected.length)
  return crypto.timingSafeEqual(computed, expected)
}

/** username known AND passphrase matches any configured hash. */
export function verifyCredentials(username, passphrase) {
  const c = loadConfig()
  if (!c || !Array.isArray(c.users) || !c.users.includes(username)) return false
  if (!Array.isArray(c.passphrases)) return false
  return c.passphrases.some(p => verifyHash(passphrase, p))
}

/** Per-user daily query limit, or null = unlimited. */
export function userLimit(username) {
  const c = loadConfig()
  const n = c?.limits?.[username]
  return Number.isFinite(n) && n >= 0 ? n : null
}

// ── sessions ──
export function issueSession(user) {
  const token = crypto.randomBytes(32).toString('hex')
  sessions.set(token, { user, expiresAt: Date.now() + SESSION_TTL_MS })
  return token
}
export function lookupSession(token) {
  const s = token && sessions.get(token)
  if (!s) return null
  if (s.expiresAt < Date.now()) { sessions.delete(token); return null }
  return s
}
export function revokeSession(token) { if (token) sessions.delete(token) }

// ── cookies ──
export function readSessionCookie(req) {
  for (const part of (req.headers.cookie || '').split(';')) {
    const [k, ...v] = part.trim().split('=')
    if (k === COOKIE_NAME) return decodeURIComponent(v.join('='))
  }
  return null
}
export function setSessionCookie(res, token, secure) {
  // SameSite=None;Secure over HTTPS so the cookie survives a cross-site iframe
  // embed (skale.dev embedding this app); Lax for direct LAN (HTTP) access.
  // Partitioned (CHIPS) lets Chrome keep it despite third-party-cookie blocking.
  const sameSite = secure ? 'None' : 'Lax'
  const a = ['Path=/', 'HttpOnly', `Max-Age=${SESSION_TTL_MS / 1000}`, `SameSite=${sameSite}`]
  if (secure) a.push('Secure', 'Partitioned')
  res.setHeader('Set-Cookie', [`${COOKIE_NAME}=${encodeURIComponent(token)};${a.join(';')}`])
}
export function clearSessionCookie(res, secure) {
  const sameSite = secure ? 'None' : 'Lax'
  const a = ['Path=/', 'HttpOnly', 'Max-Age=0', `SameSite=${sameSite}`]
  if (secure) a.push('Secure', 'Partitioned')
  res.setHeader('Set-Cookie', [`${COOKIE_NAME}=;${a.join(';')}`])
}

// ── middleware ──
// Open pass-through when auth is unconfigured (req.user = null); else require
// a valid session and expose the username as req.user.
export function requireAuth(req, res, next) {
  if (!authEnabled()) { req.user = null; return next() }
  const s = lookupSession(readSessionCookie(req))
  if (!s) return res.status(401).json({ error: 'not authenticated' })
  req.user = s.user
  next()
}

// ── login brute-force throttle (per IP, 10/min) ──
const attempts = new Map() // ip → { windowStart, count }
const ATTEMPT_WINDOW = 60_000
const ATTEMPT_MAX = 10
/** Record an attempt; returns false if the IP is over the rate (caller → 429). */
export function noteLoginAttempt(ip) {
  const key = ip || '?'
  const now = Date.now()
  let a = attempts.get(key)
  if (!a || now - a.windowStart > ATTEMPT_WINDOW) a = { windowStart: now, count: 0 }
  a.count++
  attempts.set(key, a)
  return a.count <= ATTEMPT_MAX
}
