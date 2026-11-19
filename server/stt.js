// ════════════════════════════════════════════════════════════════════
// stt — speech-to-text gateway client (OpenAI-compatible transcriptions)
//
// Proxies browser audio to the uniinfer proxy gateway
// (POST /v1/audio/transcriptions, multipart WAV → {text}). The Bearer
// token stays server-side (never in the browser), same pattern as
// skills-catalog.js: env-configurable base URL, timeout, non-throwing
// { error } returns so the UI degrades gracefully.
//
// Das Mic zeigt defaultmäßig auf den uniinfer-Proxy: Modell
// hab@nemotron-3.5-asr-streaming-0.6b (Wunsch-Pin 2026-11-19; alternativ
// tu@whisper-large — beides über denselben Proxy). uniinfer ist
// REST-only: kein WS-Streaming-Tier, /api/stt/config advertisiert
// streaming:false (Client geht direkt in Batch).
//
// Env:
//   STT_URL    gateway base (default https://uniinfer.skale.dev; '' or AIUI_STT=off disables)
//   STT_TOKEN  gateway Bearer token (uniinfer-Key — nötig, uniinfer ist authed)
//   STT_MODEL  transcription model id (default hab@nemotron-3.5-asr-streaming-0.6b)
//   STT_WS     '1' = WS-Streaming-Tier freischalten (nur Gateways mit
//              /v1/audio/transcriptions/stream-WS — uniinfer: nein)
// ════════════════════════════════════════════════════════════════════

const DEFAULT_URL = 'https://uniinfer.skale.dev'
const DEFAULT_MODEL = 'hab@nemotron-3.5-asr-streaming-0.6b'

function gatewayUrl() {
  return (process.env.STT_URL ?? DEFAULT_URL).replace(/\/+$/, '')
}

/** Is STT configured at all? (Reachability is probed separately.) */
export function sttConfigured() {
  if (process.env.AIUI_STT === 'off') return false
  return gatewayUrl() !== ''
}

export function sttModel() {
  return process.env.STT_MODEL || DEFAULT_MODEL
}

/** WS-Streaming-Tier freigeschaltet? (nur Gateways mit transcriptions/stream-
 *  WS; uniinfer ist REST-only → false → Client geht direkt in Batch.) */
export function sttStreaming() {
  return process.env.STT_WS === '1'
}

// ── Reachability probe (cached) ──
// GET /v1/models with a short timeout, cached 10 minutes. Cheap enough to
// call per /api/agents request; lets the UI hide the mic when the gateway
// host is unreachable (e.g. prod server without a route to the DGX) and
// re-appear on its own once networking is fixed — no config change needed.
const PROBE_TTL_MS = 10 * 60 * 1000
const PROBE_TIMEOUT_MS = 2500
let probe = { at: 0, ok: false, inflight: null }

export function sttReachable() {
  if (!sttConfigured()) return Promise.resolve(false)
  if (Date.now() - probe.at < PROBE_TTL_MS) return Promise.resolve(probe.ok)
  if (probe.inflight) return probe.inflight
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), PROBE_TIMEOUT_MS)
  probe.inflight = fetch(`${gatewayUrl()}/v1/models`, { signal: ctrl.signal })
    .then(r => { probe = { at: Date.now(), ok: r.ok, inflight: null }; return r.ok })
    .catch(() => { probe = { at: Date.now(), ok: false, inflight: null }; return false })
    .finally(() => clearTimeout(timer))
  return probe.inflight
}

// ── Transcription ──

/**
 * Transcribe a WAV buffer. Returns the gateway response
 * ({ text, language, duration_sec, decode_sec }) or { error } — never throws.
 */
export async function transcribe(wavBuffer, language = 'auto') {
  if (!sttConfigured()) return { error: 'STT is disabled on this server' }
  if (!Buffer.isBuffer(wavBuffer) || wavBuffer.length === 0) return { error: 'empty audio' }
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 30000)
  try {
    const form = new FormData()
    form.append('file', new Blob([wavBuffer], { type: 'audio/wav' }), 'audio.wav')
    form.append('model', sttModel())
    form.append('language', language || 'auto')
    const headers = {}
    if (process.env.STT_TOKEN) headers.Authorization = `Bearer ${process.env.STT_TOKEN}`
    const r = await fetch(`${gatewayUrl()}/v1/audio/transcriptions`, {
      method: 'POST', headers, body: form, signal: ctrl.signal,
    })
    if (!r.ok) {
      const detail = await r.text().catch(() => '')
      return { error: `gateway ${r.status}: ${detail.slice(0, 200)}` }
    }
    const data = await r.json()
    if (!data || typeof data.text !== 'string') return { error: 'gateway returned no text' }
    return {
      text: data.text,
      language: data.language || language,
      duration_sec: data.duration_sec,
      decode_sec: data.decode_sec,
    }
  } catch (e) {
    const why = e?.name === 'AbortError' ? 'timed out' : (e?.message || 'network error')
    return { error: `transcription failed: ${why}` }
  } finally {
    clearTimeout(timer)
  }
}
