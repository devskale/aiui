import React from 'react'
import { Icons } from '../lib/icons'
import { renderMd } from '../lib/utils'

// ════════════════════════════════════════════════════════════════════
// MESSAGE
// ════════════════════════════════════════════════════════════════════
export function Message({ msg, isLast, onRegenerate, onEdit, streaming }) {
  if (msg.role === 'error') {
    return <div className="msg-row error"><div className="msg-bubble error-bubble">{msg.content}</div></div>
  }
  const isUser = msg.role === 'user'
  const [hovered, setHovered] = React.useState(false)

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

  const formatToolLabel = (tc) => {
    if (tc.name === 'web_search') return (tc.args?.query || '').slice(0, 60)
    if (tc.name === 'fetch_url') return (tc.args?.url || '').replace(/^https?:\/\//, '').slice(0, 50)
    if (tc.name === 'read_file') return tc.args?.file_id || ''
    return ''
  }

  const showActions = hovered && !streaming && (
    (isUser && onEdit) || (!isUser && isLast && onRegenerate)
  )

  return (
    <div className={`msg-row ${isUser ? 'user' : 'assistant'}`}
      onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}>
      {!isUser && <div className="msg-avatar"><Icons.logo /></div>}
      <div className={`msg-bubble ${isUser ? 'user-bubble' : ''}`}>
        {tools.length > 0 && (
          <div className="tool-stack">
            {tools.map((tc, i) => (
              <div key={i} className={`tool-pill ${tc.status || 'done'}`} style={{ marginLeft: i * 18 }}>
                <span className="tool-pill-icon">{toolIcons[tc.name] || '🔧'}</span>
                <span className="tool-pill-label">
                  {tc.name}
                  {formatToolLabel(tc) && <span className="tool-pill-arg"> {formatToolLabel(tc)}</span>}
                </span>
                {tc.status === 'running' && <span className="tool-pill-spin" />}
                {tc.status === 'done' && <span className="tool-pill-ok" />}
                {tc.status === 'error' && <span className="tool-pill-err" />}
              </div>
            ))}
          </div>
        )}
        {images.length > 0 && images.map((src, i) => (
          <img key={i} src={src} alt="attachment" className="msg-image" />
        ))}
        {text ? renderMd(text) : null}
        {showActions && (
          <div className="msg-actions">
            {isUser && onEdit && (
              <button className="msg-action-btn" onClick={() => onEdit(text)} title="Edit & resubmit">
                <Icons.edit /> <span>Edit</span>
              </button>
            )}
            {!isUser && isLast && onRegenerate && (
              <button className="msg-action-btn" onClick={onRegenerate} title="Regenerate">
                <Icons.refresh /> <span>Regenerate</span>
              </button>
            )}
          </div>
        )}
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
