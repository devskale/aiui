// ════════════════════════════════════════════════════════════════════
// session-export — Tests (rein, node --test)
// ════════════════════════════════════════════════════════════════════
import test from 'node:test'
import assert from 'node:assert/strict'
import { toMarkdown, TOOL_OUTPUT_CAP } from './session-export.js'

const U = (text) => JSON.stringify({ type: 'message', message: { role: 'user', content: [{ type: 'text', text }] } })
const A = (text, toolCalls = []) => JSON.stringify({
  type: 'message',
  message: { role: 'assistant', content: [...(text ? [{ type: 'text', text }] : []), ...toolCalls], usage: { totalTokens: 5 } },
})

test('toMarkdown: User/Assistant-Runden werden zu ##-Abschnitten', () => {
  const md = toMarkdown([U('Hallöle'), A('Welt!')].join('\n'), { name: 'Test-Session' })
  assert.ok(md.startsWith('# Test-Session'))
  assert.ok(md.includes('## 🧑 User'))
  assert.ok(md.includes('Hallöle'))
  assert.ok(md.includes('## 🤖 Assistant'))
  assert.ok(md.includes('Welt!'))
  assert.ok(md.includes('2 entries'))
})

test('toMarkdown: ohne name ist der erste User-Text der Titel', () => {
  const md = toMarkdown([U('Erste Frage'), A('Antwort')].join('\n'), {})
  assert.ok(md.startsWith('# Erste Frage'))
})

test('toMarkdown: Tool-Calls landen als Name+Args+Output im Export', () => {
  const md = toMarkdown([A(null, [{ type: 'toolCall', name: 'bash', arguments: { command: 'ls' } }]), JSON.stringify({ type: 'message', message: { role: 'toolResult', content: [{ type: 'text', text: 'datei.txt' }] } })].join('\n'))
  assert.ok(md.includes('**Tool `bash`**'))
  assert.ok(md.includes('command'))
})

test('toMarkdown: Tool-Output wird gekappt (lesbarer Export)', () => {
  const big = 'x'.repeat(TOOL_OUTPUT_CAP + 500)
  const md = toMarkdown([
    A(null, [{ type: 'toolCall', name: 'bash', arguments: { command: 'ls' } }]),
    JSON.stringify({ type: 'message', message: { role: 'toolResult', toolName: 'bash', content: [{ type: 'text', text: big }] } }),
  ].join('\n'))
  // mehr als CAP zusammenhängende x darf es nicht geben (cap behält genau CAP), Hinweis kommt
  assert.ok(!md.includes('x'.repeat(TOOL_OUTPUT_CAP + 10)))
  assert.ok(md.includes('truncated'))
})

test('toMarkdown: Nicht-Message-Zeilen und korrupte Zeilen werden übergangen', () => {
  const md = toMarkdown([
    '{not json',
    JSON.stringify({ type: 'session_info', name: 'Meta' }),
    U('sichtbar'),
    '',
  ].join('\n'))
  assert.ok(md.includes('sichtbar'))
  assert.ok(!md.includes('Meta'))
  assert.equal(md.includes('undefined'), false)
})

test('toMarkdown: Backtick-Fence im Output bricht den Export-Codeblock nicht', () => {
  const tricky = 'vorher ```bash\necho hi\n``` danach'
  const md = toMarkdown([U('q'), A(null, [{ type: 'toolCall', name: 'bash', arguments: { command: 'x' } }]), JSON.stringify({ type: 'message', message: { role: 'toolResult', toolName: 'bash', content: [{ type: 'text', text: tricky }] } })].join('\n'))
  // der Trick-Output enthält ``` — der Export-Fence um ihn herum muss länger sein
  const fences = md.match(/^`{3,}$/gm) || []
  assert.ok(fences.length >= 2, `mindestens 2 lange Fences, bekam ${fences.length}`)
  assert.ok(md.includes('echo hi'))
})

test('toMarkdown: leere Session gibt Kopf ohne Abschnitte', () => {
  const md = toMarkdown('', { name: 'Leer' })
  assert.ok(md.startsWith('# Leer'))
  assert.ok(md.includes('0 entries'))
})
