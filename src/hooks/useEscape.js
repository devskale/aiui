// ════════════════════════════════════════════════════════════════════
// useEscape — close an overlay on Escape. Shared by every modal/panel so the
// behavior is consistent (and so each one doesn't re-implement the listener).
// ════════════════════════════════════════════════════════════════════
import { useEffect } from 'react'

export function useEscape(onClose) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
}
