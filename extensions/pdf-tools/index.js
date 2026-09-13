// pdf-tools — read_pdf baseline extension (ADR-0004), available to every agent
//
// Registers a `read_pdf` tool that extracts per-page text from PDFs using
// pdfjs-dist (pure JS, resolves from the repo root's node_modules). Paths are
// confined to the session cwd (the user's workspace) — same boundary the
// sandboxed built-in read tool enforces; extensions run in-process, so the
// guard lives here.
//
// Plain JS on purpose: the schema below is a hand-written TypeBox object
// (Type.Object() just builds this shape), so the only import needed is
// pdfjs-dist itself.

import path from 'node:path'
import fs from 'node:fs'
import os from 'node:os'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'

const execFileAsync = promisify(execFile)

const MAX_PAGES = 200
const MAX_OUTPUT_CHARS = 50 * 1024

// ── LlamaParse (cloud OCR) — for scanned PDFs without a text layer ──
// Key via credgoo (the skale credential store), same as pdf2md.skale:
// env LLAMA_CLOUD_API_KEY → `credgoo llamacloud` CLI → a credgoo-capable
// python (default: the pdf2md venv; override with AIUI_CREDGOO_PY).
const LLAMA_API = 'https://api.cloud.llamaindex.ai/api/parsing'
let llamaKeyCache = null

async function resolveLlamaKey() {
  if (process.env.LLAMA_CLOUD_API_KEY) return process.env.LLAMA_CLOUD_API_KEY
  if (llamaKeyCache) return llamaKeyCache
  const candidates = [
    ['credgoo', ['llamacloud']],
    [path.join(os.homedir(), '.local', 'bin', 'credgoo'), ['llamacloud']],
  ]
  const py = process.env.AIUI_CREDGOO_PY ||
    path.join(os.homedir(), 'code/kontext.one/python-utils/packages/pdf2md.skale/.venv/bin/python')
  candidates.push([py, ['-c', "from credgoo import get_api_key; print(get_api_key('llamacloud') or '')"]])
  for (const [cmd, args] of candidates) {
    try {
      const { stdout } = await execFileAsync(cmd, args, { timeout: 20000 })
      const key = (stdout || '').trim()
      if (key) { llamaKeyCache = key; return key }
    } catch { /* try next */ }
  }
  return null
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms))

// ── pdf2md-style markdown cache ──
// The OCR result is written NEXT TO the PDF as "<name>.pdf.md" and served from
// there while it's at least as fresh as the PDF. Repeat reads cost zero time
// and zero LlamaParse credits, and the full markdown stays browsable in the
// file explorer (the chat result alone is capped at MAX_OUTPUT_CHARS).
export const cachePathFor = (resolvedPdf) => resolvedPdf + '.md'

export function cacheIsFresh(pdfPath, mdPath = cachePathFor(pdfPath)) {
  try {
    return fs.statSync(mdPath).mtimeMs >= fs.statSync(pdfPath).mtimeMs
  } catch { return false }
}

function writeOcrCache(resolved, md) {
  const mdPath = cachePathFor(resolved)
  try { fs.writeFileSync(mdPath, md); return mdPath } catch { return null }
}

// Upload → poll → markdown. Premium mode + language follow the pdf2md.skale
// extractor defaults (premium, result markdown).
async function llamaparseToMarkdown(absPath, language, signal) {
  const key = await resolveLlamaKey()
  if (!key) throw new Error('No LlamaParse key: set LLAMA_CLOUD_API_KEY or resolve credgoo "llamacloud".')
  const headers = { Authorization: `Bearer ${key}` }

  const form = new FormData()
  form.append('file', new Blob([fs.readFileSync(absPath)], { type: 'application/pdf' }), path.basename(absPath))
  form.append('params', JSON.stringify({ premium_mode: true, language: language || 'en' }))
  const up = await fetch(`${LLAMA_API}/upload`, { method: 'POST', headers, body: form, signal })
  if (!up.ok) throw new Error(`LlamaParse upload ${up.status}: ${(await up.text().catch(() => '')).slice(0, 200)}`)
  const { id } = await up.json()
  if (!id) throw new Error('LlamaParse: no job id returned')

  const deadline = Date.now() + 5 * 60 * 1000
  while (Date.now() < deadline) {
    await sleep(2500)
    if (signal?.aborted) throw new Error('abgebrochen')
    const st = await fetch(`${LLAMA_API}/job/${id}`, { headers, signal })
    const j = await st.json().catch(() => ({}))
    if (j.status === 'SUCCESS') {
      const md = await fetch(`${LLAMA_API}/job/${id}/result/text`, { headers, signal })
      if (!md.ok) throw new Error(`LlamaParse result ${md.status}`)
      const { text } = await md.json()
      return text || ''
    }
    if (['ERROR', 'NOT_FOUND'].includes(j.status)) {
      throw new Error(`LlamaParse ${j.status}: ${j.error || ''}`)
    }
  }
  throw new Error('LlamaParse: timed out (5 min)')
}

// Standard-font data (Helvetica etc.) is not inlined in pdf.js v6 — point at
// the shipped dir so text extraction from PDFs using non-embedded fonts works.
const STANDARD_FONTS_DIR = (() => {
  try {
    return fileURLToPath(new URL('../../standard_fonts/', import.meta.resolve('pdfjs-dist/legacy/build/pdf.mjs')))
  } catch {
    return undefined
  }
})()

// "1-3,5" → [1,2,3,5] (1-based, clamped to the document). Null = all pages.
function parsePages(spec, pagecount) {
  if (!spec || !spec.trim()) return null
  const out = new Set()
  for (const part of spec.split(',')) {
    const m = part.trim().match(/^(\d+)(?:-(\d+))?$/)
    if (!m) throw new Error(`Invalid pages spec: "${part.trim()}" (format: 1-3,5)`)
    const from = Math.max(1, parseInt(m[1], 10))
    const to = Math.min(pagecount, m[2] ? parseInt(m[2], 10) : from)
    for (let p = from; p <= to; p++) out.add(p)
  }
  return [...out].sort((a, b) => a - b).slice(0, MAX_PAGES)
}

async function extractPageText(page) {
  const tc = await page.getTextContent()
  let text = ''
  for (const item of tc.items) {
    if (typeof item.str !== 'string') continue
    text += item.str
    if (item.hasEOL) text += '\n'
  }
  return text.replace(/[ \t]{2,}/g, ' ').trim()
}

export default function (pi) {
  pi.registerTool({
    name: 'read_pdf',
    label: 'Read PDF',
    description:
      'Extracts a PDF\'s text page by page ("Page N:" blocks). Use it for uploaded or ' +
      'workspace PDFs — not the read tool (which returns binary garbage for PDFs). ' +
      'Scans without a text layer go to LlamaParse (cloud OCR) automatically; ' +
      'ocr=true forces LlamaParse for text PDFs too (better layout). ' +
      'OCR results are cached as a sibling "<name>.pdf.md" — repeat reads are served ' +
      'from that cache instantly (zero credits). ' +
      'params: path, optional pages ("1-3,5"), ocr (bool), language (default "en").',
    promptSnippet: 'Read PDF files with read_pdf (not read); scans are OCR\'d via LlamaParse automatically and cached as <name>.pdf.md.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Path to the PDF, workspace-relative or absolute' },
        pages: { type: 'string', description: 'Page selection, e.g. "1-3,7" (optional, default: all)' },
        ocr: { type: 'boolean', description: 'Force LlamaParse (cloud OCR, also for text PDFs — slower)' },
        language: { type: 'string', description: 'Document language hint for OCR (default "en")' },
      },
      required: ['path'],
    },
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      const cwd = ctx?.cwd || process.cwd()
      const resolved = path.resolve(cwd, params.path)

      // Confinement: the resolved target must stay inside the session cwd
      // (match the sandbox boundary of the built-in tools).
      const base = path.resolve(cwd)
      if (resolved !== base && !resolved.startsWith(base + path.sep)) {
        throw new Error(`Path is outside the workspace: ${params.path}`)
      }
      if (!fs.existsSync(resolved)) throw new Error(`File not found: ${params.path}`)

      // pdf2md-style cache-first: a fresh "<name>.pdf.md" sibling serves the
      // read without pdf.js or LlamaParse.
      const mdPath = cachePathFor(resolved)
      if (cacheIsFresh(resolved, mdPath)) {
        const md = fs.readFileSync(mdPath, 'utf8')
        const tail = md.length > MAX_OUTPUT_CHARS
          ? `\n[...truncated — vollständiges Markdown: ${path.relative(cwd, mdPath)}]`
          : ''
        return {
          content: [{ type: 'text', text: `[read_pdf — aus Markdown-Cache: ${path.relative(cwd, mdPath)}]\n\n${md.slice(0, MAX_OUTPUT_CHARS)}${tail}` }],
          details: { parser: 'cache', mdPath },
        }
      }

      // Forced cloud-OCR path (LlamaParse): skip local extraction entirely.
      if (params.ocr === true) {
        _onUpdate?.({ content: [{ type: 'text', text: 'LlamaParse OCR is running — this can take 1–2 minutes…' }] })
        try {
          const md = await llamaparseToMarkdown(resolved, params.language, signal)
          const saved = writeOcrCache(resolved, md)
          const note = saved ? `\n\n[Volltext gespeichert als ${path.relative(cwd, saved)} — erneute Lesezugriffe nutzen diesen Cache]` : ''
          return { content: [{ type: 'text', text: `[LlamaParse OCR — markdown]${note}\n\n${md.slice(0, MAX_OUTPUT_CHARS)}${md.length > MAX_OUTPUT_CHARS ? '\n[...truncated...]' : ''}` }], details: { parser: 'llamaparse', mdPath: saved ?? undefined } }
        } catch (e) {
          throw new Error(`LlamaParse failed: ${e.message}`)
        }
      }

      const data = new Uint8Array(fs.readFileSync(resolved))
      const task = getDocument({ data, isEvalSupported: false, standardFontDataUrl: STANDARD_FONTS_DIR })
      const doc = await task.promise
      try {
        const pagecount = doc.numPages
        const wanted = parsePages(params.pages, pagecount) ||
          Array.from({ length: Math.min(pagecount, MAX_PAGES) }, (_, i) => i + 1)

        const parts = [`PDF: ${params.path} — ${pagecount} pages${wanted.length < pagecount ? ` (read: ${wanted.length})` : ''}\n`]
        let total = 0
        for (const n of wanted) {
          const text = await extractPageText(await doc.getPage(n))
          total += text.length
          parts.push(`\nSeite ${n}:\n${text || '(no text on this page)'}`)
          if (parts.join('\n').length > MAX_OUTPUT_CHARS) {
            parts.push(`\n[— output truncated at page ${n}/${pagecount}; use pages for the rest —]`)
            break
          }
        }

        // Scans have pixels but no text layer — hand them to LlamaParse
        // (cloud OCR) instead of returning noise. Key via credgoo; when it
        // can't be resolved, say so and fall back to the photo hint.
        if (total < 30) {
          const key = await resolveLlamaKey()
          if (key) {
            _onUpdate?.({ content: [{ type: 'text', text: 'No text layer — running LlamaParse OCR (1–2 minutes)…' }] })
            try {
              const md = await llamaparseToMarkdown(resolved, params.language, signal)
              const saved = writeOcrCache(resolved, md)
              const note = saved ? `\n\n[Volltext gespeichert als ${path.relative(cwd, saved)} — erneute Lesezugriffe nutzen diesen Cache]` : ''
              return { content: [{ type: 'text', text: `[Scan detected — extracted via LlamaParse OCR]${note}\n\n${md.slice(0, MAX_OUTPUT_CHARS)}${md.length > MAX_OUTPUT_CHARS ? '\n[...truncated...]' : ''}` }], details: { parser: 'llamaparse', mdPath: saved ?? undefined } }
            } catch (e) {
              parts.push(`\n[LlamaParse OCR failed: ${e.message}]`)
            }
          } else {
            parts.push(
              '\n[Hinweis: fast kein extrahierbarer Text — vermutlich ein Scan ohne Textebene. ' +
              'LlamaParse OCR is unavailable (no key via credgoo "llamacloud"). ' +
              'Bitte den Nutzer, Seiten als Fotos/Screenshots hochzuladen.]'
            )
          }
        }
        return { content: [{ type: 'text', text: parts.join('\n') }], details: { pages: pagecount } }
      } finally {
        await task.destroy().catch(() => {})
      }
    },
  })
}
