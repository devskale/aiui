// ════════════════════════════════════════════════════════════════════
// library — die Dokumenten-Bibliothek eines Users: eine Sicht auf
// uploads/ (kein neuer Speicherort — uploaded = in der Bibliothek),
// plus die #dokname-Kontext-Inlining-Maschinerie.
//
// #dokname am Prompt holt ein Dokument DIREKT in den Kontext (deterministisch,
// User-kontrolliert) statt den Agent einen Read-Roundtrip machen zu lassen:
//   md/txt/csv/log → Text inline (cap)
//   pdf            → OCR-Markdown-Cache des read_pdf-Werkzeugs (<name>.pdf.md),
//                    sonst best-effort pdfjs-Textlayer (cap); Scans ohne
//                    Textlayer verweisen auf read_pdf (LlamaParse-OCR)
//   image          → Vision-Content am Prompt (Text-only-Modell: die
//                    Vision-Bridge aus vision-bridge.js beschreibt es)
// Nicht auflösbare Tokens bleiben stehen — ein gewöhnlicher Hashtag im
// Prompt ist kein Fehler.
// ════════════════════════════════════════════════════════════════════
import fs from 'node:fs'
import path from 'node:path'

const LIBRARY_DIR = 'uploads'
const LIST_CAP = 200
const INLINE_MAX_TEXT = 24_000
const INLINE_MAX_PDF = 16_000

const TEXT_KIND_RE = /\.(md|markdown|mdown|txt|csv|log|json)$/i
const IMG_KIND_RE = /\.(png|jpe?g|gif|webp|bmp|avif|svg)$/i

/** kind einer Bibliotheks-Datei (für Chip + Inline-Entscheidung). */
export function libraryKind(name) {
  if (IMG_KIND_RE.test(name)) return 'image'
  if (/\.pdf$/i.test(name)) return 'pdf'
  if (TEXT_KIND_RE.test(name)) return 'text'
  return 'other'
}

/** Flache Bibliotheks-Liste (uploads/, mtime-desc, cap 200, ?q=-Filter). */
export function listLibrary(cwd, q) {
  const dir = path.join(cwd, LIBRARY_DIR)
  let entries
  try { entries = fs.readdirSync(dir, { withFileTypes: true }) } catch { return [] }
  const docs = []
  for (const e of entries) {
    if (!e.isFile() || e.name.startsWith('.')) continue
    const full = path.join(dir, e.name)
    let st
    try { st = fs.statSync(full) } catch { continue }
    docs.push({
      name: e.name,
      relPath: `${LIBRARY_DIR}/${e.name}`,
      kind: libraryKind(e.name),
      size: st.size,
      mtime: st.mtimeMs,
    })
  }
  docs.sort((a, b) => b.mtime - a.mtime)
  const query = String(q || '').trim().toLowerCase()
  const filtered = query ? docs.filter(d => d.name.toLowerCase().includes(query)) : docs
  return filtered.slice(0, LIST_CAP)
}

/** #dokname auflösen: exakter basename (ci), sonst basename ohne Extension.
 *  Mehrere Kandidaten → der neueste. entry (mit abs) oder null. */
export function resolveDocToken(cwd, name) {
  const wanted = String(name || '').trim().toLowerCase()
  if (!wanted) return null
  const docs = listLibrary(cwd, '')
  const exact = docs.filter(d => d.name.toLowerCase() === wanted)
  const stem = docs.filter(d => d.name.toLowerCase().replace(/\.[^.]+$/, '') === wanted)
  const pick = (exact.length ? exact : stem)[0]
  if (!pick) return null
  return { ...pick, abs: path.join(cwd, LIBRARY_DIR, pick.name) }
}

function cap(text, max, label) {
  if (text.length <= max) return text
  return `${text.slice(0, max)}\n[… ${label} truncated — full file in the workspace]`
}

/** Inline-Block für ein Dokument (Text: sofort; PDF: OCR-Cache > Textlayer;
 *  Bild: null — der Anrufer schiebt es in images[]). null bei Lesefehlern. */
export async function docContextBlock(cwd, entry) {
  try {
    if (entry.kind === 'text') {
      const text = fs.readFileSync(entry.abs, 'utf8')
      return `[Document: ${entry.name}]\n${cap(text, INLINE_MAX_TEXT, 'document')}`
    }
    if (entry.kind === 'pdf') {
      // 1. OCR-/Markdown-Cache des read_pdf-Werkzeugs, wenn frischer als das PDF
      const cache = `${entry.abs}.md`
      try {
        const pdfSt = fs.statSync(entry.abs)
        const cacheSt = fs.statSync(cache)
        if (cacheSt.mtimeMs >= pdfSt.mtimeMs) {
          const md = fs.readFileSync(cache, 'utf8')
          return `[Document: ${entry.name} (extracted markdown)]\n${cap(md, INLINE_MAX_TEXT, 'document')}`
        }
      } catch { /* kein Cache — Textlayer probieren */ }
      // 2. pdfjs-Textlayer (schnell, kein OCR); Scans ohne Layer → read_pdf-Hinweis
      const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs')
      const doc = await getDocument({ data: fs.readFileSync(entry.abs), useSystemFonts: false }).promise
      let text = ''
      for (let p = 1; p <= doc.numPages && text.length < INLINE_MAX_PDF; p++) {
        const page = await doc.getPage(p)
        const content = await page.getTextContent()
        text += `\n[Page ${p}]\n` + content.items.map(it => it.str || '').join(' ')
      }
      await doc.destroy()
      const trimmed = cap(text.trim(), INLINE_MAX_PDF, 'text layer')
      if (!trimmed.trim()) {
        return `[Document: ${entry.name}] — scanned PDF without a text layer. Inline extraction found no text; read the file with your read_pdf tool (it OCRs via LlamaParse).`
      }
      return `[Document: ${entry.name} (text layer)]\n${trimmed}`
    }
    return null // image/other — der Anrufer behandelt images, other bleibt Datei
  } catch {
    return null // Lesefehler → kein Block, Token-Entfernung wird vom Anrufer verhindert
  }
}

// ── #dokname-Token-Mathematik (pure) ──
export const DOC_TOKEN_RE = /#([^\s#]{1,120})/g

const TRAILING_PUNCT_RE = /[.,;:!?)\]]+$/
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Alle #tokens im Text. Trailing-Satzzeichen gehört zum Satz, nicht zum
 *  Dok-Namen (#bericht. → name 'bericht'); reiner Satzzeichen-Token → skip. */
export function extractDocTokens(text) {
  const out = []
  const re = new RegExp(DOC_TOKEN_RE.source, 'g')
  let m
  while ((m = re.exec(text || '')) !== null) {
    const name = m[1].replace(TRAILING_PUNCT_RE, '')
    if (name) out.push({ token: '#' + name, name, index: m.index })
  }
  return out
}

/** Aufgelöste Tokens aus dem Text nehmen (Wortgrenze + anhängende
 *  Satzzeichen wandern mit), Whitespace kollabieren. */
export function stripDocTokens(text, resolvedTokens) {
  let out = String(text || '')
  for (const t of resolvedTokens) {
    out = out.replace(new RegExp(`(^|\\s)${escapeRe(t.token)}[.,;:!?)\\]]*(?=\\s|$)`, 'g'), '$1')
  }
  return out.replace(/[ \t]{2,}/g, ' ').replace(/\n{3,}/g, '\n\n').trim()
}
