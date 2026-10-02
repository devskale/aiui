// ════════════════════════════════════════════════════════════════════
// embed-phase2.test.js — Variants-Resolver, Focus-Trap-Tab-Logik,
// Readonly-Widget-Tools (ADR-0006 Phase 2). Run: node --test src/embed/…
// ════════════════════════════════════════════════════════════════════
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { resolveVariant } from './variant.js'
import { nextTabTarget } from './focus-trap.js'
import { createReadonlyTools } from '../../server/sandbox.js'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

// ── resolveVariant ──

test('resolveVariant: Attribut gewinnt, dann Config, sonst corner', () => {
  assert.equal(resolveVariant('modal', 'inline'), 'modal')
  assert.equal(resolveVariant(null, 'inline'), 'inline')
  assert.equal(resolveVariant('', undefined), 'corner')
  assert.equal(resolveVariant('bogus', 'bogus'), 'corner')
  assert.equal(resolveVariant('MODAL'), 'modal') // case-insensitiv
})

// ── focus-trap Tab-Logik (pure) ──

test('nextTabTarget: zirkuliert vorwärts und rückwärts', () => {
  assert.equal(nextTabTarget(0, 3, false), 1)
  assert.equal(nextTabTarget(2, 3, false), 0) // wrap
  assert.equal(nextTabTarget(0, 3, true), 2) // shift-wrap
  assert.equal(nextTabTarget(2, 3, true), 1)
})

test('nextTabTarget: Fokus außerhalb (−1) → erstes bzw. letztes Element', () => {
  assert.equal(nextTabTarget(-1, 3, false), 0)
  assert.equal(nextTabTarget(-1, 3, true), 2)
})

test('nextTabTarget: leere Menge → −1', () => {
  assert.equal(nextTabTarget(0, 0, false), -1)
})

// ── createReadonlyTools (echte Dateien, kein Netz) ──

test('readonly tools: read funktioniert, write/edit/bash verweigern', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aiw-ro-'))
  fs.writeFileSync(path.join(dir, 'note.txt'), 'hallo')
  try {
    const tools = createReadonlyTools(dir)
    const byName = Object.fromEntries(tools.map(t => [t.name, t]))

    // read: normaler, guarder Read (AgentTool-Signatur: toolCallId, params, …)
    const r = await byName.read.execute('t1', { path: 'note.txt' })
    assert.ok(!r.isError)
    assert.ok(String(r.content?.[0]?.text || '').includes('hallo'))

    // write/edit/bash: deterministische Absage mit isError
    for (const name of ['write', 'edit', 'bash']) {
      const out = await byName[name].execute('t2', name === 'bash' ? { command: 'touch x' } : { path: 'x.txt', content: 'y' })
      assert.equal(out.isError, true, `${name} muss verweigern`)
      assert.match(String(out.content?.[0]?.text), /read-only/i)
    }

    // Und nichts ist geschrieben worden
    assert.equal(fs.existsSync(path.join(dir, 'x.txt')), false)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})
