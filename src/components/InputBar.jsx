// ════════════════════════════════════════════════════════════════════
// InputBar — bottom input with attachment support, skill + @-file autocomplete
// ════════════════════════════════════════════════════════════════════
import { useState, useRef, useEffect, useMemo } from 'react'
import { apiUrl } from '../lib/api'

export function InputBar({ onSend, onSteer, onStop, streaming, attachments, onRemoveAttachment, onAddFiles }) {
  const [text, setText] = useState('')
  const [skills, setSkills] = useState([])
  const [acIndex, setAcIndex] = useState(0)
  const [acDismissed, setAcDismissed] = useState(false)

  // ── @-mention (file) autocomplete state ──
  const [mention, setMention] = useState(null)     // { query, atIndex } or null
  const [mentionFiles, setMentionFiles] = useState([])
  const [mentionIndex, setMentionIndex] = useState(0)
  const [mentionDismissed, setMentionDismissed] = useState(false)

  const ref = useRef(null)
  const fileRef = useRef(null)

  // Fetch available skills for autocomplete
  useEffect(() => {
    fetch(apiUrl('/api/commands'))
      .then(r => r.json())
      .then(data => setSkills(data?.skills || []))
      .catch(() => {})
  }, [])

  // ── Skill autocomplete: show when typing /skillname (no space yet) ──
  const firstWord = text.startsWith('/') ? text.slice(1).split(/\s/)[0] : ''
  const acItems = useMemo(() => {
    if (!text.startsWith('/') || text.includes(' ')) return []
    if (!firstWord) return skills
    return skills.filter(s => s.name.startsWith(firstWord))
  }, [text, skills, firstWord])

  const acOpen = !acDismissed && acItems.length > 0 && text.startsWith('/') && !text.includes(' ') && !mention

  // Reset index + dismissed when items change
  useEffect(() => { setAcIndex(0) }, [firstWord])
  useEffect(() => { setAcDismissed(false) }, [text])

  useEffect(() => {
    if (!streaming) ref.current?.focus()
  }, [streaming])

  // ── @-mention detection + file lookup ──
  const mentionMatch = useMemo(() => {
    if (mentionDismissed) return null
    const m = /(?:^|\s)@([^\s]*)$/.exec(text)
    if (!m) return null
    const query = m[1] ?? ''
    const atIndex = text.length - query.length - 1
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

  const completeSkill = (skillName) => {
    setText(`/${skillName} `)
    ref.current?.focus()
  }

  const handleKey = (e) => {
    // ── @-mention navigation ──
    if (mentionOpen) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setMentionIndex(i => Math.min(i + 1, mentionFiles.length - 1))
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setMentionIndex(i => Math.max(i - 1, 0))
        return
      }
      if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey)) {
        e.preventDefault()
        insertMention(mentionFiles[mentionIndex])
        return
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        setMentionDismissed(true)
        return
      }
    }

    // ── Skill autocomplete navigation ──
    if (acOpen) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setAcIndex(i => Math.min(i + 1, acItems.length - 1))
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setAcIndex(i => Math.max(i - 1, 0))
        return
      }
      if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey)) {
        e.preventDefault()
        completeSkill(acItems[acIndex]?.name || acItems[0]?.name)
        return
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        setAcDismissed(true)
        return
      }
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  // Rewrite /skillname → /skill:skillname if it matches a known skill
  const rewriteSkillCommand = (input) => {
    const match = input.match(/^\/([\w][\w-]*)/)
    if (match && skills.some(s => s.name === match[1])) {
      return '/skill:' + input.slice(1)
    }
    return input
  }

  const handleSend = () => {
    if (!text.trim() && attachments.length === 0) return
    const textToSend = rewriteSkillCommand(text)
    if (streaming) {
      onSteer(textToSend)
    } else {
      onSend(textToSend)
    }
    setText('')
    setMentionDismissed(false)
    setAcDismissed(false)
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

  const shortenPath = (p) => {
    const parts = p.split('/')
    return parts.length > 3 ? '…/' + parts.slice(-3).join('/') : p
  }

  return (
    <div className="input-area" onDrop={handleDrop} onDragOver={e => e.preventDefault()}>
      {/* Skill autocomplete dropdown */}
      {acOpen && (
        <div className="ac-dropdown">
          {acItems.map((skill, i) => (
            <button
              key={skill.name}
              className={`ac-item ${i === acIndex ? 'active' : ''}`}
              onMouseDown={(e) => { e.preventDefault(); completeSkill(skill.name) }}
            >
              <span className="ac-name">/{skill.name}</span>
              {skill.description && (
                <span className="ac-desc">
                  {skill.description.length > 55 ? skill.description.slice(0, 55) + '…' : skill.description}
                </span>
              )}
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
          placeholder={streaming ? 'Steer π… (queued after current turn)' : 'Ask π anything…  (type / for skills, @ for files)'}
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
