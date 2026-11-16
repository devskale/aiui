// ════════════════════════════════════════════════════════════════════
// smooth-stream — SOTA-Puffer für Streaming-Chats (Upstash smooth-
// streaming / ChatGPT-Typewriter-Muster): Netzwerk-Chunks kommen bursty,
// das Rendern folgt dem rAF-Takt, nicht dem Chunk-Takt.
//
// Text-/Thinking-Deltas werden gebündelt und per schedule-Callback (rAF)
// als EIN kombiniertes Delta geflushed — flüssiges Tippen regardless of
// Chunk-Granulat. Diskrete Events (message_end, tool_execution_*, …)
// sind keine Deltas: push() meldet false, und der Aufrufer leert den
// Buffer VOR dem Dispatch — die Reihenfolge bleibt gewahrt.
//
// Pure over (text, think) + injizierte schedule — node --test ohne DOM.
// ════════════════════════════════════════════════════════════════════

export function createSmoothStream({ onFlush, schedule }) {
  let text = ''
  let think = ''
  let pending = false
  const flushNow = () => {
    pending = false
    if (!text && !think) return
    const t = text
    const th = think
    text = ''
    think = ''
    onFlush(t, th)
  }
  return {
    /** true = gebuffert (Aufrufer überspringt den direkten Dispatch). */
    push(type, data) {
      if (type !== 'message_update') return false
      const ae = data?.assistantMessageEvent || data
      if (ae?.type === 'text_delta' && ae.delta) {
        text += ae.delta
        if (!pending) { pending = true; schedule(flushNow) }
        return true
      }
      if (ae?.type === 'thinking_delta' && ae.delta) {
        think += ae.delta
        if (!pending) { pending = true; schedule(flushNow) }
        return true
      }
      return false
    },
    /** Reihenfolge-Garantie: vor diskreten Events den Buffer leeren. */
    flush() { flushNow() },
    buffered() { return text.length + think.length > 0 },
  }
}
