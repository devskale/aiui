// ════════════════════════════════════════════════════════════════════
// compose.test.js — tests the pure autocomplete math
// Run: node --test src/lib/compose.test.js
// ════════════════════════════════════════════════════════════════════
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  detectSlashTrigger, detectMentionTrigger,
  applyCommand, applyMention,
  buildSlashItems, rewriteSkillCommand,
  detectHashtagTrigger, applyHashtag,
} from './compose.js'

// ── trigger detection ──

test('detectSlashTrigger: trailing /query at start', () => {
  assert.deepEqual(detectSlashTrigger('/foo'), { query: '/foo', start: 0 })
})

test('detectSlashTrigger: trailing /query after whitespace', () => {
  assert.deepEqual(detectSlashTrigger('hi /foo'), { query: '/foo', start: 3 })
})

test('detectSlashTrigger: non-trailing slash → null', () => {
  assert.equal(detectSlashTrigger('/foo bar'), null)
  assert.equal(detectSlashTrigger('a/b'), null)
})

test('detectMentionTrigger: trailing @query at start', () => {
  assert.deepEqual(detectMentionTrigger('@foo'), { query: 'foo', atIndex: 0 })
})

test('detectMentionTrigger: trailing @query after whitespace', () => {
  assert.deepEqual(detectMentionTrigger('hi @foo'), { query: 'foo', atIndex: 3 })
})

test('detectMentionTrigger: non-trailing @ → null', () => {
  assert.equal(detectMentionTrigger('a@b'), null)
  assert.equal(detectMentionTrigger('hi'), null)
})

// ── insertion math (text + cursor) ──

test('applyCommand: replaces the trigger with command + space, cursor after', () => {
  const r = applyCommand('hi /fo', 3, '/fo', '/skill:a')
  assert.equal(r.text, 'hi /skill:a ')
  assert.equal(r.cursor, 'hi /skill:a '.length)
})

test('applyCommand: at start of text', () => {
  const r = applyCommand('/fo', 0, '/fo', '/new')
  assert.equal(r.text, '/new ')
  assert.equal(r.cursor, 5)
})

test('applyMention: replaces @trigger with @path + space, cursor after', () => {
  const r = applyMention('hi @fo', 3, 'fo', 'a/b.ts')
  assert.equal(r.text, 'hi @a/b.ts ')
  assert.equal(r.cursor, 'hi @a/b.ts '.length)
})

// ── slash item building ──

test('buildSlashItems: query narrows to matching host action', () => {
  const items = buildSlashItems('/comp', {})
  assert.deepEqual(items.map(i => i.command), ['/compact'])
})

test('buildSlashItems: empty query returns all host actions + fills', () => {
  const commands = { skills: [{ name: 'sum', description: 'd' }], prompts: [], extensions: [] }
  const items = buildSlashItems('/', commands)
  const cmds = items.map(i => i.command)
  assert.ok(cmds.includes('/compact'))
  assert.ok(cmds.includes('/skill:sum'))
})

test('buildSlashItems: fill items are run:fill; host actions carry their run', () => {
  const items = buildSlashItems('/', { skills: [{ name: 'x', description: '' }] })
  const fill = items.find(i => i.command === '/skill:x')
  assert.equal(fill.run, 'fill')
  assert.equal(items.find(i => i.command === '/new').run, 'new')
})

// ── skill rewrite (send-time) ──

test('rewriteSkillCommand: bare /known → /skill:known', () => {
  assert.equal(rewriteSkillCommand('/known', [{ name: 'known' }]), '/skill:known')
})

test('rewriteSkillCommand: unknown /command unchanged', () => {
  assert.equal(rewriteSkillCommand('/unknown', [{ name: 'known' }]), '/unknown')
  assert.equal(rewriteSkillCommand('plain text', [{ name: 'x' }]), 'plain text')
})

// ── #dokname-Trigger (Bibliothek) ──

test('detectHashtagTrigger: trailing #query wie @ — das LETZTE # ist der Trigger', () => {
  assert.deepEqual(detectHashtagTrigger('Vergleiche #ber'), { query: 'ber', atIndex: 11 })
  assert.deepEqual(detectHashtagTrigger('#bericht und #fehlt'), { query: 'fehlt', atIndex: 13 }, 'trailing # ist der Trigger')
  assert.equal(detectHashtagTrigger('#bericht und fehlt'), null, 'ohne # am Ende kein Trigger')
  assert.equal(detectHashtagTrigger('kein trigger'), null)
  assert.deepEqual(detectHashtagTrigger('#'), { query: '', atIndex: 0 })
})

test('applyHashtag: ersetzt nur den Trigger-Anteil, kein Doppel-Space', () => {
  const { text, cursor } = applyHashtag('Vergleiche #ber mit X', 11, 'ber', 'Bericht.pdf')
  assert.equal(text, 'Vergleiche #Bericht.pdf mit X')
  assert.equal(cursor, 23, 'Cursor vor dem bereits vorhandenen Space')
  const atEnd = applyHashtag('Siehe #ber', 6, 'ber', 'Bericht.pdf')
  assert.equal(atEnd.text, 'Siehe #Bericht.pdf ')
  assert.equal(atEnd.cursor, 'Siehe #Bericht.pdf '.length)
})
