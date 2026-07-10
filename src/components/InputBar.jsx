// ════════════════════════════════════════════════════════════════════
// InputBar — bottom input with attachment support
// ════════════════════════════════════════════════════════════════════
import { useState, useRef, useEffect } from 'react'

export function InputBar({ onSend, onSteer, onStop, streaming, attachments, onRemoveAttachment, onAddFiles }) {
  const [text, setText] = useState('')
  const ref = useRef(null)
  const fileRef = useRef(null)

  useEffect(() => {
    if (!streaming) ref.current?.focus()
  }, [streaming])

  const handleKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleSend = () => {
    if (!text.trim() && attachments.length === 0) return
    if (streaming) {
      onSteer(text)
    } else {
      onSend(text)
    }
    setText('')
    if (ref.current) ref.current.style.height = 'auto'
  }

  const handlePaste = (e) => {
    const items = e.clipboardData?.items
    if (!items) return
    const files = []
    for (const item of items) {
      if (item.kind === 'file') files.push(item.getAsFile())
    }
    if (files.length) { e.preventDefault(); onAddFiles(files) }
  }

  const handleDrop = (e) => {
    e.preventDefault()
    const files = Array.from(e.dataTransfer?.files || [])
    if (files.length) onAddFiles(files)
  }

  return (
    <div className="input-area" onDrop={handleDrop} onDragOver={e => e.preventDefault()}>
      {attachments.length > 0 && (
        <div className="attachment-bar">
          {attachments.map(a => (
            <div key={a.id} className="attachment-preview">
              {a.isImage && a.previewUrl && <img src={a.previewUrl} alt={a.name} />}
              <span>{a.name}</span>
              <button className="att-remove" onClick={() => onRemoveAttachment(a.id)}>×</button>
            </div>
          ))}
        </div>
      )}
      <div className="input-bar">
        <textarea
          ref={ref}
          value={text}
          onChange={e => {
            setText(e.target.value)
            e.target.style.height = 'auto'
            e.target.style.height = Math.min(e.target.scrollHeight, 200) + 'px'
          }}
          onKeyDown={handleKey}
          onPaste={handlePaste}
          placeholder={streaming ? 'Steer π… (queued after current turn)' : 'Ask π anything…'}
          rows={1}
        />
        <button className="ib-btn" onClick={() => fileRef.current?.click()} title="Attach file">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"/></svg>
        </button>
        <input ref={fileRef} type="file" multiple style={{ display: 'none' }}
          onChange={e => { onAddFiles(Array.from(e.target.files || [])); e.target.value = '' }} />
        {streaming ? (
          <button className="ib-btn stop" onClick={onStop} title="Stop">⏹</button>
        ) : (
          <button className="ib-btn send" onClick={handleSend} title="Send" disabled={!text.trim() && !attachments.length}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3.714 3.048a.498.498 0 0 0-.683.627l2.843 7.627a2 2 0 0 1 0 1.396l-2.842 7.627a.498.498 0 0 0 .682.627l18-8.5a.5.5 0 0 0 0-.904z"/><path d="M6 12h16"/></svg>
          </button>
        )}
      </div>
    </div>
  )
}
