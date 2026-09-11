// ════════════════════════════════════════════════════════════════════
// useTts — read assistant answers aloud via the browser SpeechSynthesis
// API (agent-gated: only shown when the active Agent sets tts: true).
// Zero backend — voices come with the OS/browser; on Apple devices the
// built-in English voices are good.
// ════════════════════════════════════════════════════════════════════
import { useState, useEffect, useRef, useCallback } from 'react'

// Markdown → speakable plain text: drop code blocks, images, link URLs,
// emphasis markers, heading/bullet syntax and emoji. Hyphens inside words
// survive (only line-start list markers go).
export function speakableText(md) {
  if (!md) return ''
  return md
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^#{1,6}\s*/gm, '')
    .replace(/^\s*[-*+]\s+/gm, ' ')
    .replace(/^\s*>\s?/gm, '')
    .replace(/(\*\*|__|\*|~~)/g, '')
    .replace(/\p{Extended_Pictographic}/gu, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

// Preferred English voices, best first (present on Apple/Chrome platforms).
const VOICE_PREFS = ['Samantha', 'Google US English', 'Karen', 'Ava', 'Daniel', 'Zira']

export function useTts() {
  const [speaking, setSpeaking] = useState(false)
  const voiceRef = useRef(null)

  // Voices load async on some browsers — pick once they're there.
  useEffect(() => {
    if (typeof window === 'undefined' || !window.speechSynthesis) return
    const pick = () => {
      const voices = window.speechSynthesis.getVoices().filter(v => v.lang?.startsWith('en'))
      if (!voices.length) return
      voiceRef.current =
        VOICE_PREFS.map(name => voices.find(v => v.name.includes(name))).find(Boolean) ||
        voices.find(v => v.lang === 'en-US') || voices[0]
    }
    pick()
    window.speechSynthesis.addEventListener('voiceschanged', pick)
    return () => window.speechSynthesis.removeEventListener('voiceschanged', pick)
  }, [])

  const cancel = useCallback(() => {
    try { window.speechSynthesis?.cancel() } catch {}
    setSpeaking(false)
  }, [])

  const speak = useCallback((md) => {
    const text = speakableText(md)
    if (!text || !window.speechSynthesis) return
    try { window.speechSynthesis.cancel() } catch {}
    const u = new SpeechSynthesisUtterance(text.slice(0, 3000))
    if (voiceRef.current) u.voice = voiceRef.current
    u.lang = voiceRef.current?.lang || 'en-US'
    u.rate = 0.95 // slightly slower for a learner
    u.onstart = () => setSpeaking(true)
    u.onend = () => setSpeaking(false)
    u.onerror = () => setSpeaking(false)
    window.speechSynthesis.speak(u)
  }, [])

  useEffect(() => () => { try { window.speechSynthesis?.cancel() } catch {} }, [])

  return { speaking, speak, cancel }
}
