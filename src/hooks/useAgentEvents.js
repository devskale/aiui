// ════════════════════════════════════════════════════════════════════
// useAgentEvents — SSE event reducer for the pi agent stream
//
// SDK events:
//   agent_start, agent_end
//   turn_start, turn_end
//   message_start, message_end
//   message_update (assistantMessageEvent: text_delta, thinking_delta, thinking_start, thinking_end, tool_call_start, tool_call_end)
//   tool_execution_start, tool_execution_update, tool_execution_end
//   queue_update, compaction_start/end, auto_retry_start/end
// ════════════════════════════════════════════════════════════════════
import { useReducer, useEffect } from 'react'
import { apiUrl } from '../lib/api'

const initialState = {
  entries: [],       // committed entries (user + assistant turns)
  current: null,     // in-progress assistant turn being streamed
  streaming: false,
  connected: false,
}

function reducer(state, action) {
  switch (action.type) {

    case 'connected':
      return { ...state, connected: true }

    case 'disconnected':
      return { ...state, connected: false }

    case 'user_prompt': {
      const entry = { role: 'user', text: action.text, attachments: action.attachments }
      return { ...state, entries: [...state.entries, entry], streaming: true, current: null }
    }

    case 'agent_start':
      return { ...state, streaming: true }

    case 'message_start': {
      // New assistant message starting
      // Preserve tool calls from previous message in this turn
      const prevToolCalls = state.current?.toolCalls || []
      return {
        ...state,
        current: {
          role: 'assistant',
          thinking: false,
          thinkingDone: false,
          text: '',
          toolCalls: prevToolCalls, // carry over tool calls within the same turn
          thinkingText: '',
        },
      }
    }

    case 'message_update': {
      if (!state.current) return state
      const cur = { ...state.current }
      const ae = action.assistantMessageEvent || action
      const kind = ae.type

      if (kind === 'thinking_start') {
        cur.thinking = true
        cur.thinkingDone = false
      }
      if (kind === 'thinking_end') {
        cur.thinking = false
        cur.thinkingDone = true
      }
      if (kind === 'thinking_delta' && ae.delta) {
        cur.thinkingText = (cur.thinkingText || '') + ae.delta
      }
      if (kind === 'text_delta' && ae.delta) {
        cur.text += ae.delta
      }
      if (kind === 'tool_call_start') {
        cur.toolCalls = [...cur.toolCalls, {
          name: ae.toolName || ae.name || 'unknown',
          args: ae.args || ae.arguments || '',
          status: 'running',
          output: '',
        }]
      }
      if (kind === 'tool_call_end') {
        // Find running tool and mark done
        const idx = cur.toolCalls.length - 1
        if (idx >= 0) {
          const updated = { ...cur.toolCalls[idx], status: ae.isError ? 'error' : 'done' }
          if (ae.output) updated.output = ae.output
          cur.toolCalls = [...cur.toolCalls.slice(0, idx), updated]
        }
      }

      return { ...state, current: cur }
    }

    case 'tool_execution_start': {
      // Create current if needed (tool events can arrive between messages)
      const cur = state.current
        ? { ...state.current }
        : { role: 'assistant', thinking: false, thinkingDone: false, text: '', toolCalls: [] }
      const name = action.toolName || action.tool || 'unknown'
      const existing = cur.toolCalls.find(tc => tc.name === name && tc.status === 'running')
      if (!existing) {
        cur.toolCalls = [...cur.toolCalls, {
          name,
          args: typeof action.args === 'object' ? action.args : (action.args || {}),
          status: 'running',
          output: '',
        }]
      }
      return { ...state, current: cur }
    }

    case 'tool_execution_update': {
      const cur2 = state.current
        ? { ...state.current }
        : { role: 'assistant', thinking: false, thinkingDone: false, text: '', toolCalls: [] }
      const idx2 = cur2.toolCalls.findLastIndex(tc => tc.status === 'running')
      if (idx2 >= 0) {
        const updated = { ...cur2.toolCalls[idx2] }
        if (action.output || action.partialResult) updated.output += (action.output || action.partialResult?.text || '')
        cur2.toolCalls = [...cur2.toolCalls.slice(0, idx2), updated, ...cur2.toolCalls.slice(idx2 + 1)]
      }
      return { ...state, current: cur2 }
    }

    case 'tool_execution_end': {
      const cur3 = state.current
        ? { ...state.current }
        : { role: 'assistant', thinking: false, thinkingDone: false, text: '', toolCalls: [] }
      const name3 = action.toolName || action.tool
      let idx3 = name3 ? cur3.toolCalls.findLastIndex(tc => tc.name === name3 && tc.status === 'running') : -1
      if (idx3 < 0) idx3 = cur3.toolCalls.findLastIndex(tc => tc.status === 'running')
      if (idx3 >= 0) {
        const updated = { ...cur3.toolCalls[idx3], status: action.isError ? 'error' : 'done' }
        // Extract output from result content
        const result = action.result
        if (result?.content) {
          const texts = result.content.filter(c => c.type === 'text').map(c => c.text)
          if (texts.length) updated.output = texts.join('\n')
        }
        cur3.toolCalls = [...cur3.toolCalls.slice(0, idx3), updated, ...cur3.toolCalls.slice(idx3 + 1)]
      }
      return { ...state, current: cur3 }
    }

    case 'message_end': {
      // DON'T commit current yet — tool_execution events may follow before next message_start
      // Just mark the current turn's message as complete
      if (!state.current) return state
      return { ...state, current: { ...state.current, messageComplete: true } }
    }

    case 'turn_end': {
      // Commit current to entries — the turn is fully done
      let entries = state.entries
      if (state.current && (state.current.text.trim() || state.current.toolCalls.length > 0)) {
        entries = [...entries, state.current]
      }
      return { ...state, entries, current: null }
    }

    case 'agent_end': {
      let entries = state.entries
      if (state.current && (state.current.text.trim() || state.current.toolCalls.length > 0)) {
        entries = [...entries, state.current]
      }
      return { ...state, entries, current: null, streaming: false }
    }

    case 'error': {
      return {
        ...state,
        entries: [...state.entries, { role: 'error', text: action.message || 'Unknown error' }],
        streaming: false,
        current: null,
      }
    }

    case 'reset':
      return { ...initialState, connected: state.connected }

    default:
      return state
  }
}

export function useAgentEvents() {
  const [state, dispatch] = useReducer(reducer, initialState)

  useEffect(() => {
    const es = new EventSource(apiUrl('/api/events'))

    es.onopen = () => dispatch({ type: 'connected' })
    es.onerror = () => dispatch({ type: 'disconnected' })

    const events = [
      'agent_start', 'agent_end',
      'turn_start', 'turn_end',
      'message_start', 'message_end', 'message_update',
      'tool_execution_start', 'tool_execution_update', 'tool_execution_end',
      'queue_update',
      'compaction_start', 'compaction_end',
      'auto_retry_start', 'auto_retry_end',
      'error',
    ]

    const handlers = events.map(event => {
      const handler = (e) => {
        try {
          const data = JSON.parse(e.data)
          dispatch({ type: event, ...data })
        } catch {}
      }
      es.addEventListener(event, handler)
      return { event, handler }
    })

    return () => {
      handlers.forEach(({ event, handler }) => es.removeEventListener(event, handler))
      es.close()
    }
  }, [])

  const sendPrompt = async (text, attachments = []) => {
    dispatch({ type: 'user_prompt', text, attachments })
    await fetch(apiUrl('/api/prompt'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, attachments }),
    })
  }

  const abortAgent = async () => {
    await fetch(apiUrl('/api/abort'), { method: 'POST' })
  }

  return { ...state, sendPrompt, abortAgent, dispatch }
}
