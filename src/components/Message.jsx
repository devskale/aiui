import React from 'react'
import { Icons } from '../lib/icons'
import { renderMd } from '../lib/utils'

// ════════════════════════════════════════════════════════════════════
// MESSAGE
// ════════════════════════════════════════════════════════════════════
export function Message({ msg }) {
  if (msg.role === 'error') {
    return <div className="msg-row error"><div className="msg-bubble error-bubble">{msg.content}</div></div>
  }
  const isUser = msg.role === 'user'

  let text = ''
  let images = []
  let raw = msg.content
  // Content may come from DB as JSON-stringified array
  if (typeof raw === 'string' && raw.trim().startsWith('[')) {
    try { raw = JSON.parse(raw) } catch { /* keep as string */ }
  }
  if (typeof raw === 'string') {
    text = raw
  } else if (Array.isArray(raw)) {
    for (const block of raw) {
      if (block.type === 'text') text += block.text
      else if (block.type === 'image_url') images.push(block.image_url?.url)
    }
  }

  const tools = msg.tools || []
  const toolIcons = { read_file: '📄', web_search: '🔍', fetch_url: '🌐' }

  // Group tools by name for stacking
  const toolGroups = {}
  for (const tc of tools) {
    const key = tc.name
    if (!toolGroups[key]) toolGroups[key] = []
    toolGroups[key].push(tc)
  }

  const groupLabel = (name, items) => {
    if (name === 'web_search') return 'Sources'
    if (name === 'fetch_url') return `Fetched${items.length > 1 ? ` (${items.length})` : ''}`
    if (name === 'read_file') return `Read${items.length > 1 ? ` (${items.length})` : ''}`
    return name
  }

  const anyRunning = tools.some(t => t.status === 'running')

  return (
    <div className={`msg-row ${isUser ? 'user' : 'assistant'}`}>
      {!isUser && <div className="msg-avatar"><Icons.logo /></div>}
      <div className={`msg-bubble ${isUser ? 'user-bubble' : ''}`}>
        {tools.length > 0 && (
          <div className={`tool-stack ${anyRunning ? 'tool-stack-active' : ''}`}>
            {Object.entries(toolGroups).map(([name, items]) => {
              const icon = toolIcons[name] || '🔧'
              const allDone = items.every(t => t.status === 'done')
              const hasError = items.some(t => t.status === 'error')
              return (
                <div key={name} className={`tool-group ${hasError ? 'tool-err' : allDone ? 'tool-done' : 'tool-running'}`}>
                  <span className="tool-stacked-icons">
                    {items.map((_, i) => (
                      <span key={i} className="tool-stacked-icon" style={{ left: i * 10 }}>{icon}</span>
                    ))}
                    {anyRunning && items.some(t => t.status === 'running') && (
                      <span className="tool-stack-spin" />
                    )}
                  </span>
                  <span className="tool-stack-label">{groupLabel(name, items)}</span>
                </div>
              )
            })}
          </div>
        )}
        {images.length > 0 && images.map((src, i) => (
          <img key={i} src={src} alt="attachment" className="msg-image" />
        ))}
        {text ? renderMd(text) : null}
      </div>
    </div>
  )
}

export function TypingIndicator() {
  return (
    <div className="msg-row assistant">
      <div className="msg-avatar"><Icons.logo /></div>
      <div className="msg-bubble"><TypingInline /></div>
    </div>
  )
}

function TypingInline() {
  return <span className="typing-dots"><i /><i /><i /></span>
}
