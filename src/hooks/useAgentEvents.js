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
import { apiUrl } from '../lib/api.js'
import { reducer, initialState } from '../lib/agent-events-reducer.js'
import * as Entry from '../../shared/entry.js'



export function useAgentEvents(enabled = true) {
  const [state, dispatch] = useReducer(reducer, initialState)

  useEffect(() => {
    if (!enabled) return
    // Robust against service restarts (deploys): a reconnect attempt that
    // hits a 502 window puts the EventSource into CLOSED — the browser then
    // NEVER retries. We recreate it with backoff; every fresh connect gets
    // status+history+stats pushed by the server → full resync after restart.
    let es = null
    let retryTimer = null
    let backoff = 1000
    let disposed = false

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

    const connect = () => {
      es = new EventSource(apiUrl('/api/events'))
      es.onopen = () => { dispatch({ type: 'connected' }); backoff = 1000 }
      es.onerror = () => {
        dispatch({ type: 'disconnected' })
        if (es.readyState === EventSource.CLOSED && !disposed) {
          retryTimer = setTimeout(connect, backoff)
          backoff = Math.min(backoff * 2, 10000)
        }
        // CONNECTING = the browser retries on its own — leave it be.
      }
      for (const event of events) {
        es.addEventListener(event, (e) => {
          try {
            const data = JSON.parse(e.data)
            dispatch({ type: event, ...data })
          } catch {}
        })
      }
    }
    connect()

    return () => {
      disposed = true
      clearTimeout(retryTimer)
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

  const startNewChat = async (agentId) => {
    dispatch({ type: 'reset' })
    await fetch(apiUrl('/api/session/new'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(agentId ? { agent: agentId } : {}),
    })
  }

  return { ...state, sendPrompt, sendSteer, abortAgent, startNewChat, dispatch }
}
