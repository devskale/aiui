// ════════════════════════════════════════════════════════════════════
// widget-auth — public embed keys + kurzlebige Widget-Tokens (ADR-0006 D1)
//
// 3-Schichten-Kette für das Embed-Widget:
//   (1) public Key aus ~/.aiui-auth.json → widgetKeys (scoped, revocable,
//       domain-gebunden)
//   (2) POST /api/widget/session mintet ein HMAC-Token ({ user, key, exp },
//       exp ≈ 1 h) — rate-limited pro Key pro Minute
//   (3) Widget-Endpoints lesen den User NUR aus dem signed Claim
//
// Keys sind Gates (wer rein darf), Widget-User sind Budgets (Quota liegt auf
// dem User, bestehende userLimit()-Infrastruktur). Widget-User stehen NICHT
// in `users` — sie sind nicht passwort-loginbar.
//
// Pure Funktionen (normalize/originAllowed/mint/verify) sind unit-getestet;
// Dateizugriff läuft über denselben mtime-Cache wie auth.js.
// ════════════════════════════════════════════════════════════════════
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { authConfigSnapshot, AUTH_FILE_PATH } from './auth.js'
import { userLimit } from './auth.js'
import { peekQuota } from './quota.js'

// ── Key-Einträge (pure) ──
// Tolerantes Normalisieren eines widgetKeys-Blocks: kaputte Einträge fallen
// raus, nie werfen. Ein Eintrag ohne `user` ist unbrauchbar → weg.
export function normalizeWidgetKeys(raw) {
  const out = {}
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out
  for (const [key, e] of Object.entries(raw)) {
    if (!key || !e || typeof e !== 'object') continue
    if (typeof e.user !== 'string' || !e.user) continue
    out[key] = {
      user: e.user,
      domains: Array.isArray(e.domains) ? e.domains.map(d => String(d).toLowerCase().trim()).filter(Boolean) : [],
      agent: typeof e.agent === 'string' ? e.agent : '',
      revoked: e.revoked === true,
    readonly: e.readonly === true,
      config: {
        variant: e.config?.variant === 'modal' || e.config?.variant === 'inline' ? e.config.variant : 'corner',
        theme: e.config?.theme && typeof e.config.theme === 'object' ? e.config.theme : {},
        greeting: typeof e.config?.greeting === 'string' ? e.config.greeting : '',
        launcherLabel: typeof e.config?.launcherLabel === 'string' ? e.config.launcherLabel : 'Chat',
      },
    }
  }
  return out
}

/** Lookup eines Keys gegen die Live-Config (mtime-gecacht wie auth.js). */
export function widgetKeyEntry(key) {
  if (typeof key !== 'string' || !key) return null
  const keys = normalizeWidgetKeys(authConfigSnapshot()?.widgetKeys)
  return keys[key] || null
}

// ── Domain-Restriction (pure, fail closed) ──
// Origin (oder Referer-URL) muss zu einem der `domains`-Einträge passen:
// host exakt, hostname exakt (Port ignoriert) oder Subdomain eines Eintrags.
// Leere domains / fehlender Origin → NEIN (lieber zu als zu offen).
export function originAllowed(entry, origin) {
  const domains = entry?.domains
  if (!Array.isArray(domains) || domains.length === 0 || !origin) return false
  let host, hostname
  try {
    host = new URL(origin).host.toLowerCase()
    hostname = host.split(':')[0]
  } catch { return false }
  return domains.some(d => {
    const dom = String(d).toLowerCase().trim()
    if (!dom) return false
    return host === dom || hostname === dom || hostname.endsWith('.' + dom)
  })
}

// ── frame-ancestors für /embed (pure) ──
// Domains sind im Key schemalos gespeichert (Host[:port]); frame-ancestors
// braucht aber URIs. Default https:// — ABER: http-Hosts (lokale Dev/Demo auf
// localhost, http-only-Kunden ohne TLS) wären damit blockiert, ohne jede
// Schutzwirkung (frame-ancestors ist Allowlist, nicht Auth). Deshalb:
// explizites Scheme im Eintrag gewinnt, Loopback-Hosts bekommen zusätzlich
// http://, alle anderen bleiben https-only.
export function frameAncestorsFor(domains = []) {
  const out = new Set(["'self'"])
  for (const raw of Array.isArray(domains) ? domains : []) {
    const d = String(raw).toLowerCase().trim()
    if (!d) continue
    if (d.startsWith('http://') || d.startsWith('https://')) {
      out.add(d)
      continue
    }
    out.add(`https://${d}`)
    const host = d.split(':')[0]
    if (host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '[::1]' || d.endsWith('.localhost')) {
      out.add(`http://${d}`)
    }
  }
  return [...out]
}

// ── Mint-Rate-Limit (pro Key pro Minute — Map wie Login-Throttle) ──
// Sonst verschiebt ein Key-Leak das Problem nur eine Ebene tiefer: der
// Angreifer mint dann eben Tokens im Sekundentakt (hodgen.ai-Kernpunkt).
const mintAttempts = new Map() // key → { windowStart, count }
export function noteMintAttempt(key, { max = 10, windowMs = 60_000, now = Date.now() } = {}) {
  const k = key || '?'
  let a = mintAttempts.get(k)
  if (!a || now - a.windowStart > windowMs) a = { windowStart: now, count: 0 }
  a.count++
  mintAttempts.set(k, a)
  return a.count <= max
}

// ── Widget-Quota (peek, nicht consume — Mint verbrennt kein Budget) ──
// Das Budget liegt auf dem Widget-User (limits-Eintrag); consume passiert
// erst beim echten Prompt (visitor-runtime-Issue).
export function widgetQuotaAvailable(user) {
  const limit = userLimit(user)
  if (limit === null) return true
  return peekQuota(user, limit).used < limit
}

// ── HMAC-Token (pure) ──
// `base64url(payload).base64url(hmac-sha256(payload))` — stateless, 1 h,
// restart-stabil (kein Session-Store). Secret: env > config > persistierte
// Datei neben der Auth-Config.
const b64u = (buf) => Buffer.from(buf).toString('base64url')

export function mintWidgetToken({ user, key }, secret, { ttlMs = 3600_000, now = Date.now() } = {}) {
  const payload = { u: user, k: key, exp: now + ttlMs }
  const body = b64u(JSON.stringify(payload))
  const mac = b64u(crypto.createHmac('sha256', secret).update(body).digest())
  return { token: `${body}.${mac}`, expiresAt: payload.exp }
}

export function verifyWidgetToken(token, secret, now = Date.now()) {
  if (typeof token !== 'string' || !token.includes('.')) return null
  const [body, mac] = token.split('.')
  if (!body || !mac) return null
  const expected = crypto.createHmac('sha256', secret).update(body).digest()
  const got = Buffer.from(mac, 'base64url')
  if (got.length !== expected.length || !crypto.timingSafeEqual(got, expected)) return null
  let payload
  try { payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf-8')) } catch { return null }
  if (!payload || typeof payload.u !== 'string' || typeof payload.k !== 'string') return null
  if (!Number.isFinite(payload.exp) || payload.exp < now) return null
  return { user: payload.u, key: payload.k, exp: payload.exp }
}

// ── Secret-Auflösung ──
// Rangfolge: AIUI_WIDGET_SECRET (Deploy-Override) > config.widgetSecret >
// persistierte Zufalls-Datei (0600, Sibling der Auth-Config — außerhalb
// jeder Sandbox). Datei wird beim ersten Zugriff angelegt.
let cachedFileSecret = null
export function getWidgetSecret() {
  if (process.env.AIUI_WIDGET_SECRET) return process.env.AIUI_WIDGET_SECRET
  const c = authConfigSnapshot()
  if (typeof c?.widgetSecret === 'string' && c.widgetSecret.length >= 16) return c.widgetSecret
  if (cachedFileSecret) return cachedFileSecret
  const file = path.join(path.dirname(AUTH_FILE_PATH), '.aiui-widget-secret')
  try {
    cachedFileSecret = fs.readFileSync(file, 'utf-8').trim()
    if (cachedFileSecret.length >= 16) return cachedFileSecret
  } catch { /* noch keine Datei → unten anlegen */ }
  cachedFileSecret = crypto.randomBytes(32).toString('hex')
  try {
    fs.writeFileSync(file, cachedFileSecret + '\n', { mode: 0o600 })
  } catch { /* best effort — Memory-Secret gilt für diesen Prozess */ }
  return cachedFileSecret
}
