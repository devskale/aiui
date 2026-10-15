// ════════════════════════════════════════════════════════════════════
// Toasts — app-weite Toast-Fläche (Issue toast-surface).
//
// dsh-Regel: transiente Ergebnis-Meldungen gehören einem Owner, der
// AUSSERHALB der meldenden Fläche lebt — ein Toast, den das Panel selbst
// rendert, stirbt mit ihm. Hier: ToastProvider in App-Root, über allen
// Overlays; InputBar (& künftige Quellen) melden über useToast().
//
// Escape-Priorität (niedrigste): bereits behandelte Events
// (e.defaultPrevented — Modal-Stack, Composer-Abort) gewinnen; der Toast
// konsumiert Escape nur, wenn sonst niemand es will. aria-live="polite"
// auf dem Container — Screenreader bekommt jede Meldung genau einmal.
// Widget (embed) bleibt bewusst außen vor: eigenes Surface, eigener Weg.
// ════════════════════════════════════════════════════════════════════
import { createContext, useCallback, useContext, useEffect, useReducer, useRef } from 'react'
import { pushToast, dismissToast, DEFAULT_TTL } from '../lib/toast-queue'

const ToastCtx = createContext(null)

/** toast({ kind: 'info'|'warn'|'error', text, ttl? }) — ttl 0 = manuell. */
export function useToast() {
  const ctx = useContext(ToastCtx)
  return ctx?.toast || (() => {})
}

function reducer(state, action) {
  if (action.type === 'push') return pushToast(state, action.toast)
  if (action.type === 'dismiss') return dismissToast(state, action.id)
  return state
}

export function ToastProvider({ children }) {
  const [toasts, dispatch] = useReducer(reducer, [])
  const idRef = useRef(0)
  const timersRef = useRef(new Map())
  // Spiegel für den Escape-Handler (kein Stale-Closure über den State).
  const toastsRef = useRef(toasts)
  toastsRef.current = toasts

  const dismiss = useCallback((id) => {
    const timer = timersRef.current.get(id)
    if (timer) { clearTimeout(timer); timersRef.current.delete(id) }
    dispatch({ type: 'dismiss', id })
  }, [])

  const toast = useCallback((t) => {
    if (!t || !t.text) return
    const id = ++idRef.current
    dispatch({ type: 'push', toast: { ...t, id } })
    const ttl = Number.isFinite(t.ttl) ? t.ttl : DEFAULT_TTL
    if (ttl > 0) {
      timersRef.current.set(id, setTimeout(() => dismiss(id), ttl))
    }
  }, [dismiss])

  // Escape schließt den OBERSTEN Toast — aber nur, wenn kein anderer
  // Handler (Modal-Stack per Capture+stopPropagation, Composer-Abort per
  // preventDefault) das Event schon konsumiert hat.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return
      const list = toastsRef.current
      if (!list.length) return
      e.preventDefault()
      dismiss(list[list.length - 1].id)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [dismiss])

  // Unmount: laufende Timer mitreißen (keine setState-after-unmount).
  useEffect(() => () => {
    for (const timer of timersRef.current.values()) clearTimeout(timer)
    timersRef.current.clear()
  }, [])

  return (
    <ToastCtx.Provider value={{ toast, dismiss }}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map(t => (
          <div key={t.id} className={`toast toast--${t.kind || 'info'}`}>
            <span className="toast-dot" aria-hidden="true" />
            <span className="toast-text">{t.text}</span>
            <button className="toast-x" onClick={() => dismiss(t.id)} aria-label="Dismiss notification">✕</button>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  )
}
