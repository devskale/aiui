// ════════════════════════════════════════════════════════════════════
// InputBar — bottom input: textarea + attachments, composing the slash and
// @-mention autocomplete hooks. Owns text + the textarea ref + send/steer.
// ════════════════════════════════════════════════════════════════════
import { useState, useRef, useEffect } from 'react'
import { File as FileIcon, LoaderCircle, Mic, Square, SendHorizontal } from 'lucide-react'
import { useSlashMenu } from '../hooks/useSlashMenu'
import { useMention } from '../hooks/useMention'
import { useStt } from '../hooks/useStt'
import { rewriteSkillCommand } from '../lib/compose'

// Splits a file list into accepted + image-rejected. When the current model
// can't take images, image files are stripped so they never reach the server.
function splitByImageSupport(files, imageCapable) {
  const arr = Array.from(files || [])
  if (imageCapable) return { accept: arr, rejectedImages: 0 }
  let rejectedImages = 0
  const accept = []
  for (const f of arr) {
    if (f.type.startsWith('image/')) rejectedImages++
    else accept.push(f)
  }
  return { accept, rejectedImages }
}

export function InputBar({ onSend, onSteer, onStop, streaming, attachments, onRemoveAttachment, onAddFiles, onCompact, onNewChat, onOpenModelPicker, imageCapable, inputRef, sttLanguage }) {
  const [text, setText] = useState('')
  const ref = inputRef || useRef(null)
  const fileRef = useRef(null)

  // Transient inline notice (e.g. "model doesn't support images").
  const [imageNotice, setImageNotice] = useState('')
  const flashNotice = (msg) => {
    setImageNotice(msg)
    setTimeout(() => setImageNotice(prev => (prev === msg ? '' : prev)), 3200)
  }

  // Voice input (ADR-0004): OS/browser recognizer when available, else the
  // STT gateway (streaming WS or batch proxy). Transcript lands in the
  // textarea; hold-to-talk on the mic, or click to toggle.
  const stt = useStt({
    language: sttLanguage || 'auto',
    onTranscript: (text) => {
      if (!text) return
      setText(prev => (prev && prev.trim() ? prev.replace(/\s+$/, '') + ' ' : '') + text)
      requestAnimationFrame(() => {
        if (ref.current) {
          ref.current.style.height = 'auto'
          ref.current.style.height = Math.min(ref.current.scrollHeight, 200) + 'px'
          ref.current.focus()
        }
      })
    },
    onError: flashNotice,
  })

  // Hold-to-talk: pointerdown arms a hold; release after ≥250ms stops and
  // inserts. A quick click (<250ms) toggles recording instead (touch-friendly).
  const holdTimerRef = useRef(null)
  const holdArmedRef = useRef(false)
  const micDown = () => {
    if (stt.state !== 'idle') return
    holdArmedRef.current = false
    holdTimerRef.current = setTimeout(() => { holdArmedRef.current = true; stt.start() }, 250)
  }
  const micUp = () => {
    clearTimeout(holdTimerRef.current)
    if (holdArmedRef.current) stt.stop()          // was a hold → stop + insert
    else if (stt.state === 'idle') stt.toggle()   // quick click → start; next click stops
  }

  const onHostAction = (item) => {
    if (item.run === 'compact') onCompact?.()
    else if (item.run === 'new') onNewChat?.()
    else if (item.run === 'model') onOpenModelPicker?.()
  }
  const slash = useSlashMenu({ text, setText, textareaRef: ref, onHostAction })
  const mention = useMention({ text, setText, textareaRef: ref })

  useEffect(() => {
    if (!streaming) ref.current?.focus()
  }, [streaming])

  const handleKey = (e) => {
    if (mention.onKeyDown(e)) return
    if (slash.onKeyDown(e)) return
    if (e.key === 'Escape' && streaming) {
      e.preventDefault()
      onStop()
      return
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleSend = () => {
    // Guard: never fire images at a model that can't take them.
    if (!imageCapable && attachments.some(a => a.isImage)) {
      flashNotice("This model doesn't support images — remove them to send.")
      return
    }
    if (!text.trim() && attachments.length === 0) return
    const textToSend = rewriteSkillCommand(text, slash.skills)
    if (streaming) {
      onSteer(textToSend)
    } else {
      onSend(textToSend)
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
    if (!files.length) return
    e.preventDefault()
    const { accept, rejectedImages } = splitByImageSupport(files, imageCapable)
    if (rejectedImages) flashNotice(`${rejectedImages} image${rejectedImages > 1 ? 's' : ''} not attached — this model doesn't support images.`)
    if (accept.length) onAddFiles(accept)
  }

  const handleDrop = (e) => {
    e.preventDefault()
    const { accept, rejectedImages } = splitByImageSupport(e.dataTransfer?.files || [], imageCapable)
    if (rejectedImages) flashNotice(`${rejectedImages} image${rejectedImages > 1 ? 's' : ''} not attached — this model doesn't support images.`)
    if (accept.length) onAddFiles(accept)
  }

  const shortenPath = (p) => {
    const parts = p.split('/')
    return parts.length > 3 ? '…/' + parts.slice(-3).join('/') : p
  }

  return (
    <div className="input-area" onDrop={handleDrop} onDragOver={e => e.preventDefault()}>
      {/* Slash command dropdown */}
      {slash.open && (
        <div className="slash-dropdown">
          {slash.items.map((item, i) => (
            <button
              key={item.id}
              className={`slash-item ${i === slash.index ? 'active' : ''} ${item.run !== 'fill' ? 'action' : ''}`}
              onMouseDown={(e) => { e.preventDefault(); slash.apply(item) }}
            >
              <span className="slash-name">{item.title}</span>
              {item.description && <span className="slash-desc">{item.description}</span>}
            </button>
          ))}
        </div>
      )}

      {/* @-mention file dropdown */}
      {mention.open && (
        <div className="mention-dropdown">
          <div className="mention-head">Insert file</div>
          {mention.files.map((file, i) => (
            <button
              key={file}
              className={`mention-item ${i === mention.index ? 'active' : ''}`}
              onMouseDown={(e) => { e.preventDefault(); mention.insert(file) }}
              title={file}
            >
              <span className="mention-icon"><FileIcon size={12} /></span>
              <span className="mention-path">{shortenPath(file)}</span>
            </button>
          ))}
        </div>
      )}

      {imageNotice && <div className="ib-notice">{imageNotice}</div>}
      {(stt.state === 'recording' || stt.state === 'processing') && (
        <div className="stt-line">
          {stt.state === 'processing' ? <LoaderCircle size={12} className="spin" /> : <span className="stt-dot" />}
          <span className="stt-partial">{stt.partial || (stt.state === 'processing' ? 'transcribing…' : 'listening…')}</span>
        </div>
      )}
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
          placeholder={streaming ? 'Steer π… (queued after current turn)' : 'Ask π anything…  (type / for commands, @ for files)'}
          rows={1}
        />
        {stt.mode && (
          <button
            className={`ib-btn mic ${stt.state === 'recording' ? 'rec' : ''}`}
            onPointerDown={micDown}
            onPointerUp={micUp}
            disabled={stt.state === 'processing'}
            title={stt.mode === 'webspeech' ? 'Speak (browser speech recognition — hold or click)' : stt.mode === 'ws' ? 'Speak (DGX streaming — hold or click)' : 'Speak (transcribed when you stop)'}
          >
            {stt.state === 'recording' ? <Square size={16} />
              : stt.state === 'processing' ? <LoaderCircle size={18} className="spin" />
              : <Mic size={18} />}
          </button>
        )}
        <button className="ib-btn" onClick={() => fileRef.current?.click()} title={imageCapable ? 'Attach file' : 'Attach file (images disabled — model doesn\'t support them)'}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"/></svg>
        </button>
        <input ref={fileRef} type="file" multiple style={{ display: 'none' }}
          onChange={e => {
            const { accept, rejectedImages } = splitByImageSupport(e.target.files || [], imageCapable)
            if (rejectedImages) flashNotice(`${rejectedImages} image${rejectedImages > 1 ? 's' : ''} not attached — this model doesn't support images.`)
            if (accept.length) onAddFiles(accept)
            e.target.value = ''
          }} />
        {streaming ? (
          <button className="ib-btn stop" onClick={onStop} title="Stop">
            <span className="ib-stop-wrap">
              <LoaderCircle size={18} className="spin" />
              <Square size={7} className="ib-stop-core" />
            </span>
          </button>
        ) : (
          <button className="ib-btn send" onClick={handleSend} title="Send" disabled={!text.trim() && !attachments.length}>
            <SendHorizontal size={18} />
          </button>
        )}
      </div>
    </div>
  )
}
