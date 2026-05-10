import { useState, useRef } from 'react'

// ─── useStreamChat — LLM streaming + tool-call display ──────
export function useStreamChat() {
  const [streaming, setStreaming] = useState(false)
  const abortRef = useRef(null)

  const stream = async ({ messages, onUpdateMessages, chatId, onUpdateChat, llmConfig, webSearch }) => {
    try {
      const apiMessages = messages.map(m => ({ role: m.role, content: m.content }))
      let assistantContent = ''
      let toolCalls = []

      onUpdateMessages(prev => [...prev, { role: 'assistant', content: '', tools: [] }])

      const res = await fetch('/api/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          __base_url: llmConfig.baseUrl, __api_key: llmConfig.apiKey,
          model: llmConfig.model, messages: apiMessages, stream: true,
          __web_search: webSearch || false,
        }),
        signal: abortRef.current?.signal,
      })
      if (!res.ok) throw new Error(`API ${res.status}: ${await res.text()}`)

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buf = ''
      let currentEvent = null

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buf += decoder.decode(value, { stream: true })
        const lines = buf.split('\n')
        buf = lines.pop() || ''

        for (const line of lines) {
          const t = line.trim()
          if (t.startsWith('event:')) { currentEvent = t.slice(6).trim(); continue }
          if (!t.startsWith('data:')) continue
          const d = t.slice(5).trim()
          if (d === '[DONE]') { currentEvent = null; continue }

          try {
            const j = JSON.parse(d)
            if (currentEvent === 'tool_status') {
              if (j.type === 'tool_start') toolCalls.push({ name: j.tool, args: j.args, status: 'running', result: null })
              else if (j.type === 'tool_result') {
                const last = toolCalls[toolCalls.length - 1]
                if (last) { last.status = j.ok ? 'done' : 'error'; last.result = j.preview }
              }
              onUpdateMessages(prev => {
                const n = [...prev]
                n[n.length - 1] = { ...n[n.length - 1], content: assistantContent, tools: [...toolCalls] }
                return n
              })
              currentEvent = null
              continue
            }
            const delta = j.choices?.[0]?.delta?.content
            if (delta) {
              assistantContent += delta
              onUpdateMessages(prev => {
                const n = [...prev]
                n[n.length - 1] = { ...n[n.length - 1], content: assistantContent, tools: [...toolCalls] }
                return n
              })
            }
          } catch { /* skip malformed chunks */ }
        }
      }

      // Sanitize base64 for DB, then persist
      const finalAssistant = { role: 'assistant', content: assistantContent, tools: toolCalls.length > 0 ? [...toolCalls] : undefined }
      const final = [...messages, finalAssistant]
      const sanitized = final.map(m => {
        if (typeof m.content === 'string') return m
        if (!Array.isArray(m.content)) return m
        const clean = m.content
          .map(b => (b.type === 'image_url' && b.image_url?.url?.startsWith('data:'))
            ? { type: 'text', text: `[🖼 ${b.ref_name || 'image'}]` } : b)
          .filter(b => !(b.type === 'text' && !b.text.trim()))
        if (clean.length === 0) return { ...m, content: '' }
        if (clean.length === 1 && clean[0].type === 'text') return { ...m, content: clean[0].text }
        return { ...m, content: clean }
      })
      onUpdateChat(chatId, { messages: sanitized })
      onUpdateMessages(() => final) // keeps tools for display
    } catch (err) {
      if (err.name !== 'AbortError') {
        onUpdateMessages(prev => [...prev.slice(0, -1), { role: 'error', content: `Error: ${err.message}` }])
      }
    } finally {
      setStreaming(false)
      abortRef.current = null
    }
  }

  const abort = () => abortRef.current?.abort()

  return { streaming, setStreaming, stream, abort }
}
