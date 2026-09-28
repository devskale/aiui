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
//     "credentials": { "johann": "salt:hash" },   // optional per-User override
//     "limits": { "guest": 10 },
//     "models":     { "include": [...], "notInclude": [...] },          // optional
//     "userModels": { "johann": { "include": [...], "notInclude": [...] } } }
// Generate a hash:  node scripts/hash-passphrase.js <passphrase>
//
// Credential resolution: if `credentials[username]` exists, that User logs in
// ONLY with those passphrases (string or array) — the shared `passphrases`
// list no longer applies to them. Everyone else verifies against the shared
// list. So a per-User entry is a replacement, not an addition.
//
// Model filtering (server/model-filter.js): `models` restricts the catalog
// deployment-wide, `userModels[username]` replaces it for that User. Patterns
// are anchored prefixes on "provider@id" ("unii@tu@", "unii@tu@qwen*", exact
// ids); see model-filter.js for the full semantics.
// ════════════════════════════════════════════════════════════════════
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { patternsOf } from './model-filter.js'

const AUTH_FILE = process.env.AIUI_AUTH_FILE || path.join(os.homedir(), '.aiui-auth.json')
export const COOKIE_NAME = 'aiui_session'
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7 // 7 days

// session token → { user, expiresAt }
// Persisted (hashed) across restarts so logins survive deploys — see below.
const sessions = new Map()

// ── session persistence ──
// Deploys restart the service and used to wipe every login. Sessions now
// live in a file SIBLING to the auth config (home dir — outside every
// sandboxed workspace, out of agent reach). Only sha256(token) is stored:
// a leaked/backed-up file is useless for logging in. Expired entries are
// pruned on load and on save; writes are atomic (tmp + rename, mode 0600).
const SESSIONS_FILE = path.join(path.dirname(AUTH_FILE), '.aiui-sessions.json')
const hashToken = (t) => crypto.createHash('sha256').update(t).digest('hex')

function loadSessions() {
  let dropped = 0
  try {
    const raw = JSON.parse(fs.readFileSync(SESSIONS_FILE, 'utf-8'))
    const now = Date.now()
    for (const [h, s] of Object.entries(raw || {})) {
      if (s && typeof s.user === 'string' && Number(s.expiresAt) > now) {
        sessions.set(h, { user: s.user, expiresAt: Number(s.expiresAt) })
      } else dropped++
    }
  } catch { /* fehlt/korrupt → leer starten */ }
  // Boot putzt die Datei gleich mit — abgelaufene akkumulieren nicht.
  if (dropped > 0) saveSessions()
}

function saveSessions() {
  const now = Date.now()
  const out = {}
  for (const [h, s] of sessions) if (s.expiresAt > now) out[h] = s
  try {
    const tmp = SESSIONS_FILE + '.tmp'
    fs.writeFileSync(tmp, JSON.stringify(out), { mode: 0o600 })
    fs.renameSync(tmp, SESSIONS_FILE)
  } catch { /* best effort — der Speicher bleibt führend */ }
}

loadSessions()

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

/** Auth is "on" only when the config defines users AND any credential source. */
export function authEnabled() {
  const c = loadConfig()
  return !!(c && c.users?.length &&
    (c.passphrases?.length || (c.credentials && Object.keys(c.credentials).length)))
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

// Normalize a credentials-map entry (string | array) to a list of entries.
function asList(v) { return Array.isArray(v) ? v : [v] }

/** username known AND passphrase matches their credentials: the per-User
 *  `credentials[username]` entries when present (replacement semantics),
 *  otherwise the shared `passphrases` list. */
export function verifyCredentials(username, passphrase) {
  const c = loadConfig()
  if (!c || !Array.isArray(c.users) || !c.users.includes(username)) return false
  const own = c.credentials?.[username]
  const candidates = own ? asList(own) : (Array.isArray(c.passphrases) ? c.passphrases : [])
  return candidates.some(p => verifyHash(passphrase, p))
}

/** Per-user daily query limit, or null = unlimited. */
export function userLimit(username) {
  const c = loadConfig()
  const n = c?.limits?.[username]
  return Number.isFinite(n) && n >= 0 ? n : null
}

/** The model filter for a User: `userModels[username]` when present
 *  (replaces the deployment-wide `models` block), else `models`. Always
 *  normalized to { include: [prefix...], notInclude: [prefix...] }; empty
 *  lists mean no restriction. Live-reloads with the config file. */
export function modelFilterFor(username) {
  const c = loadConfig()
  const src = (username && c?.userModels?.[username]) || c?.models || {}
  return { include: patternsOf(src.include), notInclude: patternsOf(src.notInclude) }
}

// ── sessions ──
export function issueSession(user) {
  const token = crypto.randomBytes(32).toString('hex')
  sessions.set(hashToken(token), { user, expiresAt: Date.now() + SESSION_TTL_MS })
  saveSessions()
  return token
}
export function lookupSession(token) {
  const h = token && hashToken(token)
  const s = h && sessions.get(h)
  if (!s) return null
  if (s.expiresAt < Date.now()) { sessions.delete(h); saveSessions(); return null }
  return s
}
export function revokeSession(token) {
  if (!token) return
  sessions.delete(hashToken(token))
  saveSessions()
}

// ── cookies ──
// Read ALL aiui_session cookie values. Several may be present — stale
// path/domain variants from past deploys pile up in the browser, and the
// Cookie header sends them all. We try each rather than trusting the first
// (which may be an old, post-restart-invalid token).
export function readSessionCookies(req) {
  const vals = []
  for (const part of (req.headers.cookie || '').split(';')) {
    const [k, ...v] = part.trim().split('=')
    if (k === COOKIE_NAME) vals.push(decodeURIComponent(v.join('=')))
  }
  return vals
}
// Resolve the live session from whichever aiui_session cookie validates.
export function currentSession(req) {
  for (const t of readSessionCookies(req)) {
    const s = lookupSession(t)
    if (s) return s
  }
  return null
}
export function setSessionCookie(res, token, secure) {
  // First-party cookie: Lax + Secure over HTTPS. skale.dev/aiui redirects here,
  // so access is first-party (SameSite=Lax works).
  const a = ['Path=/', 'HttpOnly', `Max-Age=${SESSION_TTL_MS / 1000}`, 'SameSite=Lax']
  if (secure) a.push('Secure')
  res.setHeader('Set-Cookie', [`${COOKIE_NAME}=${encodeURIComponent(token)}; ${a.join('; ')}`])
}
// Best-effort: expire stale session cookies at common path variants so the
// fresh Path=/ cookie is the only one that sticks.
export function clearStaleSessionCookies(res, secure) {
  for (const p of ['/aiui', '/aiui/', '/aiui/api', '/aiui/api/']) {
    const a = [`Path=${p}`, 'Max-Age=0', 'SameSite=Lax']
    if (secure) a.push('Secure')
    res.append('Set-Cookie', `${COOKIE_NAME}=; ${a.join('; ')}`)
  }
}
export function clearSessionCookie(res, secure) {
  const a = ['Path=/', 'HttpOnly', 'Max-Age=0', 'SameSite=Lax']
  if (secure) a.push('Secure')
  res.setHeader('Set-Cookie', [`${COOKIE_NAME}=; ${a.join('; ')}`])
}

// ── middleware ──
// Open pass-through when auth is unconfigured (req.user = null); else require
// a valid session and expose the username as req.user.
export function requireAuth(req, res, next) {
  if (!authEnabled()) { req.user = null; return next() }
  const s = currentSession(req)
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
