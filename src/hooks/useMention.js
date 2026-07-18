// ════════════════════════════════════════════════════════════════════
// useMention — the @-file autocomplete state machine
//
// Functions over the composer's (text, setText, textareaRef). Owns index +
// dismissed state, fetches /api/files?q= for the current trigger, inserts the
// chosen file path. Pure trigger/insert math lives in ../lib/compose.js.
// ════════════════════════════════════════════════════════════════════
import { useState, useEffect, useMemo } from 'react'
import { apiUrl } from '../lib/api'
import { detectMentionTrigger, applyMention } from '../lib/compose'

export function useMention({ text, setText, textareaRef }) {
  const [files, setFiles] = useState([])
  const [index, setIndex] = useState(0)
  const [dismissed, setDismissed] = useState(false)

  const match = useMemo(() => (dismissed ? null : detectMentionTrigger(text)), [text, dismissed])
  const open = !!match && files.length > 0

  useEffect(() => { setDismissed(false) }, [text])

  useEffect(() => {
    if (!match) { setFiles([]); return }
    const ctrl = new AbortController()
    fetch(apiUrl('/api/files?q=' + encodeURIComponent(match.query)), { signal: ctrl.signal })
      .then(r => r.json())
      .then(d => setFiles(Array.isArray(d.files) ? d.files : []))
      .catch(() => {})
    return () => ctrl.abort()
  }, [match])

  useEffect(() => { setIndex(0) }, [files])

  const placeCursor = (cursor) => {
    requestAnimationFrame(() => textareaRef.current?.setSelectionRange(cursor, cursor))
  }

  const insert = (filePath) => {
    if (!match) return
    const { text: next, cursor } = applyMention(text, match.atIndex, match.query, filePath)
    setText(next)
    setDismissed(true)
    placeCursor(cursor)
  }

  // Handle this menu's keys. Returns true if it consumed the event.
  const onKeyDown = (e) => {
    if (!open) return false
    if (e.key === 'ArrowDown') { e.preventDefault(); setIndex(i => Math.min(i + 1, files.length - 1)); return true }
    if (e.key === 'ArrowUp') { e.preventDefault(); setIndex(i => Math.max(i - 1, 0)); return true }
    if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey)) { e.preventDefault(); insert(files[index]); return true }
    if (e.key === 'Escape') { e.preventDefault(); setDismissed(true); return true }
    return false
  }

  return { files, index, open, insert, onKeyDown }
}
