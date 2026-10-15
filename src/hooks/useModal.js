// ════════════════════════════════════════════════════════════════════
// useModal — a11y-Kern für die App-Overlays (dsh-Lektion: „Modal and the
// settings shell share top-layer Escape and Tab handling, restoring the
// previous focus on close").
//
// Was der Hook pro Overlay sicherstellt:
//   1. Tab-Zirkulation bleibt IM Container (pure Logik: nextTabTarget aus
//      src/embed/focus-trap.js — dort getestet; der Widget-Modal-Trap und
//      die App-Overlays teilen sich dieselbe Funktion, keine zweite Kopie).
//   2. Beim Öffnen bekommt der Dialog den Fokus (falls die Komponente nicht
//      selbst schon eines ihrer Felder fokussiert hat).
//   3. Beim Schließen kehrt der Fokus zum Auslöser zurück.
//   4. Escape schließt NUR das oberste Overlay (Stack) — verschachtelte
//      Dialoge schließen nicht im Chor. Ersetzt useEscape in den Overlays.
// ════════════════════════════════════════════════════════════════════
import { useLayoutEffect, useRef } from 'react'
import { nextTabTarget } from '../embed/focus-trap'
import { registerOverlay } from './useKeyboardShortcuts'

// Offene Modals, unten = zuerst geöffnet. Modul-global: mehrere gleichzeitige
// Overlays entscheiden so, wer „oben" ist, ohne Props durchzureichen.
const stack = []

// Focus-Historie: beim Schließen kehrt der Fokus zum letzten Element
// AUSSERHALB des Containers zurück. Ein activeElement-Snapshot im Effect
// reicht nicht — der Effect läuft NACH dem Autofocus der Komponente
// (ModelPicker fokussiert z.B. sein Suchfeld), der Snapshot wäre also schon
// der Dialog selbst. Die Historie löst auch Verschachtelung: schließt der
// innere Dialog, ist das letzte Element außerhalb seiner der Auslöser im
// äußeren.
const focusLog = []
if (typeof document !== 'undefined') {
  document.addEventListener('focusin', (e) => {
    focusLog.push(e.target)
    if (focusLog.length > 50) focusLog.shift()
  }, true)
}

export function useModal(ref, { onClose, escape = true } = {}) {
  // onClose darf sich pro Render ändern, ohne den Listener neu zu binden.
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  // useLayoutEffect (nicht useEffect): Layout-Effects laufen VOR den
  // passiven Effects derselben Komponente — der Snapshot landet also noch
  // auf dem Auslöser, BEVOR ModelPicker/AgentPicker ihr Suchfeld
  // autofokussieren. Damit ist restoreTo die primäre, rassenfreie Quelle;
  // die focusLog-Historie bleibt nur noch Fallback für Verschachtelung.
  useLayoutEffect(() => {
    const container = ref.current
    if (!container) return
    const doc = container.ownerDocument || document

    const SELECTOR = 'button, textarea, input, select, a[href], [tabindex]:not([tabindex="-1"])'
    const focusables = () => [...container.querySelectorAll(SELECTOR)]
      .filter(el => !el.disabled && el.getClientRects?.().length > 0)

    const restoreTo = doc.activeElement
    stack.push(container)
    registerOverlay(true)

    const onKey = (e) => {
      if (stack[stack.length - 1] !== container) return // nur das oberste
      if (e.key === 'Escape') {
        if (!escape || !onCloseRef.current) return
        e.preventDefault()
        e.stopPropagation()
        onCloseRef.current()
        return
      }
      if (e.key !== 'Tab') return
      const items = focusables()
      if (!items.length) { e.preventDefault(); return }
      const idx = items.indexOf(doc.activeElement)
      e.preventDefault()
      items[nextTabTarget(idx, items.length, e.shiftKey)]?.focus?.()
    }
    // Capture: erster Zugriff — schlägt window-level Listener (z.B. globale
    // Esc-abort-Shortcuts) und gilt auch, wenn der Fokus mal auf body landet.
    doc.addEventListener('keydown', onKey, true)

    // Start-Fokus nur setzen, wenn die Komponente nicht selbst fokussiert hat
    // (ModelPicker/AgentPicker fokussieren bewusst ihr Suchfeld).
    queueMicrotask(() => {
      if (!container.contains(doc.activeElement)) focusables()[0]?.focus?.()
    })

    return () => {
      const i = stack.indexOf(container)
      if (i >= 0) stack.splice(i, 1)
      doc.removeEventListener('keydown', onKey, true)
      registerOverlay(false)
      // Fokus-Rückkehr: letztes fokussiertes Element außerhalb dieses Dialogs,
      // noch im DOM. Fallback: Snapshot beim Öffnen, falls der außerhalb lag
      // (z.B. .focus() auf den Auslöser direkt vor dem Mount, ohne focusin).
      let target = null
      for (let k = focusLog.length - 1; k >= 0; k--) {
        const el = focusLog[k]
        if (el && el.isConnected && !container.contains(el)) { target = el; break }
      }
      if (!target && restoreTo && !container.contains(restoreTo)) target = restoreTo
      try { target?.focus?.() } catch { /* Auslöser evtl. weg */ }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
}
