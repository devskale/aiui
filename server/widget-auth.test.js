// ════════════════════════════════════════════════════════════════════
// widget-auth.test.js — pure Teile: Key-Normalisierung, Domain-Check,
// Mint-Rate-Limit, HMAC-Token. Run: node --test server/widget-auth.test.js
// (Datei-abhängige Teile — widgetKeyEntry, getWidgetSecret, Quota — sind
//  E2E-Thema, nicht Unit.)
// ════════════════════════════════════════════════════════════════════
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  normalizeWidgetKeys, originAllowed, noteMintAttempt,
  mintWidgetToken, verifyWidgetToken,
} from './widget-auth.js'

// ── normalizeWidgetKeys ──

test('normalizeWidgetKeys: valid entries normalized, defaults filled', () => {
  const out = normalizeWidgetKeys({
    wk_a: { user: 'widget:demo', domains: ['Kunde.AT', ' localhost:5173 '] },
  })
  assert.deepEqual(out.wk_a.domains, ['kunde.at', 'localhost:5173'])
  assert.equal(out.wk_a.revoked, false)
  assert.equal(out.wk_a.agent, '')
  assert.equal(out.wk_a.config.variant, 'corner')
  assert.equal(out.wk_a.config.launcherLabel, 'Chat')
})

test('normalizeWidgetKeys: entries without user dropped; garbage input → {}', () => {
  const out = normalizeWidgetKeys({ wk_bad: { domains: ['x.at'] }, wk_ok: { user: 'widget:x' } })
  assert.equal(Object.keys(out).length, 1)
  assert.ok(out.wk_ok)
  assert.deepEqual(normalizeWidgetKeys(null), {})
  assert.deepEqual(normalizeWidgetKeys([1, 2]), {})
})

// ── originAllowed ──

test('originAllowed: exact host, port-variant and subdomain match', () => {
  const e = { domains: ['kunde.at', 'localhost:5173'] }
  assert.ok(originAllowed(e, 'https://kunde.at'))
  assert.ok(originAllowed(e, 'https://www.kunde.at/page'))          // subdomain
  assert.ok(originAllowed(e, 'http://localhost:5173/embed-demo'))
  assert.ok(originAllowed(e, 'https://kunde.at:443/x'))             // port-Standard
})

test('originAllowed: fail closed — empty domains, missing/foreign origin', () => {
  assert.ok(!originAllowed({ domains: [] }, 'https://kunde.at'))    // fail closed
  assert.ok(!originAllowed({ domains: ['kunde.at'] }, ''))          // kein Origin
  assert.ok(!originAllowed({ domains: ['kunde.at'] }, null))
  assert.ok(!originAllowed({ domains: ['kunde.at'] }, 'https://boese.io'))
  assert.ok(!originAllowed({ domains: ['kunde.at'] }, 'kein-url'))
})

test('originAllowed: referer (full URL) works as origin source', () => {
  const e = { domains: ['kunde.at'] }
  assert.ok(originAllowed(e, 'https://kunde.at/seite?x=1'))
})

test('originAllowed: localhost entry does not match other localhost ports', () => {
  const e = { domains: ['localhost:5173'] }
  assert.ok(!originAllowed(e, 'http://localhost:9999'))
})

// ── noteMintAttempt ──

test('noteMintAttempt: allows under max, blocks over, window resets', () => {
  const k = 'wk_test_' + Math.random().toString(36).slice(2)
  const t0 = 1_000_000
  for (let i = 1; i <= 10; i++) assert.ok(noteMintAttempt(k, { max: 10, now: t0 + i }), `attempt ${i} allowed`)
  assert.ok(!noteMintAttempt(k, { max: 10, now: t0 + 11 }))          // über dem Cap
  assert.ok(noteMintAttempt(k, { max: 10, now: t0 + 61_000 }))       // Fenster neu
})

// ── mint/verify ──

test('widget token: mint → verify roundtrip', () => {
  const secret = 's'.repeat(32)
  const { token, expiresAt } = mintWidgetToken({ user: 'widget:demo', key: 'wk_a' }, secret)
  const v = verifyWidgetToken(token, secret)
  assert.equal(v.user, 'widget:demo')
  assert.equal(v.key, 'wk_a')
  assert.equal(v.exp, expiresAt)
})

test('widget token: expired token rejected (exp in the past)', () => {
  const secret = 's'.repeat(32)
  const { token } = mintWidgetToken({ user: 'u', key: 'k' }, secret, { ttlMs: 1000, now: 0 })
  assert.equal(verifyWidgetToken(token, secret, 2000), null)
})

test('widget token: tampered payload rejected; wrong secret rejected', () => {
  const { token } = mintWidgetToken({ user: 'u', key: 'k' }, 'a'.repeat(32))
  const parts = token.split('.')
  const evil = Buffer.from(JSON.stringify({ u: 'admin', k: 'k', exp: 9e15 })).toString('base64url')
  assert.equal(verifyWidgetToken(`${evil}.${parts[1]}`, 'a'.repeat(32)), null) // payload getauscht
  assert.equal(verifyWidgetToken(token, 'b'.repeat(32)), null)                  // falsches Secret
})

test('widget token: malformed input rejected', () => {
  assert.equal(verifyWidgetToken('', 'x'.repeat(32)), null)
  assert.equal(verifyWidgetToken('abc', 'x'.repeat(32)), null)                  // kein Punkt
  assert.equal(verifyWidgetToken('a.b.c.d', 'x'.repeat(32)), null)
  assert.equal(verifyWidgetToken(null, 'x'.repeat(32)), null)
})
