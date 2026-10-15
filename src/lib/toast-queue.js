// ════════════════════════════════════════════════════════════════════
// toast-queue — reine Toast-Listen-Logik (dsh-Lektion: „Transient operation
// outcomes use the app-wide Toast primitive … a toast rendered by the panel
// itself unmounts with that panel").
//
// Queue-Regeln als pure Funktionen (node --test):
//   - pushToast: hängt an, kappt auf MAX_TOASTS (älteste fliegen zuerst)
//   - dismissToast: entfernt genau eine id
// Die id vergibt der Aufrufer (Provider-Inkrement) — hier bleibt alles
// deterministisch testbar.
// ════════════════════════════════════════════════════════════════════

export const MAX_TOASTS = 3
export const DEFAULT_TTL = 4000

/**
 * Toast an die Liste hängen, älteste über MAX_TOASTS kappen.
 *
 * @param {Array<{id: number|string, kind?: string, text: string, ttl?: number}>} list
 * @param {{id: number|string, kind?: string, text: string, ttl?: number}} toast
 * @param {number} max
 * @returns {Array} neue Liste (Eingabe unberührt)
 */
export function pushToast(list, toast, max = MAX_TOASTS) {
  const base = Array.isArray(list) ? list : []
  if (!toast || toast.id == null) return base
  const entry = { kind: 'info', ttl: DEFAULT_TTL, ...toast }
  const next = [...base, entry]
  const cap = Number.isFinite(max) && max > 0 ? Math.floor(max) : MAX_TOASTS
  return next.length > cap ? next.slice(next.length - cap) : next
}

/**
 * Toast per id entfernen.
 *
 * @param {Array<{id: number|string}>} list
 * @param {number|string} id
 * @returns {Array} neue Liste
 */
export function dismissToast(list, id) {
  const base = Array.isArray(list) ? list : []
  return base.filter(t => t.id !== id)
}
