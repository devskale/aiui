// Lazy-Render-Fenster für lange Historien (Idee aus pi-web chat-lazy-load.ts,
// übernommen in aiui-Hausstil: pure Funktionen + node --test).
//
// Kernidee: die DATEN bleiben vollständig im State (Folding, Steuern, Forken
// brauchen alles) — nur das DOM ist ein Fenster aufs Ende. Beim Hochscrollen
// an den Fensterrand wächst das Fenster um PAGE_SIZE; die Scroll-Position
// wird über die Distanz-vom-Ende wiederhergestellt, damit nichts springt.

export const PAGE_SIZE = 50
export const TAIL_TOLERANCE = 8

// Sichtbares Fenster: startIndex im entries-Array + hasMore-Flag.
export function visibleWindow(totalCount, visibleCount) {
  const total = Math.max(0, totalCount | 0)
  const visible = Math.min(Math.max(0, visibleCount | 0), total)
  const startIndex = Math.max(0, total - visible)
  return { startIndex, visibleCount: visible, hasMore: startIndex > 0 }
}

// Fenster vergrößern (Reveal beim Hochscrollen / "ältere anzeigen").
export function growWindow(currentVisible, pageSize = PAGE_SIZE) {
  return currentVisible + pageSize
}

// Distanz vom Scroll-Ende vor dem Einmontieren älterer Entries — der Wert,
// der nach dem Rerender wiederhergestellt wird (scrollHeight ändert sich).
export function captureScrollDistance(scrollHeight, scrollTop) {
  return Math.max(0, scrollHeight - scrollTop)
}

// scrollTop-Wert, der die gespeicherte Distanz wiederherstellt.
export function restoreScrollTop(newScrollHeight, savedDistance) {
  return Math.max(0, newScrollHeight - savedDistance)
}

// Autoscroll nur ankleben, wenn der Nutzer wirklich am Ende ist.
export function isAtTail(scrollTop, clientHeight, scrollHeight, tolerance = TAIL_TOLERANCE) {
  return scrollHeight - scrollTop - clientHeight <= tolerance
}

// Live-Streaming: das Fenster wächst mit, solange der Nutzer am Ende klebt
// (neue Turns sind immer sichtbar); beim Hochscrollen bleibt es fixiert.
export function growWithStream(currentVisible, entryCount, atTail, pageSize = PAGE_SIZE) {
  if (!atTail) return currentVisible
  return Math.max(currentVisible, entryCount)
}
