// generate-image — imagegen extension tool for πui (ADR-0004 baseline).
//
// Registers a `generate_image` tool backed by TU Aqueduct's z-image-turbo
// (same service as the .pi/skills/generate-image CLI, but in-process: no
// ~/.local/bin symlink, no PATH dependency). Runs server-side, outside the
// sandbox — key resolution happens here (TU_API_KEY env → ~/.pi/agent/auth.json
// tu-aqueduct), never inside the agent's tool sandbox.
//
// Images land in <cwd>/uploads/ (the user's workspace file surface) and the
// tool returns BOTH the web URL as text (renders in chat, survives replay)
// and the image itself as vision content (image-capable models can look at
// what they generated). The URL is workspace-scoped via /api/file/raw and
// prefixed with VITE_BASE when the service runs behind a sub-path (set in
// the systemd env on lubu; empty in dev where Vite proxies /api).
//
// Entitled as a baseline extension via default-user-settings.json:
//   "extensions": ["../../../extensions/generate-image/index.js"]
// (relative paths resolve from the user's agentDir — ADR-0001 file curation.)

import path from 'node:path'
import fs from 'node:fs'
import os from 'node:os'

const TU_BASE_URL = 'https://aqueduct.ai.datalab.tuwien.ac.at/v1'
const DEFAULT_MODEL = 'z-image-turbo'
const DEFAULT_SIZE = '1024x1024'
const SIZES = ['512x512', '768x768', '1024x1024', '1024x1792', '1792x1024']
const TIMEOUT_MS = 120000

function resolveKey() {
  if (process.env.TU_API_KEY) return process.env.TU_API_KEY
  try {
    const auth = JSON.parse(fs.readFileSync(path.join(os.homedir(), '.pi', 'agent', 'auth.json'), 'utf8'))
    if (auth?.['tu-aqueduct']?.key) return auth['tu-aqueduct'].key
  } catch {}
  return null
}

function guessMime(b64, url) {
  if (b64?.startsWith('/9j/')) return 'image/jpeg'
  if (/\.(jpe?g)(\?|$)/i.test(url || '')) return 'image/jpeg'
  return 'image/png'
}

export default function (pi) {
  pi.registerTool({
    name: 'generate_image',
    label: 'Generate Image',
    description:
      'Generate an image from a text prompt (z-image-turbo via TU Aqueduct). ' +
      'Returns a web URL that renders in chat — embed it in your reply as markdown. ' +
      'Use whenever the user asks to create, draw, generate, or make an image, picture, ' +
      'illustration, logo, or artwork, even without naming the tool.',
    promptSnippet: 'generate_image creates images from text prompts.',
    parameters: {
      type: 'object',
      properties: {
        prompt: { type: 'string', description: 'What to depict — be specific (subject, style, setting)' },
        size: { type: 'string', description: `One of ${SIZES.join(', ')} (default ${DEFAULT_SIZE})` },
        n: { type: 'number', description: 'Number of images, 1–4 (default 1)' },
      },
      required: ['prompt'],
    },
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      const prompt = (params.prompt || '').trim()
      if (!prompt) throw new Error('empty prompt')
      const size = SIZES.includes(params.size) ? params.size : DEFAULT_SIZE
      const n = Math.max(1, Math.min(4, parseInt(params.n, 10) || 1))

      const key = resolveKey()
      if (!key) throw new Error('No TU API key (set TU_API_KEY or add tu-aqueduct to ~/.pi/agent/auth.json)')

      const ctrl = new AbortController()
      const onAbort = () => ctrl.abort()
      signal?.addEventListener('abort', onAbort, { once: true })
      const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
      let data
      try {
        const r = await fetch(`${TU_BASE_URL}/images/generations`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
          body: JSON.stringify({ model: DEFAULT_MODEL, prompt, n, size }),
          signal: ctrl.signal,
        })
        if (!r.ok) {
          const t = await r.text().catch(() => '')
          throw new Error(`TU error ${r.status} ${r.statusText}${t ? ` — ${t.slice(0, 200)}` : ''}`)
        }
        data = await r.json()
      } catch (e) {
        throw new Error(e?.name === 'AbortError' ? 'image generation timed out or was aborted' : e.message)
      } finally {
        clearTimeout(timer)
        signal?.removeEventListener('abort', onAbort)
      }

      const items = Array.isArray(data?.data) ? data.data : []
      if (!items.length) throw new Error('no images returned')

      // Save into the user's workspace uploads/ — the app's file surface.
      const outDir = path.join(ctx?.cwd || process.cwd(), 'uploads')
      fs.mkdirSync(outDir, { recursive: true })
      // Base path without trailing slash (VITE_BASE='/aiui/' in prod, '' in
      // dev) — same normalization as src/lib/api.js, so no '//api' join.
      const base = (process.env.VITE_BASE || '').replace(/\/+$/, '')
      const ts = Date.now()
      const content = []
      const lines = []
      for (let i = 0; i < items.length; i++) {
        let b64 = items[i].b64_json
        const url = items[i].url
        if (!b64 && url) {
          const r = await fetch(url, { signal })
          if (!r.ok) throw new Error(`failed to fetch generated image: ${r.status}`)
          b64 = Buffer.from(await r.arrayBuffer()).toString('base64')
        }
        if (!b64) continue
        const mime = guessMime(b64, url)
        const ext = mime === 'image/jpeg' ? 'jpg' : mime === 'image/webp' ? 'webp' : 'png'
        const file = `generated-${ts}-${i}.${ext}`
        fs.writeFileSync(path.join(outDir, file), Buffer.from(b64, 'base64'))
        const webUrl = `${base}/api/file/raw?path=${encodeURIComponent(`uploads/${file}`)}`
        lines.push(`![generated image](${webUrl})`)
        content.push({ type: 'image', data: b64, mimeType: mime })
      }
      if (!lines.length) throw new Error('no usable images in response')
      content.unshift({ type: 'text', text: `${lines.length} image(s) generated — embed in your reply:\n${lines.join('\n')}` })
      return { content, details: { model: DEFAULT_MODEL, count: lines.length } }
    },
  })
}
