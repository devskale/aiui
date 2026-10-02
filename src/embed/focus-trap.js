// ════════════════════════════════════════════════════════════════════
// focus-trap — A11y-Kern der modal-Variante (ADR-0006 Phase 2).
//
// Pflicht fürs Modal: Focus bleibt im Dialog (Tab zirkuliert), beim
// Schließen kehrt der Fokus zum Auslöser zurück. Die Tab-Logik ist eine
// eigene pure Funktion (getestet); createFocusTrap klebt sie ans DOM.
// ════════════════════════════════════════════════════════════════════

/** Nächstes Tab-Ziel im Kreis (pure). index -1 = Fokus außerhalb → erstes. */
export function nextTabTarget(index, count, shift) {
  if (!Number.isFinite(count) || count <= 0) return -1
  const i = Number.isFinite(index) ? index : -1
  if (!shift) return (i + 1 + count) % count
  if (i === -1) return count - 1 // von vor dem Dialog → hinten rein
  return (i - 1 + count) % count
}

/** Focus-Trap auf ein Container-Element (Shadow-Root-Inhalt). Liefert release. */
export function createFocusTrap(container, doc = globalThis.document) {
  const SELECTOR = 'button, textarea, input, select, a[href], [tabindex]:not([tabindex="-1"])'
  const focusables = () => [...container.querySelectorAll(SELECTOR)]
    .filter(el => !el.disabled && el.getClientRects?.().length > 0)
  const restoreTo = doc?.activeElement
  const onKey = (e) => {
    if (e.key !== 'Tab') return
    const items = focusables()
    if (!items.length) { e.preventDefault(); return }
    const idx = items.indexOf(doc.activeElement)
    e.preventDefault()
    const next = items[nextTabTarget(idx, items.length, e.shiftKey)]
    next?.focus?.()
  }
  container.addEventListener('keydown', onKey)
  queueMicrotask(() => focusables()[0]?.focus?.())
  return () => {
    container.removeEventListener('keydown', onKey)
    try { restoreTo?.focus?.() } catch { /* evtl. schon weg */ }
  }
}
