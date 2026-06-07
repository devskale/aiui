// ════════════════════════════════════════════════════════════════════
// InputBar — bottom input with attachment support
// ════════════════════════════════════════════════════════════════════
import { useState, useRef, useEffect } from 'react'

export function InputBar({ onSend, onStop, streaming, attachments, onRemoveAttachment, onAddFiles }) {
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
    if (streaming) return
    onSend(text)
    setText('')
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
          onChange={e => setText(e.target.value)}
          onKeyDown={handleKey}
          onPaste={handlePaste}
          placeholder="Ask π anything…"
          rows={1}
        />
        <button className="ib-btn" onClick={() => fileRef.current?.click()} title="Attach file">
          📎
        </button>
        <input ref={fileRef} type="file" multiple style={{ display: 'none' }}
          onChange={e => { onAddFiles(Array.from(e.target.files || [])); e.target.value = '' }} />
        {streaming ? (
          <button className="ib-btn stop" onClick={onStop} title="Stop">⏹</button>
        ) : (
          <button className="ib-btn send" onClick={handleSend} title="Send" disabled={!text.trim() && !attachments.length}>
            ↑
          </button>
        )}
      </div>
    </div>
  )
}
