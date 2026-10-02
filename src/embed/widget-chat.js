// ════════════════════════════════════════════════════════════════════
// widget-chat — schmaler SSE-Reducer fürs Embed-Widget.
//
// Wiederverwendung statt Fork (ADR-0006 D4): der Entry-Wert und das
// Live-Folding kommen 1:1 aus shared/entry.js — dieselbe Form wie die
// Haupt-App (UserEntry/AssistantEntry rendern unverändert). Was hier fehlt
// (Sessions, Models, Sidebar-Zustand) gehört bewusst nicht ins Widget.
// ════════════════════════════════════════════════════════════════════
import * as Entry from '../../shared/entry.js'

export const initialState = {
  entries: [],      // committed Entries (Entry value shape)
  current: null,    // live Entry während eines Turns
  streaming: false,
  sessionModel: null,
  greeting: '',     // aus der Key-Config (über connect gesetzt, nicht SSE)
  error: null,
}

export function widgetReducer(state = initialState, action = {}) {
  switch (action.type) {
    case 'config': // Transport-Config (greeting etc.) — kein SSE-Event
      return { ...state, greeting: action.greeting || '' }
    case 'session_status':
      return { ...state, sessionModel: action.model ?? state.sessionModel }
    case 'session_history':
      return { ...state, entries: action.entries || [], current: null }
    case 'user_prompt':
      return {
        ...state,
        entries: [...state.entries, Entry.fromUser(action.text, action.attachments)],
        current: null,
        streaming: true,
        error: null,
      }
    case 'error':
      return { ...state, streaming: false, current: null, error: action.message || 'error' }
    case 'agent_start':
    case 'agent_end':
      return state
    case 'message_update': {
      // Phase-Flags wie die Haupt-App (transiente View-State) — der Wert
      // selbst kommt aus Entry.fold.
      const ae = action.assistantMessageEvent || action
      const phase = {}
      if (ae.type === 'thinking_start') { phase.thinking = true; phase.thinkingDone = false }
      if (ae.type === 'thinking_end') { phase.thinking = false; phase.thinkingDone = true }
      const folded = Entry.fold(state.current, action)
      return { ...state, current: { ...folded, ...phase } }
    }
    case 'agent_settled': {
      const entries = state.current && (state.current.text.trim() || state.current.toolCalls.length)
        ? [...state.entries, state.current]
        : state.entries
      return { ...state, entries, current: null, streaming: false }
    }
    default: {
      // Wert-produzierende Events → Entry.fold (shared, getestet)
      const folded = Entry.fold(state.current, action)
      if (folded !== state.current) return { ...state, current: folded }
      return state
    }
  }
}
