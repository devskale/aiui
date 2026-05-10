import { useEffect, useRef, forwardRef } from 'react'
import { Icons } from '../lib/icons'

// ════════════════════════════════════════════════════════════════════
// AUTOCOMPLETE DROPDOWN
// ════════════════════════════════════════════════════════════════════
export function AcDropdown({ items, index, setIndex, onSelect }) {
  const ref = useRef(null)
  useEffect(() => {
    ref.current?.children[index]?.scrollIntoView({ block: 'nearest' })
  }, [index])
  return (
    <div className="ac-dropdown" ref={ref}>
      {items.map((f, i) => (
        <div key={f.id}
          className={`ac-item ${i === index ? 'active' : ''}`}
          onMouseEnter={() => setIndex(i)}
          onClick={() => onSelect(f.original_name)}>
          <span className="ac-icon">{f.mime_type?.startsWith('image/') ? '🖼' : f.mime_type === 'application/pdf' ? '📄' : '📝'}</span>
          <span className="ac-name">{f.original_name}</span>
          <span className="ac-folder">{f.folder_name || '—'}</span>
        </div>
      ))}
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════
// ATTACHMENT BAR
// ════════════════════════════════════════════════════════════════════
export function AttachmentBar({ attachments, onRemove }) {
  if (!attachments.length) return null
  return (
    <div className="attachment-bar">
      {attachments.map(att => (
        <div key={att.id} className="attachment-thumb">
          <img src={att.dataUrl} alt={att.name} />
          <button className="att-remove" onClick={() => onRemove(att.id)} title="Remove"><Icons.close /></button>
          <span className="att-name">{att.name}</span>
        </div>
      ))}
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════
// WELCOME INPUT (big centered)
// ════════════════════════════════════════════════════════════════════
export const WelcomeInput = forwardRef(function WelcomeInput(
  { value, onChange, onSend, onKeyDown, streaming, onStop, onAttachClick,
    acShow, acItems, acIndex, acSetIndex, acSelect, acSetShow }, ref) {
  return (
    <div className="welcome-input-wrap" style={{ position: 'relative' }}>
      <div className="welcome-input-box">
        <textarea ref={ref} value={value} onChange={e => onChange(e.target.value)}
          onKeyDown={onKeyDown} placeholder="How can I help you today?" rows={1}
          disabled={streaming} className="wi-textarea" />
        <div className="wi-actions-left">
          <button className="wi-action-btn" onClick={onAttachClick} title="Attach image"><Icons.attach /></button>
        </div>
        <div className="wi-actions-right">
          {streaming
            ? <button className="wi-send-btn stop" onClick={onStop} title="Stop"><Icons.stop /></button>
            : <button className="wi-send-btn" onClick={onSend} disabled={!value.trim()} title="Send"><Icons.send /></button>}
          <button className="wi-action-btn" title="Voice"><Icons.mic /></button>
        </div>
      </div>
      {acShow && <AcDropdown items={acItems} index={acIndex} setIndex={acSetIndex} onSelect={acSelect} />}
    </div>
  )
})

// ════════════════════════════════════════════════════════════════════
// CHAT INPUT (bottom bar)
// ════════════════════════════════════════════════════════════════════
export const ChatInput = forwardRef(function ChatInput(
  { value, onChange, onSend, onKeyDown, streaming, onStop, onAttachClick,
    acShow, acItems, acIndex, acSetIndex, acSelect, acSetShow }, ref) {
  return (
    <div style={{ position: 'relative' }}>
      <div className="chat-input-box">
        <textarea ref={ref} value={value} onChange={e => onChange(e.target.value)}
          onKeyDown={onKeyDown} placeholder="Send a message..." rows={1}
          disabled={streaming} className="ci-textarea" />
        <div className="ci-actions">
          <button className="ci-action-btn" onClick={onAttachClick} title="Attach image"><Icons.attach /></button>
          {streaming
            ? <button className="ci-send-btn stop" onClick={onStop} title="Stop"><Icons.stop /></button>
            : <button className="ci-send-btn" onClick={onSend} disabled={!value.trim()} title="Send"><Icons.send /></button>}
        </div>
      </div>
      {acShow && <AcDropdown items={acItems} index={acIndex} setIndex={acSetIndex} onSelect={acSelect} />}
    </div>
  )
})
