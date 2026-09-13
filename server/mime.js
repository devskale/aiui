// ════════════════════════════════════════════════════════════════════
// mime — the one image extension → mime table
//
// isImage is DERIVED from the table's values (Object.values → Set), so the
// "what counts as an image" list can never drift from the "ext → mime" map
// again. This is what candidate #3 existed to fix: the table used to be
// copied in four places, disagreeing on bmp. Server-only — the client gets
// image-ness from the server response, so there's no cross-boundary seam.
//
// Interface:
//   mimeFor(ext)          ext (with or without leading dot, any case) → mime | null
//   isImage(mime)         true iff mime is one the table produces
//   rawContentType(ext)   content type for serving file bytes inline:
//                         image mime, pdf, else null (→ caller serves
//                         application/octet-stream = download-only)
// ════════════════════════════════════════════════════════════════════

// bmp is intentionally absent: LLM vision accepts png/jpeg/gif/webp, not bmp,
// and three of the four former tables already excluded it. (See architecture
// review candidate #3, decision A.)
const EXT = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
}

// Non-image types that are SAFE + USEFUL to serve inline with a real content
// type: the browser's native PDF viewer renders them in a sandboxed plugin.
// Everything NOT listed here stays application/octet-stream (forced download,
// no sniffing/rendering surface — that's what keeps .html/.svg uploads inert).
// pdf must NOT go into EXT: isImage is derived from that table, and PDFs are
// not vision attachments.
const RAW_EXT = {
  pdf: 'application/pdf',
}

const IMAGE_MIMES = new Set(Object.values(EXT))

export function mimeFor(ext) {
  if (!ext) return null
  const key = String(ext).toLowerCase().replace(/^\./, '')
  return EXT[key] || null
}

export function isImage(mime) {
  return mime ? IMAGE_MIMES.has(mime) : false
}

export function rawContentType(ext) {
  if (!ext) return null
  const key = String(ext).toLowerCase().replace(/^\./, '')
  return EXT[key] || RAW_EXT[key] || null
}
