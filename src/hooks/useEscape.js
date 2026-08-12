// ════════════════════════════════════════════════════════════════════
// useEscape — close an overlay on Escape. Shared by every modal/panel so the
// behavior is consistent (and so each one doesn't re-implement the listener).
// ════════════════════════════════════════════════════════════════════
import { useEffect } from 'react'
import { registerOverlay } from './useKeyboardShortcuts'

export function useEscape(onClose) {
  useEffect(() => {
    registerOverlay(true)
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      registerOverlay(false)
    }
  }, [onClose])
}
