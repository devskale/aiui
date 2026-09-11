// stt.test.js — STT gateway client. Run: node server/stt.test.js
import assert from 'node:assert/strict'
import { sttConfigured, sttModel, transcribe } from './stt.js'

const realFetch = globalThis.fetch
const env = { ...process.env }
const restore = () => {
  globalThis.fetch = realFetch
  process.env = env
}

try {
  // ── Config ──
  delete process.env.AIUI_STT
  delete process.env.STT_URL
  assert.equal(sttConfigured(), true, 'configured by default')
  assert.equal(sttModel(), 'nemotron-3.5-asr-streaming-0.6b', 'default model')
  process.env.AIUI_STT = 'off'
  assert.equal(sttConfigured(), false, 'AIUI_STT=off disables')
  process.env.AIUI_STT = ''
  process.env.STT_URL = ''
  assert.equal(sttConfigured(), false, 'empty STT_URL disables')
  process.env.STT_MODEL = 'other-model'
  assert.equal(sttModel(), 'other-model', 'model override')

  // ── transcribe: validation ──
  assert.equal((await transcribe(null)).error, 'STT is disabled on this server')
  process.env.STT_URL = 'http://stt-test.local'
  assert.equal((await transcribe(null)).error, 'empty audio')

  // ── transcribe: gateway success ──
  let captured = null
  globalThis.fetch = async (url, init) => {
    captured = { url, init }
    return { ok: true, json: async () => ({ text: 'Hallo Welt', language: 'de', duration_sec: 2.1, decode_sec: 0.2 }) }
  }
  const ok = await transcribe(Buffer.from('RIFF'), 'de')
  assert.equal(ok.text, 'Hallo Welt')
  assert.equal(ok.language, 'de')
  assert.ok(captured.url.startsWith('http://stt-test.local/v1/audio/transcriptions'))
  assert.equal(captured.init.headers.Authorization, undefined, 'no auth header without STT_TOKEN')
  const form = captured.init.body
  assert.ok(form && typeof form.append === 'function', 'multipart FormData body')

  // ── transcribe: bearer token when configured ──
  process.env.STT_TOKEN = 'sekret'
  await transcribe(Buffer.from('RIFF'), 'auto')
  assert.equal(captured.init.headers.Authorization, 'Bearer sekret')

  // ── transcribe: gateway error → { error }, never throws ──
  globalThis.fetch = async () => ({ ok: false, status: 401, text: async () => 'unauthorized' })
  const err = await transcribe(Buffer.from('RIFF'), 'auto')
  assert.match(err.error, /gateway 401/)

  globalThis.fetch = async () => { throw new Error('boom') }
  const net = await transcribe(Buffer.from('RIFF'), 'auto')
  assert.match(net.error, /boom/)

  console.log('stt.test.js ✓')
} finally {
  restore()
}
