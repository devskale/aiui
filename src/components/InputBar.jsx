// ════════════════════════════════════════════════════════════════════
// InputBar — bottom input with attachments, @-file + /command autocomplete
// ════════════════════════════════════════════════════════════════════
import { useState, useRef, useEffect, useMemo } from 'react'
import { apiUrl } from '../lib/api'

// Splits a file list into accepted + image-rejected. When the current model
// can't take images, image files are stripped so they never reach the server;
// the caller surfaces a note for the rejected count.
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

export function InputBar({ onSend, onSteer, onStop, streaming, attachments, onRemoveAttachment, onAddFiles, onCompact, onNewChat, onOpenModelPicker, imageCapable }) {
  const [text, setText] = useState('')
  const [commands, setCommands] = useState({ skills: [], prompts: [], extensions: [] })
  const [slashIndex, setSlashIndex] = useState(0)
  const [slashDismissed, setSlashDismissed] = useState(false)

  // ── @-mention (file) autocomplete state ──
  const [mention, setMention] = useState(null)     // { query, atIndex } or null
  const [mentionFiles, setMentionFiles] = useState([])
  const [mentionIndex, setMentionIndex] = useState(0)
  const [mentionDismissed, setMentionDismissed] = useState(false)

  // Transient inline notice (e.g. "model doesn't support images").
  const [imageNotice, setImageNotice] = useState('')
  const flashNotice = (msg) => {
    setImageNotice(msg)
    setTimeout(() => setImageNotice(prev => (prev === msg ? '' : prev)), 3200)
  }

  const ref = useRef(null)
  const fileRef = useRef(null)

  // Fetch available commands (skills/prompts/extensions) for the slash menu
  useEffect(() => {
    fetch(apiUrl('/api/commands'))
      .then(r => r.json())
      .then(d => setCommands({ skills: d?.skills || [], prompts: d?.prompts || [], extensions: d?.extensions || [] }))
      .catch(() => {})
  }, [])

  // ── Host actions available in the slash menu ──
  const HOST_ACTIONS = useMemo(() => ([
    { id: 'compact', command: '/compact', title: '/compact', description: 'Compact conversation context now', run: 'compact' },
    { id: 'new', command: '/new', title: '/new', description: 'Start a new chat', run: 'new' },
    { id: 'model', command: '/model', title: '/model', description: 'Change model', run: 'model' },
  ]), [])

  // ── Slash menu: detect trailing "/query" (at start or after whitespace) ──
  const slashMatch = useMemo(() => {
    if (slashDismissed) return null
    const m = /(?:^|\s)(\/[^\s]*)$/.exec(text)
    if (!m) return null
    return { query: m[1], start: m.index + (m[0].length - m[1].length) }
  }, [text, slashDismissed])

  const slashItems = useMemo(() => {
    if (!slashMatch) return []
    const q = slashMatch.query.replace(/^\/+/, '').toLowerCase()
    const items = []
    for (const a of HOST_ACTIONS) {
      if (!q || a.command.toLowerCase().includes(q) || a.title.toLowerCase().includes(q)) items.push(a)
    }
    const groups = [['skills', 'skill'], ['prompts', 'prompt'], ['extensions', 'extension']]
    for (const [key, prefix] of groups) {
      for (const c of commands[key] || []) {
        const cmd = `/${prefix}:${c.name}`
        if (!q || c.name.toLowerCase().includes(q) || cmd.toLowerCase().includes(q)) {
          items.push({ id: cmd, command: cmd, title: cmd, description: c.description, run: 'fill' })
        }
      }
    }
    return items
  }, [slashMatch, commands, HOST_ACTIONS])

  const slashOpen = slashItems.length > 0

  useEffect(() => { setSlashIndex(0) }, [slashItems])
  useEffect(() => { setSlashDismissed(false) }, [text])

  useEffect(() => {
    if (!streaming) ref.current?.focus()
  }, [streaming])

  // ── @-mention detection + file lookup ──
  const mentionMatch = useMemo(() => {
    if (mentionDismissed) return null
    const m = /(?:^|\s)@([^\s]*)$/.exec(text)
    if (!m) return null
    const query = m[1] ?? ''
    const atIndex = m.index + (m[0].length - query.length - 1)
    return { query, atIndex }
  }, [text, mentionDismissed])

  useEffect(() => { setMention(mentionMatch) }, [mentionMatch])

  useEffect(() => {
    if (!mention) { setMentionFiles([]); return }
    const ctrl = new AbortController()
    fetch(apiUrl('/api/files?q=' + encodeURIComponent(mention.query)), { signal: ctrl.signal })
      .then(r => r.json())
      .then(d => setMentionFiles(Array.isArray(d.files) ? d.files : []))
      .catch(() => {})
    return () => ctrl.abort()
  }, [mention])

  useEffect(() => { setMentionIndex(0) }, [mentionFiles])
  useEffect(() => { setMentionDismissed(false) }, [text])

  const mentionOpen = !!mention && mentionFiles.length > 0

  const insertMention = (filePath) => {
    if (!mention) return
    const before = text.slice(0, mention.atIndex)
    const after = text.slice(mention.atIndex + 1 + mention.query.length)
    const inserted = '@' + filePath + ' '
    const newText = before + inserted + after
    setText(newText)
    setMentionDismissed(true)
    requestAnimationFrame(() => {
      const ta = ref.current
      if (ta) {
        const pos = before.length + inserted.length
        ta.setSelectionRange(pos, pos)
      }
    })
  }

  const applySlash = (item) => {
    if (!slashMatch) return
    if (item.run === 'compact') { onCompact?.(); setText(''); setSlashDismissed(true); return }
    if (item.run === 'new') { onNewChat?.(); setText(''); setSlashDismissed(true); return }
    if (item.run === 'model') { onOpenModelPicker?.(); setText(''); setSlashDismissed(true); return }
    // fill the command text into the composer
    const before = text.slice(0, slashMatch.start)
    const after = text.slice(slashMatch.start + slashMatch.query.length)
    const inserted = item.command + ' '
    const newText = before + inserted + after
    setText(newText)
    setSlashDismissed(true)
    requestAnimationFrame(() => {
      const ta = ref.current
      if (ta) {
        const pos = before.length + inserted.length
        ta.setSelectionRange(pos, pos)
      }
    })
  }

  const handleKey = (e) => {
    // ── @-mention navigation ──
    if (mentionOpen) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setMentionIndex(i => Math.min(i + 1, mentionFiles.length - 1)); return }
      if (e.key === 'ArrowUp') { e.preventDefault(); setMentionIndex(i => Math.max(i - 1, 0)); return }
      if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey)) { e.preventDefault(); insertMention(mentionFiles[mentionIndex]); return }
      if (e.key === 'Escape') { e.preventDefault(); setMentionDismissed(true); return }
    }

    // ── Slash command navigation ──
    if (slashOpen) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setSlashIndex(i => Math.min(i + 1, slashItems.length - 1)); return }
      if (e.key === 'ArrowUp') { e.preventDefault(); setSlashIndex(i => Math.max(i - 1, 0)); return }
      if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey)) { e.preventDefault(); applySlash(slashItems[slashIndex]); return }
      if (e.key === 'Escape') { e.preventDefault(); setSlashDismissed(true); return }
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  // Rewrite /skillname → /skill:skillname if it matches a known skill
  const rewriteSkillCommand = (input) => {
    const match = input.match(/^\/([\w][\w-]*)/)
    if (match && (commands.skills || []).some(s => s.name === match[1])) {
      return '/skill:' + input.slice(1)
    }
    return input
  }

  const handleSend = () => {
    // Guard: never fire images at a model that can't take them.
    if (!imageCapable && attachments.some(a => a.isImage)) {
      flashNotice("This model doesn't support images — remove them to send.")
      return
    }
    if (!text.trim() && attachments.length === 0) return
    const textToSend = rewriteSkillCommand(text)
    if (streaming) {
      onSteer(textToSend)
    } else {
      onSend(textToSend)
    }
    setText('')
    setMentionDismissed(false)
    setSlashDismissed(false)
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
      {slashOpen && (
        <div className="slash-dropdown">
          {slashItems.map((item, i) => (
            <button
              key={item.id}
              className={`slash-item ${i === slashIndex ? 'active' : ''} ${item.run !== 'fill' ? 'action' : ''}`}
              onMouseDown={(e) => { e.preventDefault(); applySlash(item) }}
            >
              <span className="slash-name">{item.title}</span>
              {item.description && <span className="slash-desc">{item.description}</span>}
            </button>
          ))}
        </div>
      )}

      {/* @-mention file dropdown */}
      {mentionOpen && (
        <div className="mention-dropdown">
          <div className="mention-head">Insert file</div>
          {mentionFiles.map((file, i) => (
            <button
              key={file}
              className={`mention-item ${i === mentionIndex ? 'active' : ''}`}
              onMouseDown={(e) => { e.preventDefault(); insertMention(file) }}
              title={file}
            >
              <span className="mention-icon">📄</span>
              <span className="mention-path">{shortenPath(file)}</span>
            </button>
          ))}
        </div>
      )}

      {imageNotice && <div className="ib-notice">{imageNotice}</div>}
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
