// attachment-chip — Anzeige-Daten für einen Attachment-Chip (pure).
//
// Typ-Icon-Klasse, menschliche Größe, PDF-Seiten: der Chip im InputBar
// zeigt mehr als den Dateinamen, damit man vor dem Senden weiß, WAS da
// mitreist (PDF 12 Seiten? 18 MB Scan?). Rein + testbar, kein React.

const KINDS = {
  image: { icon: 'image' },
  pdf: { icon: 'file-text' },
  markdown: { icon: 'file-text' },
  text: { icon: 'file-text' },
  other: { icon: 'file' },
}

const MD_RE = /\.(md|markdown|mdown|txt|csv|log)$/i
const IMG_MIME_RE = /^image\//

/** Rein: { isImage?, mimetype?, name?, size?, pages? } → Chip-Daten. Wirft nie. */
export function chipData(f) {
  if (!f || typeof f !== 'object') return { kind: 'other', icon: 'file', size: '' }
  const name = String(f.name || '')
  const mimetype = String(f.mimetype || '')
  let kind = 'other'
  if (f.isImage || IMG_MIME_RE.test(mimetype)) kind = 'image'
  else if (mimetype === 'application/pdf' || /\.pdf$/i.test(name)) kind = 'pdf'
  else if (MD_RE.test(name) || mimetype.startsWith('text/')) kind = 'text'
  return {
    kind,
    icon: KINDS[kind].icon,
    pages: kind === 'pdf' && Number.isFinite(f.pages) && f.pages > 0 ? f.pages : null,
    size: humanSize(f.size),
  }
}

/** Bytes → kompakte menschliche Angabe. Wirft nie. */
export function humanSize(bytes) {
  const n = Number(bytes)
  if (!Number.isFinite(n) || n <= 0) return ''
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}
