// ════════════════════════════════════════════════════════════════════
// useWidgetChat — verbindet WidgetTransport + widget-Reducer (React).
// Öffnet lazy (connect beim ersten open()) — ein Seitenaufruf ohne
// Chat-Öffnung verbrennt kein Mint-Rate-Limit.
// ════════════════════════════════════════════════════════════════════
import { useEffect, useReducer, useRef, useState, useCallback } from 'react'
import { widgetReducer, initialState } from './widget-chat.js'

/** Page-Context der HOST-Seite sammeln (SOTA, ADR-0006 D5 — DATEN, nie
 *  Instruktion). Selection gekappt; serverseitig säubert composeWidgetPrompt
 *  zusätzlich. */
export function collectPageContext(doc = globalThis.document) {
  try {
    let selection = ''
    try { selection = String(doc.getSelection?.() || '').slice(0, 2000) } catch {}
    return {
      url: String(doc.location?.href || '').slice(0, 500),
      title: String(doc.title || '').slice(0, 300),
      referrer: String(doc.referrer || '').slice(0, 500),
      locale: String(globalThis.navigator?.language || '').slice(0, 35),
      selection,
    }
  } catch {
    return {}
  }
}

export function useWidgetChat({ transport, onTheme, onSettled }) {
  const [state, dispatch] = useReducer(widgetReducer, initialState)
  const [open, setOpen] = useState(false)
  const [notice, setNotice] = useState('') // Mint-/Verbindungsfehler (UI-Fläche)
  const wasStreaming = useRef(false)

  // Verbindung + Stream, sobald das Panel das erste Mal geöffnet wird.
  useEffect(() => {
    if (!open) return
    let closed = false
    let es
    ;(async () => {
      try {
        await transport.connect()
        if (closed) return
        if (transport.config?.greeting) dispatch({ type: 'config', greeting: transport.config.greeting })
        onTheme?.(transport.config?.theme)
        es = transport.openStream((type, data) => dispatch({ type, ...data }))
      } catch (e) {
        if (!closed) setNotice(e.message || 'connection failed')
      }
    })()
    return () => { closed = true; es?.close?.() }
  }, [open, transport, onTheme])

  // Turn-Ende → Host-Bridge-Event (ai-chat:reply / ai-chat:settled).
  useEffect(() => {
    if (wasStreaming.current && !state.streaming) {
      const last = [...state.entries].reverse().find(e => e.role === 'assistant')
      onSettled?.(last?.text || '')
    }
    wasStreaming.current = state.streaming
  }, [state.streaming, state.entries, onSettled])

  const send = useCallback(async (text) => {
    const t = text?.trim()
    if (!t) return
    try {
      await transport.sendPrompt(t, collectPageContext())
    } catch (e) {
      setNotice(e.message || 'prompt failed')
    }
  }, [transport])

  return { ...state, open, setOpen, send, notice }
}
