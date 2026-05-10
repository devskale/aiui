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

// Globe icon for web search tool
const GlobeIcon = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" />
    <line x1="2" y1="12" x2="22" y2="12" />
    <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
  </svg>
)

// ════════════════════════════════════════════════════════════════════
// WELCOME INPUT (big centered)
// ════════════════════════════════════════════════════════════════════
export const WelcomeInput = forwardRef(function WelcomeInput(
  { value, onChange, onSend, onKeyDown, streaming, onStop, onAttachClick, webOn, toggleWeb,
    acShow, acItems, acIndex, acSetIndex, acSelect }, ref) {
  return (
    <div className="welcome-input-wrap" style={{ position: 'relative' }}>
      <div className="welcome-input-box">
        <textarea ref={ref} value={value} onChange={e => onChange(e.target.value)}
          onKeyDown={onKeyDown} placeholder="How can I help you today?" rows={2}
          disabled={streaming} className="wi-textarea" />
        <div className="wi-toolbar">
          <button className="wi-tool-btn" onClick={onAttachClick} title="Attach image"><Icons.attach /></button>
          <button className={`wi-tool-btn ci-action-btn ${webOn ? 'active' : ''}`} onClick={toggleWeb} title="Web Search"><GlobeIcon /></button>
          <span className="wi-spacer" />
          {streaming
            ? <button className="wi-send-btn stop" onClick={onStop} title="Stop"><Icons.stop /></button>
            : <button className="wi-send-btn" onClick={onSend} disabled={!value.trim()} title="Send"><Icons.send /></button>}
        </div>
      </div>
      {acShow && <AcDropdown items={acItems} index={acIndex} setIndex={acSetIndex} onSelect={acSelect} />}
    </div>
  )
})

// ════════════════════════════════════════════════════════════════════
// CHAT INPUT (bottom bar) — icon | textarea | send
// ════════════════════════════════════════════════════════════════════
export const ChatInput = forwardRef(function ChatInput(
  { value, onChange, onSend, onKeyDown, streaming, onStop, onAttachClick, webOn, toggleWeb,
    acShow, acItems, acIndex, acSetIndex, acSelect }, ref) {
  return (
    <div style={{ position: 'relative' }}>
      <div className="chat-input-box">
        <textarea ref={ref} value={value} onChange={e => onChange(e.target.value)}
          onKeyDown={onKeyDown} placeholder="Send a message..." rows={2}
          disabled={streaming} className="ci-textarea" />
        <div className="ci-toolbar">
          <button className="ci-tool-btn" onClick={onAttachClick} title="Attach image"><Icons.attach /></button>
          <button className={`ci-tool-btn ci-action-btn ${webOn ? 'active' : ''}`} onClick={toggleWeb} title="Web Search"><GlobeIcon /></button>
          <span className="ci-spacer" />
          {streaming
            ? <button className="ci-send-btn stop" onClick={onStop} title="Stop"><Icons.stop /></button>
            : <button className="ci-send-btn" onClick={onSend} disabled={!value.trim()} title="Send"><Icons.send /></button>}
        </div>
      </div>
      {acShow && <AcDropdown items={acItems} index={acIndex} setIndex={acSetIndex} onSelect={acSelect} />}
    </div>
  )
})
