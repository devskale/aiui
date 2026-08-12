// ════════════════════════════════════════════════════════════════════
// useKeyboardShortcuts — global keyboard shortcuts for the app.
//
// Mirrors pi-web's pattern: a module-level abort-handler registry so the
// global Esc listener can stop the running agent from anywhere without
// prop-drilling. Overlays (modals/panels) register their own Esc-to-close
// via useEscape; when none is open, Esc aborts the agent.
// ════════════════════════════════════════════════════════════════════
import { useEffect } from 'react'

// Module-level registry — the current abort handler. The InputBar (or any
// component with abort access) registers here so global Esc can reach it.
let globalAbortHandler = null

/** Register (or clear) the abort handler for the global Esc shortcut. */
export function registerAbortHandler(handler) {
  globalAbortHandler = handler
}

// Overlays call useEscape(onClose) to close on Esc. We track whether any is
// mounted so the global Esc prioritizes closing an overlay over aborting.
let overlayCount = 0
/** Increment while an Esc-closable overlay is mounted. */
export function registerOverlay(open) {
  overlayCount += open ? 1 : -1
  if (overlayCount < 0) overlayCount = 0
}

/**
 * Global shortcuts:
 *   Esc            – close the topmost overlay; else abort the running agent
 *   Ctrl/Cmd+N     – new chat
 *   Ctrl/Cmd+K     – focus the composer (input)
 */
export function useKeyboardShortcuts({ onAbort, onNewChat, inputRef, isStreaming }) {
  useEffect(() => {
    registerAbortHandler(isStreaming ? onAbort : null)

    const onKey = (e) => {
      const mod = e.metaKey || e.ctrlKey

      if (mod && (e.key === 'n' || e.key === 'N')) {
        e.preventDefault()
        onNewChat()
        return
      }
      if (mod && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault()
        inputRef.current?.focus()
        return
      }
      if (e.key === 'Escape') {
        // Let textarea/input handle Esc internally (menus close first).
        const tag = e.target?.tagName
        if (tag === 'TEXTAREA' || tag === 'INPUT') return
        // If an overlay is open, it closes itself via useEscape — don't abort.
        if (overlayCount > 0) return
        if (globalAbortHandler) {
          e.preventDefault()
          globalAbortHandler()
        }
      }
    }

    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      registerAbortHandler(null)
    }
  }, [onAbort, onNewChat, inputRef, isStreaming])
}
