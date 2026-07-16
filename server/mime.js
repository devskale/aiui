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
//   mimeFor(ext)   ext (with or without leading dot, any case) → mime | null
//   isImage(mime)  true iff mime is one the table produces
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

const IMAGE_MIMES = new Set(Object.values(EXT))

export function mimeFor(ext) {
  if (!ext) return null
  const key = String(ext).toLowerCase().replace(/^\./, '')
  return EXT[key] || null
}

export function isImage(mime) {
  return mime ? IMAGE_MIMES.has(mime) : false
}
