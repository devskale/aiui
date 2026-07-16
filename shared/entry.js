// ════════════════════════════════════════════════════════════════════
// Entry — the home module for a chat row
//
// Stable value shape: { role, text, thinkingText, toolCalls }
//   • role:        'user' | 'assistant' | 'error'
//   • text:        string  (markdown for assistant, plain for user)
//   • thinkingText:string  (assistant reasoning; '' when none)
//   • toolCalls:   [{ name, args, status, output }]  status: 'running'|'done'|'error'
//
// This is the ONE place that owns the shape. Both the server (replay from
// stored SDK messages) and the client (folding live SSE events) go through
// this interface. Streaming phase flags (thinking-in-progress, message-done)
// are NOT part of the value — they're transient reducer state and live in
// useAgentEvents, never here.
//
// Interface:
//   empty(toolCalls?)              fresh assistant value (reducer seeds `current`)
//   fromMessage(msg)               server: one SDK message → Entry | null
//   fromUser(text, attachments)    live user row
//   error(message)                 error row
//   fold(entry | null, event)      client: pure (entry, event) → entry
//   attachResult(entry, name, out, err)  set a toolCall's result (fold + replay share it)
// ════════════════════════════════════════════════════════════════════

// ── SDK content extractors ──
// textOf is exported: the server's replay path needs it to read a toolResult
// message's output. extractThinking stays internal (only fromMessage uses it).
export function textOf(content) {
  if (!content) return ''
  if (typeof content === 'string') return content
  return content.filter(c => c.type === 'text').map(c => c.text).join('\n')
}

function extractThinking(content) {
  if (!content || typeof content === 'string') return ''
  return content.filter(c => c.type === 'thinking').map(c => c.thinking).join('\n')
}

// ── Constructors ──

export function empty(toolCalls = []) {
  return { role: 'assistant', text: '', thinkingText: '', toolCalls }
}

export function fromUser(text, attachments) {
  return { role: 'user', text, attachments }
}

export function error(message) {
  return { role: 'error', text: message || 'Unknown error' }
}

// One stored SDK message → Entry. Returns null for messages that produce no
// visible row (empty user text, assistant with no text and no tool calls).
// toolResult messages are NOT handled here — they attach to a preceding
// assistant entry via attachResult (a cross-message dependency the caller owns).
export function fromMessage(msg) {
  if (!msg) return null
  if (msg.role === 'user') {
    const text = textOf(msg.content)
    return text ? { role: 'user', text } : null
  }
  if (msg.role === 'assistant') {
    const toolCalls = (msg.content || [])
      .filter(c => c.type === 'toolCall')
      .map(c => ({ name: c.name, args: c.arguments, status: 'done', output: '' }))
    const entry = {
      role: 'assistant',
      text: textOf(msg.content),
      thinkingText: extractThinking(msg.content),
      toolCalls,
    }
    return (entry.text || entry.toolCalls.length) ? entry : null
  }
  return null
}

// ── Tool-result attachment (shared by fold + server replay) ──
// Finds the running toolCall matching `toolName` (falls back to the last
// running one), sets its output + status. Pure: returns a new entry.
// Match preference: a running tool named `toolName`, else any tool named
// `toolName`, else any running tool. The name-any fallback is what lets the
// server's replay path attach results to toolCalls that fromMessage created
// as already-'done' (historical rows have no 'running' phase).
export function attachResult(entry, toolName, output, isError) {
  if (!entry || !entry.toolCalls || !entry.toolCalls.length) return entry
  let idx = toolName
    ? entry.toolCalls.findLastIndex(tc => tc.name === toolName && tc.status === 'running')
    : -1
  if (idx < 0 && toolName) idx = entry.toolCalls.findLastIndex(tc => tc.name === toolName)
  if (idx < 0) idx = entry.toolCalls.findLastIndex(tc => tc.status === 'running')
  if (idx < 0) return entry
  const updated = { ...entry.toolCalls[idx], status: isError ? 'error' : 'done' }
  if (output !== undefined && output !== null && output !== '') updated.output = output
  const toolCalls = [...entry.toolCalls]
  toolCalls[idx] = updated
  return { ...entry, toolCalls }
}

// ── fold: pure (entry | null, event) → entry ──
// Consumes the VALUE-producing events from a live turn and returns the next
// Entry. Ignores phase events (thinking_start/end) and orchestration events
// (message_start/end, turn_*, agent_*) — those are the reducer's job. Any
// extra fields on `entry` (e.g. transient phase flags the reducer carries on
// `current`) pass through untouched.
export function fold(entry, event) {
  if (!event || !event.type) return entry
  const cur = entry ?? empty()
  const type = event.type

  // message_update wraps a sub-event in assistantMessageEvent
  if (type === 'message_update') {
    const ae = event.assistantMessageEvent || event
    const kind = ae.type

    if (kind === 'text_delta' && ae.delta) {
      return { ...cur, text: cur.text + ae.delta }
    }
    if (kind === 'thinking_delta' && ae.delta) {
      return { ...cur, thinkingText: (cur.thinkingText || '') + ae.delta }
    }
    if (kind === 'tool_call_start') {
      return {
        ...cur,
        toolCalls: [...cur.toolCalls, {
          name: ae.toolName || ae.name || 'unknown',
          args: ae.args || ae.arguments || '',
          status: 'running',
          output: '',
        }],
      }
    }
    if (kind === 'tool_call_end') {
      const idx = cur.toolCalls.length - 1
      if (idx < 0) return cur
      const updated = { ...cur.toolCalls[idx], status: ae.isError ? 'error' : 'done' }
      if (ae.output) updated.output = ae.output
      const toolCalls = [...cur.toolCalls]
      toolCalls[idx] = updated
      return { ...cur, toolCalls }
    }
    // thinking_start / thinking_end → phase, not value. Leave entry unchanged.
    return cur
  }

  if (type === 'tool_execution_start') {
    const name = event.toolName || event.tool || 'unknown'
    const existing = cur.toolCalls.find(tc => tc.name === name && tc.status === 'running')
    if (existing) return cur
    return {
      ...cur,
      toolCalls: [...cur.toolCalls, {
        name,
        args: typeof event.args === 'object' ? event.args : (event.args || {}),
        status: 'running',
        output: '',
      }],
    }
  }

  if (type === 'tool_execution_update') {
    const idx = cur.toolCalls.findLastIndex(tc => tc.status === 'running')
    if (idx < 0) return cur
    const updated = { ...cur.toolCalls[idx] }
    const chunk = event.output || event.partialResult?.text || ''
    if (chunk) updated.output += chunk
    const toolCalls = [...cur.toolCalls]
    toolCalls[idx] = updated
    return { ...cur, toolCalls }
  }

  if (type === 'tool_execution_end') {
    let output
    const result = event.result
    if (result?.content) output = textOf(result.content)
    return attachResult(cur, event.toolName || event.tool, output, event.isError)
  }

  // Not a value-producing event — return unchanged.
  return cur
}
