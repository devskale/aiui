// ════════════════════════════════════════════════════════════════════
// useStt — microphone → text, three tiers (best first):
//
//   1. "webspeech"  OS/browser recognizer (Web Speech API) — live
//                  partials, works on Win/Mac/Android Chrome, Edge and
//                  Safari, needs NO server route at all.
//   2. "ws"         the STT gateway's streaming WS, straight from the
//                  browser (binary PCM → {"type":"partial"|"final"}) —
//                  Nemotron, EN/DE; needs a CLIENT route to the gateway
//                  (config + token from /api/stt/config).
//   3. "batch"      record → WAV → POST /api/stt (server-proxied) — needs
//                  a SERVER route to the gateway.
//
// UX: hold the mic to talk (release inserts), or click to toggle. While
// recording, `partial` carries the live transcript for the input bar.
// ════════════════════════════════════════════════════════════════════
import { useState, useRef, useCallback, useEffect } from 'react'
import { apiUrl } from '../lib/api'

// ── audio plumbing shared by tiers 2 + 3 ──
function toPcm16k(chunks, nativeRate) {
  const total = chunks.reduce((s, c) => s + c.length, 0)
  const flat = new Float32Array(total)
  let o = 0
  for (const c of chunks) { flat.set(c, o); o += c.length }
  const ratio = 16000 / nativeRate
  const n = nativeRate === 16000 ? flat.length : Math.floor(flat.length * ratio)
  const out = new Int16Array(n)
  for (let i = 0; i < n; i++) {
    const v = Math.max(-1, Math.min(1, flat[nativeRate === 16000 ? i : Math.min(flat.length - 1, Math.floor(i / ratio))]))
    out[i] = v < 0 ? v * 32768 : v * 32767
  }
  return out
}

function wavBytes(pcm) {
  const buf = new ArrayBuffer(44 + pcm.length * 2)
  const v = new DataView(buf)
  const write = (off, s) => { for (let i = 0; i < s.length; i++) v.setUint8(off + i, s.charCodeAt(i)) }
  write(0, 'RIFF'); v.setUint32(4, 36 + pcm.length * 2, true); write(8, 'WAVE')
  write(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true)
  v.setUint32(24, 16000, true); v.setUint32(28, 32000, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true)
  write(36, 'data'); v.setUint32(40, pcm.length * 2, true)
  new Int16Array(buf, 44).set(pcm)
  return buf
}

// 'idle' | 'recording' | 'processing'; mode: 'webspeech' | 'ws' | 'batch' | null
export function useStt({ language = 'auto', onTranscript, onError }) {
  const [state, setState] = useState('idle')
  const [partial, setPartial] = useState('')
  const [mode, setMode] = useState(
    (typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition))
      ? 'webspeech' : null
  )
  const ctxRef = useRef(null)
  const streamRef = useRef(null)
  const procRef = useRef(null)
  const chunksRef = useRef([])
  const recordingRef = useRef(false)
  const wsRef = useRef(null)
  const recogRef = useRef(null)
  const finalRef = useRef('')
  const lastPartialRef = useRef('')
  const configRef = useRef(undefined) // undefined = not fetched

  const teardown = useCallback(() => {
    try { procRef.current?.disconnect() } catch {}
    try { ctxRef.current?.close() } catch {}
    streamRef.current?.getTracks().forEach(t => t.stop())
    procRef.current = null
    ctxRef.current = null
    streamRef.current = null
  }, [])

  useEffect(() => () => {
    teardown()
    try { recogRef.current?.stop() } catch {}
    try { wsRef.current?.close() } catch {}
  }, [teardown])

  // ── tier resolution: webspeech (sync) → ws (config fetch) → batch ──
  useEffect(() => {
    if (mode === 'webspeech') return
    if (configRef.current !== undefined) return
    configRef.current = null // in-flight guard
    fetch(apiUrl('/api/stt/config'))
      .then(r => (r.ok ? r.json() : null))
      .then(cfg => {
        configRef.current = cfg
        if (cfg?.enabled && cfg.token) setMode('ws')
        else if (cfg?.enabled) setMode('batch')
      })
      .catch(() => {})
  }, [mode])

  const deliver = useCallback((text) => {
    setPartial('')
    if (text) onTranscript?.(text)
  }, [onTranscript])

  // ── tier 1: Web Speech API ──
  const startWebspeech = useCallback(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    const rec = new SR()
    rec.continuous = false
    rec.interimResults = true
    rec.lang = language !== 'auto' ? language : (navigator.language || 'en-US')
    finalRef.current = ''
    rec.onresult = (e) => {
      let interim = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i]
        if (r.isFinal) finalRef.current += r[0].transcript
        else interim += r[0].transcript
      }
      setPartial((finalRef.current + interim).trim())
    }
    rec.onerror = (e) => {
      setState('idle'); setPartial('')
      onError?.(e.error === 'not-allowed' ? 'Microphone permission denied.' : `Speech recognition error: ${e.error}`)
    }
    rec.onend = () => {
      recogRef.current = null
      setState('idle')
      deliver(finalRef.current.trim())
    }
    recogRef.current = rec
    try { rec.start(); setState('recording') } catch (e) { onError?.(e.message) }
  }, [language, onError, deliver])

  const stopWebspeech = useCallback(() => {
    try { recogRef.current?.stop() } catch {} // onend fires → deliver
  }, [])

  // ── shared mic capture for tiers 2 + 3 ──
  const startCapture = useCallback(async (onChunk) => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1 } })
    const ctx = new (window.AudioContext || window.webkitAudioContext)()
    const src = ctx.createMediaStreamSource(stream)
    const proc = ctx.createScriptProcessor(4096, 1, 1)
    proc.onaudioprocess = (e) => {
      if (!recordingRef.current) return
      const f = new Float32Array(e.inputBuffer.getChannelData(0))
      chunksRef.current.push(f)
      onChunk?.(f, ctx.sampleRate)
    }
    src.connect(proc)
    proc.connect(ctx.destination)
    streamRef.current = stream
    ctxRef.current = ctx
    procRef.current = proc
    chunksRef.current = []
    recordingRef.current = true
  }, [])

  // ── tier 2: gateway WS streaming, straight from the browser ──
  const startWs = useCallback(async () => {
    const cfg = configRef.current
    const wsUrl = cfg.gateway.replace(/^http/, 'ws') + '/v1/audio/transcriptions/stream?token=' + encodeURIComponent(cfg.token)
    const ws = new WebSocket(wsUrl)
    ws.binaryType = 'arraybuffer'
    await new Promise((res, rej) => {
      ws.onopen = res
      ws.onerror = () => rej(new Error('stream connect failed'))
    })
    wsRef.current = ws
    ws.onmessage = (ev) => {      if (typeof ev.data !== 'string') return
      try {
        const d = JSON.parse(ev.data)
        if (d.type === 'partial' || d.partial === true) {
          if (d.text?.trim()) lastPartialRef.current = d.text
          setPartial(d.text || '')
        } else if (d.type === 'final' || d.partial === false) {
          finalRef.current = d.text || finalRef.current
          setPartial(finalRef.current)
        }
      } catch {}
    }
    await startCapture((f, rate) => {
      const pcm = toPcm16k([f], rate)
      if (ws.readyState === 1) ws.send(pcm.buffer)
    })
    setState('recording')
  }, [startCapture])

  // End-of-audio handshake: the gateway is supposed to answer the empty
  // frame with a final, but in practice it often just closes (1006) — so the
  // chain is: final → last live partial → batch on the recorded audio (same
  // posture as the sttts/Handy Rust client, FINAL_TIMEOUT + batch fallback).
  const stopWs = useCallback(() => {
    recordingRef.current = false
    const chunks = chunksRef.current
    const nativeRate = ctxRef.current?.sampleRate || 48000
    teardown()
    const ws = wsRef.current

    const finalize = async () => {
      wsRef.current = null
      try { ws?.close() } catch {}
      const text = (finalRef.current || lastPartialRef.current).trim()
      if (text) { setState('idle'); return deliver(text) }
      if (!chunks.length) { setState('idle'); return }
      setState('processing')
      try {
        const wav = wavBytes(toPcm16k(chunks, nativeRate))
        const form = new FormData()
        form.append('audio', new Blob([wav], { type: 'audio/wav' }), 'audio.wav')
        form.append('language', language || 'auto')
        const r = await fetch(apiUrl('/api/stt'), { method: 'POST', body: form })
        const j = await r.json().catch(() => ({}))
        if (!r.ok || j.error) throw new Error(j.error || `HTTP ${r.status}`)
        deliver(j.text || '')
      } catch (e) {
        onError?.(e.message || 'transcription failed')
      } finally {
        setState('idle')
      }
    }

    if (ws?.readyState === 1) {
      try { ws.send(new ArrayBuffer(0)) } catch {}
      ws.onclose = () => finalize()
      setTimeout(finalize, 2500) // whichever comes first: final/close or timeout
    } else {
      finalize()
    }
  }, [language, onError, deliver, teardown])

  // ── tier 3: batch via the server proxy ──
  const startBatch = useCallback(async () => {
    await startCapture()
    setState('recording')
  }, [startCapture])

  const stopBatch = useCallback(async () => {
    recordingRef.current = false
    const nativeRate = ctxRef.current?.sampleRate || 48000
    const chunks = chunksRef.current
    teardown()
    if (!chunks.length) { setState('idle'); return }
    setState('processing')
    try {
      const wav = wavBytes(toPcm16k(chunks, nativeRate))
      const form = new FormData()
      form.append('audio', new Blob([wav], { type: 'audio/wav' }), 'audio.wav')
      form.append('language', language || 'auto')
      const r = await fetch(apiUrl('/api/stt'), { method: 'POST', body: form })
      const j = await r.json().catch(() => ({}))
      if (!r.ok || j.error) throw new Error(j.error || `HTTP ${r.status}`)
      deliver(j.text || '')
    } catch (e) {
      onError?.(e.message || 'transcription failed')
    } finally {
      setState('idle')
    }
  }, [language, onError, deliver, teardown])

  // ── public API ──
  const start = useCallback(async () => {
    if (state !== 'idle') return
    setPartial('')
    finalRef.current = ''
    lastPartialRef.current = ''
    try {
      if (mode === 'webspeech') return startWebspeech()
      if (mode === 'ws') return await startWs()
      if (mode === 'batch') return await startBatch()
      onError?.('No speech input available in this browser.')
    } catch (e) {
      teardown()
      setState('idle')
      // WS connect failed → try batch as fallback, else surface the error
      if (mode === 'ws' && configRef.current?.enabled) { setMode('batch'); return }
      onError?.(e?.name === 'NotAllowedError' ? 'Microphone permission denied.' : `Microphone error: ${e.message}`)
    }
  }, [state, mode, startWebspeech, startWs, startBatch, teardown, onError])

  const stop = useCallback(() => {
    if (state !== 'recording') return
    if (mode === 'webspeech') return stopWebspeech()
    if (mode === 'ws') return stopWs()
    return stopBatch()
  }, [state, mode, stopWebspeech, stopWs, stopBatch])

  const toggle = useCallback(() => {
    if (state === 'recording') stop()
    else if (state === 'idle') start()
  }, [state, start, stop])

  return { mode, state, partial, toggle, start, stop }
}
