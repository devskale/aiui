// ════════════════════════════════════════════════════════════════════
// canvas-parse — tolerant parsen + normalisieren einer canvas.json
// (ADR-0005). Rein: roher Dateiinhalt → gerenderbarer Zustand oder
// ein ehrlicher Fehlerzustand; wirft nie.
//
//   { canvas: 1, title, subtitle, progress[], cards[], gaps[], next[], report }
//   | { unsupported: true, raw }   Major ≠ 1 oder kein Objekt
//   | { parseError: true, raw }    kaputtes JSON
//   | null                         leere Eingabe
//
// Alles ist optional außer `canvas: 1`; Längen werden gekappt, Strings
// gesäubert — das Panel kann aus einem normalisierten Ergebnis nie
// kaputtgehen.
// ════════════════════════════════════════════════════════════════════

const PROGRESS_STATES = ['done', 'running', 'pending', 'degraded']

const str = (v, cap = 300) => (typeof v === 'string' ? v.slice(0, cap) : '')
const arr = (v, cap = 100) => (Array.isArray(v) ? v.slice(0, cap) : [])

function normalizeProgress(p) {
  if (typeof p === 'string') return { label: p.slice(0, 160), state: 'pending', note: '' }
  const state = PROGRESS_STATES.includes(p?.state) ? p.state : 'pending'
  return { label: str(p?.label, 160), state, note: str(p?.note, 240) }
}

function normalizeCard(c) {
  if (c == null || typeof c !== 'object') return { type: 'string', title: '', data: String(c), source: null }
  return {
    type: str(c.type, 60) || 'unknown',
    title: str(c.title, 160),
    data: c.data === undefined ? null : c.data,
    source: str(c.source, 300) || null,
  }
}

/** Parsen + Normalisieren. `raw` ist der Dateiinhalt (String). */
export function parseCanvas(raw) {
  if (typeof raw !== 'string' || !raw.trim()) return null
  let data
  try { data = JSON.parse(raw) } catch { return { parseError: true, raw: raw.slice(0, 2000) } }
  if (data == null || typeof data !== 'object' || Array.isArray(data) || data.canvas !== 1) {
    return { unsupported: true, raw: JSON.stringify(data).slice(0, 2000) }
  }
  return {
    canvas: 1,
    title: str(data.title, 120),
    subtitle: str(data.subtitle, 200),
    progress: arr(data.progress, 50).map(normalizeProgress),
    cards: arr(data.cards, 100).map(normalizeCard),
    gaps: arr(data.gaps, 50).map((g) => str(typeof g === 'string' ? g : JSON.stringify(g), 300)),
    next: arr(data.next, 8).map((n) => str(n, 300)),
    report: str(data.report, 300) || null,
  }
}
