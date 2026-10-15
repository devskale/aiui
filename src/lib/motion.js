// ════════════════════════════════════════════════════════════════════
// motion — reduced-motion gate for JS-driven movement.
//
// dsh-Lektion (docs/web-styling.md): „Preserve keyboard focus visibility and
// reduced-motion behavior when adding transitions or hover-only controls."
// CSS handle ich per @media (prefers-reduced-motion: reduce); für
// scrollIntoView({ behavior }) braucht es dieselbe Entscheidung in JS —
// sonst fährt der Chat trotz Systemwunsch weich.
//
// Rein + testbar: die MQL-Auswertung ist eine Funktion, der Browser-Zugriff
// ist der dünne Wrapper drumherum.
// ════════════════════════════════════════════════════════════════════

// Reine Auswertung einer MediaQueryList (nur `.matches` zählt).
export function reducedMotionFrom(mql) {
  return !!(mql && mql.matches)
}

// Browser-Wrapper: fehlt matchMedia (alte Umgebungen, SSR, Tests) → false
// (Animation erlaubt, niemals werfen).
export function prefersReducedMotion(win = typeof window !== 'undefined' ? window : undefined) {
  if (!win || typeof win.matchMedia !== 'function') return false
  return reducedMotionFrom(win.matchMedia('(prefers-reduced-motion: reduce)'))
}
