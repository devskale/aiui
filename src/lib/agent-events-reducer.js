// ════════════════════════════════════════════════════════════════════
// agent-events-reducer — pure SSE→State-Faltung der Haupt-App.
//
// Eigenes Modul (nicht im Hook): der Reducer ist reine Logik ohne
// React/Vite-Abhängigkeiten und damit in node --test lauffähig —
// useAgentEvents.js importiert api.js (import.meta.env) und wäre als
// Test-Import in node nicht ladbar. Widget-Gegenstück: src/embed/widget-chat.js.
// ════════════════════════════════════════════════════════════════════
import * as Entry from '../../shared/entry.js'

export const initialState = {
  entries: [],       // committed entries (user + assistant turns)
  current: null,     // in-progress assistant turn being streamed
  steerQueue: [],    // transient steer messages shown while streaming
  streaming: false,
  connected: false,
  sessionAlive: false,
  sessionAgent: 'default',
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

export function reducer(state, action) {
  switch (action.type) {

    case 'connected':
      return { ...state, connected: true }

    case 'disconnected':
      return { ...state, connected: false, sessionAlive: false, sessionModel: null }

    case 'session_status':
      return {
        ...state,
        sessionAlive: action.alive,
        sessionAgent: action.agent ?? state.sessionAgent,
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
      // Provider-Fehler live sichtbar (SDK: Content leer, errorMessage am
      // Message-Objekt). Stash am current; die Commit-Punkte (turn_end /
      // agent_end / agent_settled) machen daraus eine Error-Row — sonst wäre
      // der fehlgeschlagene Turn unsichtbar.
      if (action.message?.errorMessage && !state.current.text && !state.current.toolCalls.length) {
        return { ...state, current: { ...state.current, errorMessage: action.message.errorMessage } }
      }
      return { ...state, current: { ...state.current, messageComplete: true } }
    }

    case 'turn_end': {
      // Commit current to entries — the turn is fully done
      let entries = state.entries
      if (state.current && (state.current.text.trim() || state.current.toolCalls.length > 0)) {
        entries = [...entries, state.current]
      }
      if (state.current?.errorMessage && !state.current.text && !state.current.toolCalls.length) {
        entries = [...entries, Entry.error(state.current.errorMessage)]
      }
      return { ...state, entries, current: null }
    }

    case 'agent_end': {
      let entries = state.entries
      if (state.current && (state.current.text.trim() || state.current.toolCalls.length > 0)) {
        entries = [...entries, state.current]
      }
      if (state.current?.errorMessage && !state.current.text && !state.current.toolCalls.length) {
        entries = [...entries, Entry.error(state.current.errorMessage)]
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
      if (state.current?.errorMessage && !state.current.text && !state.current.toolCalls.length) {
        entries = [...entries, Entry.error(state.current.errorMessage)]
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
      return { ...initialState, connected: state.connected, sessionAlive: state.sessionAlive, sessionAgent: state.sessionAgent, sessionModel: state.sessionModel, sessionStats: state.sessionStats }

    default:
      return state
  }
}
