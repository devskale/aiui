// ════════════════════════════════════════════════════════════════════
// preview-kind — welche Vorschau-Art eine Workspace-Datei bekommt
// (Issue file-preview-pane; dsh ui-sidebar-documentpreview-Muster:
// Renderer-Auswahl nach Typ).
//
// Rein: { name, contentType?, isImage? } → 'markdown' | 'html' | 'image'
// | 'pdf' | 'text'. Wirft nie; unbekannt → 'text' (Quelle).
// ════════════════════════════════════════════════════════════════════

const MD_RE = /\.(md|markdown|mdown)$/i
const HTML_RE = /\.(html?|svg)$/i
const IMG_RE = /\.(png|jpe?g|gif|webp|bmp|avif)$/i

/**
 * @param {{name?: string, contentType?: string|null, isImage?: boolean}} f
 * @returns {'markdown'|'html'|'image'|'pdf'|'text'}
 */
export function previewKind(f) {
  if (!f || typeof f !== 'object') return 'text'
  const name = String(f.name || '')
  const ct = String(f.contentType || '')
  if (ct === 'application/pdf') return 'pdf'
  if (f.isImage || IMG_RE.test(name) || ct.startsWith('image/')) return 'image'
  if (HTML_RE.test(name) || ct === 'text/html') return 'html'
  if (MD_RE.test(name)) return 'markdown'
  return 'text'
}

/** Hat die Art eine Preview/Source-Umschaltung? (Bilder/PDF rendert direkt) */
export function isToggleable(kind) {
  return kind === 'markdown' || kind === 'html'
}
