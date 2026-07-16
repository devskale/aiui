// ════════════════════════════════════════════════════════════════════
// entry.test.js — tests the Entry interface directly (the test surface)
// Run: node --test shared/
// ════════════════════════════════════════════════════════════════════
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { empty, fromUser, error, fromMessage, fold, attachResult } from './entry.js'

// ── Constructors ──

test('empty() seeds an assistant value with no text and carried toolCalls', () => {
  assert.deepEqual(empty(), { role: 'assistant', text: '', thinkingText: '', toolCalls: [] })
  assert.deepEqual(empty([{ name: 'bash' }]).toolCalls, [{ name: 'bash' }])
})

test('fromUser carries text + attachments', () => {
  assert.deepEqual(fromUser('hi', []), { role: 'user', text: 'hi', attachments: [] })
})

test('error defaults the message', () => {
  assert.equal(error().text, 'Unknown error')
  assert.equal(error('boom').text, 'boom')
  assert.equal(error('boom').role, 'error')
})

// ── fromMessage (server replay path) ──

test('fromMessage: user message → entry', () => {
  const msg = { role: 'user', content: [{ type: 'text', text: 'hello' }] }
  assert.deepEqual(fromMessage(msg), { role: 'user', text: 'hello' })
})

test('fromMessage: empty user content → null (no visible row)', () => {
  assert.equal(fromMessage({ role: 'user', content: '' }), null)
})

test('fromMessage: assistant text + thinking + toolCall', () => {
  const msg = {
    role: 'assistant',
    content: [
      { type: 'text', text: 'doing it' },
      { type: 'thinking', thinking: 'reasoning' },
      { type: 'toolCall', name: 'bash', arguments: { command: 'ls' } },
    ],
  }
  const entry = fromMessage(msg)
  assert.equal(entry.role, 'assistant')
  assert.equal(entry.text, 'doing it')
  assert.equal(entry.thinkingText, 'reasoning')
  assert.deepEqual(entry.toolCalls, [{ name: 'bash', args: { command: 'ls' }, status: 'done', output: '' }])
})

test('fromMessage: assistant with neither text nor toolCalls → null', () => {
  assert.equal(fromMessage({ role: 'assistant', content: [{ type: 'thinking', thinking: 'x' }] }), null)
})

test('fromMessage: string content (no array) is treated as text', () => {
  assert.deepEqual(fromMessage({ role: 'user', content: 'plain' }), { role: 'user', text: 'plain' })
})

// ── attachResult (shared by fold + server replay) ──

test('attachResult sets output + done on the matching running tool by name', () => {
  const e = empty([{ name: 'bash', args: {}, status: 'running', output: '' }])
  const out = attachResult(e, 'bash', 'total 0', false)
  assert.equal(out.toolCalls[0].status, 'done')
  assert.equal(out.toolCalls[0].output, 'total 0')
})

test('attachResult marks error', () => {
  const e = empty([{ name: 'bash', args: {}, status: 'running', output: '' }])
  const out = attachResult(e, 'bash', 'fail', true)
  assert.equal(out.toolCalls[0].status, 'error')
})

test('attachResult falls back to last running tool when name misses', () => {
  const e = empty([
    { name: 'read', args: {}, status: 'running', output: '' },
  ])
  const out = attachResult(e, 'mismatch', 'data', false)
  assert.equal(out.toolCalls[0].status, 'done')
})

test('attachResult is pure — input unchanged', () => {
  const e = empty([{ name: 'bash', args: {}, status: 'running', output: '' }])
  attachResult(e, 'bash', 'out', false)
  assert.equal(e.toolCalls[0].status, 'running')
  assert.equal(e.toolCalls[0].output, '')
})

// ── fold (live event path) ──

test('fold: text deltas accumulate', () => {
  let e = empty()
  e = fold(e, { type: 'message_update', assistantMessageEvent: { type: 'text_delta', delta: 'foo' } })
  e = fold(e, { type: 'message_update', assistantMessageEvent: { type: 'text_delta', delta: 'bar' } })
  assert.equal(e.text, 'foobar')
})

test('fold: thinking deltas accumulate into thinkingText', () => {
  let e = empty()
  e = fold(e, { type: 'message_update', assistantMessageEvent: { type: 'thinking_delta', delta: 'hmm' } })
  assert.equal(e.thinkingText, 'hmm')
})

test('fold: thinking_start/end are phase events — value untouched', () => {
  const e0 = empty()
  const e1 = fold(e0, { type: 'message_update', assistantMessageEvent: { type: 'thinking_start' } })
  assert.equal(e1, e0) // returned unchanged (same reference)
})

test('fold: tool_call_start → tool_execution_end produces a done tool with output', () => {
  let e = empty()
  e = fold(e, { type: 'message_update', assistantMessageEvent: { type: 'tool_call_start', toolName: 'bash', args: { command: 'ls' } } })
  assert.equal(e.toolCalls[0].status, 'running')
  e = fold(e, { type: 'tool_execution_end', toolName: 'bash', result: { content: [{ type: 'text', text: 'a.txt' }] } })
  assert.equal(e.toolCalls[0].status, 'done')
  assert.equal(e.toolCalls[0].output, 'a.txt')
})

test('fold: tool_execution_update appends output to the running tool', () => {
  let e = empty()
  e = fold(e, { type: 'tool_execution_start', toolName: 'bash', args: {} })
  e = fold(e, { type: 'tool_execution_update', output: 'line1\n' })
  e = fold(e, { type: 'tool_execution_update', output: 'line2\n' })
  assert.equal(e.toolCalls[0].output, 'line1\nline2\n')
})

test('fold: preserves extra (phase) fields on the entry — does not strip them', () => {
  // The reducer carries phase flags on `current`; fold must round-trip them.
  const cur = { ...empty(), thinking: true, thinkingDone: false, messageComplete: false }
  const out = fold(cur, { type: 'message_update', assistantMessageEvent: { type: 'text_delta', delta: 'x' } })
  assert.equal(out.thinking, true)
  assert.equal(out.messageComplete, false)
  assert.equal(out.text, 'x')
})

test('fold: ignores orchestration events (message_start, turn_end, etc.)', () => {
  const e = empty()
  assert.equal(fold(e, { type: 'message_start' }), e)
  assert.equal(fold(e, { type: 'turn_end' }), e)
  assert.equal(fold(e, { type: 'agent_settled' }), e)
})

test('fold: null entry with a value event seeds an assistant value', () => {
  const e = fold(null, { type: 'message_update', assistantMessageEvent: { type: 'text_delta', delta: 'seeded' } })
  assert.equal(e.role, 'assistant')
  assert.equal(e.text, 'seeded')
})

// ── replay parity: fromMessage output must match a folded live stream's commit ──

test('parity: a folded live turn and a replayed message produce the same value', () => {
  // Live path
  let live = empty()
  live = fold(live, { type: 'message_update', assistantMessageEvent: { type: 'thinking_delta', delta: 'why' } })
  live = fold(live, { type: 'message_update', assistantMessageEvent: { type: 'tool_call_start', toolName: 'bash', args: { command: 'pwd' } } })
  live = fold(live, { type: 'tool_execution_end', toolName: 'bash', result: { content: [{ type: 'text', text: '/tmp' }] } })
  live = fold(live, { type: 'message_update', assistantMessageEvent: { type: 'text_delta', delta: 'done' } })

  // Replay path: the stored message + its toolResult
  const replayed = fromMessage({
    role: 'assistant',
    content: [
      { type: 'thinking', thinking: 'why' },
      { type: 'toolCall', name: 'bash', arguments: { command: 'pwd' } },
      { type: 'text', text: 'done' },
    ],
  })
  const withResult = attachResult(replayed, 'bash', '/tmp', false)

  // Same value shape — the two producers can no longer drift.
  assert.equal(withResult.text, live.text)
  assert.equal(withResult.thinkingText, live.thinkingText)
  assert.equal(withResult.toolCalls[0].name, live.toolCalls[0].name)
  assert.equal(withResult.toolCalls[0].status, 'done')
  assert.equal(withResult.toolCalls[0].output, '/tmp')
})
