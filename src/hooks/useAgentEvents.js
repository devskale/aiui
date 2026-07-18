// ════════════════════════════════════════════════════════════════════
// useAgentEvents — SSE event reducer for the pi agent stream
//
// SDK events:
//   agent_start, agent_end, agent_settled
//   turn_start, turn_end
//   message_start, message_end
//   message_update (assistantMessageEvent: text_delta, thinking_delta, thinking_start, thinking_end, tool_call_start, tool_call_end)
//   tool_execution_start, tool_execution_update, tool_execution_end
//   queue_update, compaction_start/end, auto_retry_start/end
// ════════════════════════════════════════════════════════════════════
import { useReducer, useEffect } from 'react'
import { apiUrl } from '../lib/api'
import * as Entry from '../../shared/entry.js'

const initialState = {
  entries: [],       // committed entries (user + assistant turns)
  current: null,     // in-progress assistant turn being streamed
  steerQueue: [],    // transient steer messages shown while streaming
  streaming: false,
  connected: false,
  sessionAlive: false,
  sessionModel: null,
  sessionId: null,
  sessionCwd: null,
  sessionCwdShort: null,
  sessionStartedAt: null,
  sessionStats: null,
  thinkingLevel: null,
  isCompacting: false,
  autoCompactionEnabled: true,
}

function reducer(state, action) {
  switch (action.type) {

    case 'connected':
      return { ...state, connected: true }

    case 'disconnected':
      return { ...state, connected: false, sessionAlive: false, sessionModel: null }

    case 'session_status':
      return {
        ...state,
        sessionAlive: action.alive,
        sessionModel: action.model,
        sessionId: action.sessionId ?? state.sessionId,
        sessionCwd: action.cwd ?? state.sessionCwd,
        sessionCwdShort: action.cwdShort ?? state.sessionCwdShort,
        sessionStartedAt: action.startedAt ?? state.sessionStartedAt,
        streaming: action.streaming ?? state.streaming,
        thinkingLevel: action.thinkingLevel ?? state.thinkingLevel,
        isCompacting: action.isCompacting ?? state.isCompacting,
        autoCompactionEnabled: action.autoCompactionEnabled ?? state.autoCompactionEnabled,
      }

    case 'session_stats':
      return { ...state, sessionStats: action }

    case 'session_history':
      return { ...state, entries: action.entries || [], current: null, steerQueue: [] }

    case 'thinking_level_changed':
      return { ...state, thinkingLevel: action.level }

    case 'compaction_start':
      return { ...state, isCompacting: true }

    case 'compaction_end':
      return { ...state, isCompacting: false }

    case 'user_prompt': {
      const entry = Entry.fromUser(action.text, action.attachments)
      return { ...state, entries: [...state.entries, entry], streaming: true, current: null }
    }

    case 'user_steer': {
      // Queued while streaming — shown transiently, cleared on next turn_start
      return { ...state, steerQueue: [...state.steerQueue, action.text] }
    }

    case 'agent_start':
      return { ...state, streaming: true }

    case 'queue_update':
      // SDK source of truth for queued steer/follow-up messages
      return { ...state, steerQueue: action.steering || [] }

    case 'message_start': {
      // Orchestration (reducer owns): seed `current`, carrying tool calls from
      // the previous message in this turn. The value shape comes from Entry.
      const prevToolCalls = state.current?.toolCalls || []
      return {
        ...state,
        current: { ...Entry.empty(prevToolCalls), thinking: false, thinkingDone: false },
      }
    }

    case 'message_update': {
      if (!state.current) return state
      const ae = action.assistantMessageEvent || action
      const kind = ae.type
      // Phase (reducer owns): thinking-in-progress flags are transient view state.
      const phase = {}
      if (kind === 'thinking_start') { phase.thinking = true; phase.thinkingDone = false }
      if (kind === 'thinking_end') { phase.thinking = false; phase.thinkingDone = true }
      // Value (Entry owns): text/thinking deltas + tool calls. fold ignores
      // phase sub-events, so it's safe to call for every message_update.
      const folded = Entry.fold(state.current, action)
      return { ...state, current: { ...folded, ...phase } }
    }

    case 'tool_execution_start':
    case 'tool_execution_update':
    case 'tool_execution_end': {
      // Pure value events — Entry.fold owns all of it (matching, output, status).
      const cur = state.current
        ? state.current
        : { ...Entry.empty(), thinking: false, thinkingDone: false }
      return { ...state, current: Entry.fold(cur, action) }
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
      // Stay streaming until agent_settled (SDK 0.80.4+): tool calls or
      // steering messages may still be pending after agent_end.
      return { ...state, entries, current: null }
    }

    case 'agent_settled': {
      // Agent is fully settled — no pending tool calls or steering messages.
      let entries = state.entries
      if (state.current && (state.current.text.trim() || state.current.toolCalls.length > 0)) {
        entries = [...entries, state.current]
      }
      return { ...state, entries, current: null, streaming: false }
    }

    case 'error': {
      return {
        ...state,
        entries: [...state.entries, Entry.error(action.message)],
        streaming: false,
        current: null,
      }
    }

    case 'reset':
      return { ...initialState, connected: state.connected, sessionAlive: state.sessionAlive, sessionModel: state.sessionModel, sessionStats: state.sessionStats }

    default:
      return state
  }
}

export function useAgentEvents(enabled = true) {
  const [state, dispatch] = useReducer(reducer, initialState)

  useEffect(() => {
    if (!enabled) return
    const es = new EventSource(apiUrl('/api/events'))

    es.onopen = () => dispatch({ type: 'connected' })
    es.onerror = () => dispatch({ type: 'disconnected' })

    const events = [
      'agent_start', 'agent_end', 'agent_settled',
      'turn_start', 'turn_end',
      'message_start', 'message_end', 'message_update',
      'tool_execution_start', 'tool_execution_update', 'tool_execution_end',
      'queue_update',
      'compaction_start', 'compaction_end',
      'auto_retry_start', 'auto_retry_end',
      'session_status', 'session_stats',
      'session_history',
      'thinking_level_changed',
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
  }, [enabled])

  const sendPrompt = async (text, attachments = []) => {
    if (!enabled) return
    dispatch({ type: 'user_prompt', text, attachments })
    await fetch(apiUrl('/api/prompt'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, attachments }),
    })
  }

  const sendSteer = async (text, attachments = []) => {
    if (!enabled) return
    dispatch({ type: 'user_steer', text })
    await fetch(apiUrl('/api/prompt'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, attachments }),
    })
  }

  const abortAgent = async () => {
    await fetch(apiUrl('/api/abort'), { method: 'POST' })
  }

  const startNewChat = async () => {
    dispatch({ type: 'reset' })
    await fetch(apiUrl('/api/session/new'), { method: 'POST' })
  }

  return { ...state, sendPrompt, sendSteer, abortAgent, startNewChat, dispatch }
}
