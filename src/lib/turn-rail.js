// ════════════════════════════════════════════════════════════════════
// turn-rail — reine Logik für die Turn-Navigation (Issue turn-navigation).
//
// dsh-Vorbild (ui-chat): fixede Pitch-Marks am Transkript-Rand; Aktivierung
// einer noch nicht gerenderten Turn pagiert die Historie und landet auf der
// Row. Hier auf aiui übersetzt: Marks = User-Entries (Turn-Starts), das
// Lazy-Render-Fenster (chat-window.js) wächst bei Sprüngen ins Alte.
//
// Pure Funktionen, node --test: keine DOM-Abhängigkeiten.
// ════════════════════════════════════════════════════════════════════

export const MARK_TITLE_LEN = 80
// Mark-Höhe nach Tool-Call-Anzahl des Turns (pi-web #939 / dsh-Rail: eine
// 1-Zeilen-Antwort und ein 45-Tool-Deep-Research sind auf einen Blick
// unterscheidbar). Sqrt-Skalierung: früh wachsen, bei 22px deckeln.
export const MARK_MIN_H = 9
export const MARK_MAX_H = 22
export function markHeight(weight) {
  const w = Number.isFinite(weight) ? Math.max(0, weight | 0) : 0
  return Math.min(MARK_MAX_H, MARK_MIN_H + Math.ceil(Math.sqrt(w) * 2))
}

/**
 * Turn-Marks aus der Entry-Liste: eine pro User-Entry (Turn-Start), plus
 * Gewicht = Tool-Calls der Assistant-Antwort(en) dieses Turns (bis zur
 * nächsten User-Entry) — pi-web #939 „per-turn tool-call count badge",
 * hier als Mark-Höhe statt Badge.
 *
 * @param {Array<{role?: string, text?: string, toolCalls?: Array<unknown>}>} entries
 * @returns {Array<{index: number, number: number, title: string, weight: number}>}
 */
export function turnMarks(entries) {
  const out = []
  if (!Array.isArray(entries)) return out
  let n = 0
  let weight = 0
  entries.forEach((e, i) => {
    if (!e) return
    if (e.role === 'user') {
      n += 1
      const raw = String(e.text || '').replace(/\s+/g, ' ').trim()
      const title = raw.length > MARK_TITLE_LEN ? raw.slice(0, MARK_TITLE_LEN - 1) + '…' : (raw || '(no text)')
      weight = 0 // pro Turn neu zählen — kein Erben des Vorgänger-Turns
      out.push({ index: i, number: n, title, weight: 0 })
      return
    }
    // Assistant/Error-Zeilen bis zum nächsten User-Entry gehören zum
    // letzten geöffneten Turn.
    if (out.length && Array.isArray(e.toolCalls)) weight += e.toolCalls.length
    if (out.length) out[out.length - 1].weight = weight
  })
  return out
}

/**
 * Sichtbares Fenster, das den Sprung-index einschließt (inklusive, plus
 * nichts darüber hinaus — Lazy-Render bleibt maximal sparsam). Innerhalb des
 * aktuellen Fensters → unverändert (kein unnötiges Aufdecken).
 *
 * @param {number} currentVisible aktuelles visibleCount
 * @param {number} totalCount      entries.length
 * @param {number} index           absolute Sprung-Position
 * @returns {number} benötigtes visibleCount (>= currentVisible)
 */
export function visibleCountForJump(currentVisible, totalCount, index) {
  const cur = Number.isFinite(currentVisible) ? Math.max(0, currentVisible | 0) : 0
  const total = Number.isFinite(totalCount) ? Math.max(0, totalCount | 0) : 0
  const idx = Number.isFinite(index) ? Math.max(0, Math.min(index | 0, Math.max(0, total - 1))) : 0
  const needed = Math.max(0, total - idx)
  return Math.max(cur, needed)
}
