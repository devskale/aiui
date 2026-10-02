// ════════════════════════════════════════════════════════════════════
// theme — Key-Config-Theme als CSS-Custom-Properties im Shadow-Root.
//
// Config als Daten (ADR-0006 D4): ein neuer Kunde ist ein JSON-Block im
// Key, keine Code-Änderung. Der Host kann via --aiw-* auf seinem Element
// ebenfalls übersteuern — Shadow-DOM kapselt nach innen, Custom Properties
// vererben nach innen. Kein CSS-Injection-Risiko: Werte werden auf
// sichere Zeichen reduziert.
// ════════════════════════════════════════════════════════════════════

const SAFE_COLOR = /^[\w#(),.% -]{1,40}$/ // hex, rgb(), oklch()-Bausteine …
const SAFE_TEXT = /^[\w ,.!?:;äöüßÄÖÜ&'"()/+-]{0,80}$/i

export const THEME_DEFAULTS = {
  '--aiw-accent': '#10b981',   // aiui-emerald
  '--aiw-radius': '14px',
}

/** Theme aus der Key-Config auf einen Knoten anwenden (pure außer set). */
export function applyTheme(node, theme = {}) {
  if (!node || !theme || typeof theme !== 'object') return
  if (theme.accent && SAFE_COLOR.test(String(theme.accent))) {
    node.style.setProperty('--aiw-accent', String(theme.accent))
  }
  if (theme.radius && SAFE_COLOR.test(String(theme.radius))) {
    node.style.setProperty('--aiw-radius', String(theme.radius))
  }
}

/** launcherLabel/greeting säubern (Text-Fläche, kein Markup). */
export function safeText(v, fallback = '') {
  const s = String(v ?? '').trim()
  return SAFE_TEXT.test(s) ? s : fallback
}
