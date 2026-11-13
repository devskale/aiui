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

export function useWidgetChat({ transport, onTheme, onSettled, onHostAction }) {
  const [state, dispatch] = useReducer(widgetReducer, initialState)
  const [open, setOpen] = useState(false)
  const [notice, setNotice] = useState('') // Mint-/Verbindungsfehler (UI-Fläche)
  const [config, setConfig] = useState(null) // Key-Config (variant, greeting…)
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
        setConfig(transport.config || {})
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
    // User-Eintrag CLIENTSEITIG, vor dem POST — genau wie die Haupt-App
    // (useAgentEvents.sendPrompt). Der Server sendet user_prompt nicht
    // zurück; ohne das hier erscheint die eigene Nachricht im Widget nie.
    dispatch({ type: 'user_prompt', text: t, attachments: [] })
    try {
      await transport.sendPrompt(t, collectPageContext())
    } catch (e) {
      setNotice(e.message || 'prompt failed')
    }
  }, [transport])

  // ── Host-Actions (ADR-0006 Phase 2) ──
  // Confirm: Karte hat ihren Zweck erfüllt → abräumen und dem HOST die
  // Ausführung überlassen (ai-chat:host-action-Event). Das Ergebnis kommt
  // asynchron über el.resolveHostAction(id, { ok, result }) zurück — erst
  // DANN relaischt der POST; der Host bekommt nie das Widget-Token.
  const confirmHostAction = useCallback((card) => {
    if (!card?.id) return
    dispatch({ type: 'host_action_clear', id: card.id })
    onHostAction?.({ id: card.id, action: card.action, args: card.args ?? null })
  }, [onHostAction])

  // Decline: direkt beantworten — der Host erfährt von keiner Ausführung.
  const declineHostAction = useCallback(async (id) => {
    dispatch({ type: 'host_action_clear', id })
    try { await transport.answerHostAction(id, { declined: true }) } catch { /* Server-TimeOut fängt den Rest */ }
  }, [transport])

  // Host-Ergebnis (Element-Methode el.resolveHostAction) → geparktes Tool.
  const resolveHostAction = useCallback(async (id, result = {}) => {
    try { await transport.answerHostAction(id, { ok: result.ok !== false, result: String(result.result ?? '') }) }
    catch (e) { setNotice(e.message || 'host action failed') }
  }, [transport])

  return { ...state, open, setOpen, send, notice, config, confirmHostAction, declineHostAction, resolveHostAction }
}
