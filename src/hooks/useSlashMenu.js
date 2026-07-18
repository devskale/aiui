// ════════════════════════════════════════════════════════════════════
// useSlashMenu — the slash-command autocomplete state machine
//
// Functions over the composer's (text, setText, textareaRef). Owns index +
// dismissed state, fetches /api/commands, builds items, does the fill
// insertion; host-action items (compact/new/model) are routed to onHostAction.
// Pure trigger/insert math lives in ../lib/compose.js.
// ════════════════════════════════════════════════════════════════════
import { useState, useEffect, useMemo } from 'react'
import { apiUrl } from '../lib/api'
import { detectSlashTrigger, buildSlashItems, applyCommand } from '../lib/compose'

export function useSlashMenu({ text, setText, textareaRef, onHostAction }) {
  const [commands, setCommands] = useState({ skills: [], prompts: [], extensions: [] })
  const [index, setIndex] = useState(0)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    fetch(apiUrl('/api/commands'))
      .then(r => r.json())
      .then(d => setCommands({ skills: d?.skills || [], prompts: d?.prompts || [], extensions: d?.extensions || [] }))
      .catch(() => {})
  }, [])

  const match = useMemo(() => (dismissed ? null : detectSlashTrigger(text)), [text, dismissed])
  const items = useMemo(() => (match ? buildSlashItems(match.query, commands) : []), [match, commands])
  const open = items.length > 0

  useEffect(() => { setIndex(0) }, [items])
  useEffect(() => { setDismissed(false) }, [text])

  const placeCursor = (cursor) => {
    requestAnimationFrame(() => textareaRef.current?.setSelectionRange(cursor, cursor))
  }

  const apply = (item) => {
    if (!match) return
    if (item.run === 'fill') {
      const { text: next, cursor } = applyCommand(text, match.start, match.query, item.command)
      setText(next)
      placeCursor(cursor)
    } else {
      setText('')
      onHostAction?.(item)
    }
    setDismissed(true)
  }

  // Handle this menu's keys. Returns true if it consumed the event.
  const onKeyDown = (e) => {
    if (!open) return false
    if (e.key === 'ArrowDown') { e.preventDefault(); setIndex(i => Math.min(i + 1, items.length - 1)); return true }
    if (e.key === 'ArrowUp') { e.preventDefault(); setIndex(i => Math.max(i - 1, 0)); return true }
    if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey)) { e.preventDefault(); apply(items[index]); return true }
    if (e.key === 'Escape') { e.preventDefault(); setDismissed(true); return true }
    return false
  }

  return { items, index, open, apply, onKeyDown, skills: commands.skills }
}
