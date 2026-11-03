// ════════════════════════════════════════════════════════════════════
// useLibraryMention — das #-Dokument-Autocomplete (Bibliothek = uploads/).
//
// Spiegelbild zu useMention (@): Trigger-Mathe aus lib/compose (getestet),
// Fetch /api/library?q= für den aktuellen Trigger, insert setzt '#name '.
// ════════════════════════════════════════════════════════════════════
import { useState, useEffect, useMemo } from 'react'
import { apiUrl } from '../lib/api'
import { detectHashtagTrigger, applyHashtag } from '../lib/compose'

export function useLibraryMention({ text, setText, textareaRef }) {
  const [docs, setDocs] = useState([])
  const [index, setIndex] = useState(0)
  const [dismissed, setDismissed] = useState(false)

  const match = useMemo(() => (dismissed ? null : detectHashtagTrigger(text)), [text, dismissed])
  const open = !!match && docs.length > 0

  useEffect(() => { setDismissed(false) }, [text])

  useEffect(() => {
    if (!match) { setDocs([]); return }
    const ctrl = new AbortController()
    fetch(apiUrl('/api/library?q=' + encodeURIComponent(match.query)), { signal: ctrl.signal })
      .then(r => r.json())
      .then(d => setDocs(Array.isArray(d.docs) ? d.docs : []))
      .catch(() => {})
    return () => ctrl.abort()
  }, [match])

  useEffect(() => { setIndex(0) }, [docs])

  const placeCursor = (cursor) => {
    requestAnimationFrame(() => textareaRef.current?.setSelectionRange(cursor, cursor))
  }

  const insert = (doc) => {
    if (!match) return
    const { text: next, cursor } = applyHashtag(text, match.atIndex, match.query, doc.name)
    setText(next)
    setDismissed(true)
    placeCursor(cursor)
  }

  const move = (delta) => {
    if (!open) return false
    setIndex(i => Math.min(Math.max(i + delta, 0), docs.length - 1))
    return true
  }

  const pick = () => {
    if (!open) return false
    insert(docs[index])
    return true
  }

  const onKeyDown = (e) => {
    if (!open) return false
    if (e.key === 'ArrowDown') { e.preventDefault(); return move(1) }
    if (e.key === 'ArrowUp') { e.preventDefault(); return move(-1) }
    if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); return pick() }
    if (e.key === 'Escape') { setDismissed(true); return true }
    return false
  }

  return { match, docs, index, open, insert, onKeyDown }
}
