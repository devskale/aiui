// ════════════════════════════════════════════════════════════════════
// ForkPicker — pick a user message to branch the conversation from.
// Forking creates a new session file that starts at that point (SDK
// runtime.fork); the server then pushes the forked branch's history.
// ════════════════════════════════════════════════════════════════════
import { useState, useEffect, useRef } from 'react'
import { apiUrl } from '../lib/api'

export function ForkPicker({ onClose }) {
  const [targets, setTargets] = useState(null) // null = loading, [] = none
  const [pending, setPending] = useState(null) // entryId being forked
  const listRef = useRef(null)

  useEffect(() => {
    let alive = true
    fetch(apiUrl('/api/fork-targets'))
      .then(r => r.json())
      .then(t => { if (alive) setTargets(Array.isArray(t) ? t : []) })
      .catch(() => { if (alive) setTargets([]) })
    return () => { alive = false }
  }, [])

  const handleFork = async (entryId) => {
    setPending(entryId)
    try {
      await fetch(apiUrl('/api/fork'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entryId }),
      })
      onClose()
    } catch {
      setPending(null)
    }
  }

  // Newest fork point first (you usually branch from a recent message).
  const ordered = targets ? [...targets].reverse() : []

  return (
    <div className="model-picker-overlay" onClick={onClose}>
      <div className="model-picker" onClick={e => e.stopPropagation()}>
        <div className="mp-search fork-head">
          <span className="fork-title">Branch from a message</span>
          <span className="fork-sub">Creates a new session starting at that point.</span>
        </div>
        <div className="mp-list" ref={listRef}>
          {targets === null && <div style={{ padding: 16, color: '#666', textAlign: 'center' }}>Loading…</div>}
          {targets !== null && ordered.length === 0 && (
            <div style={{ padding: 16, color: '#555', textAlign: 'center' }}>No messages to branch from yet.</div>
          )}
          {ordered.map((t, i) => (
            <button
              key={t.entryId}
              className={`mp-model fork-target ${pending === t.entryId ? 'active' : ''}`}
              disabled={pending !== null}
              onClick={() => handleFork(t.entryId)}
            >
              <span className="fork-target-text">{t.text || '(empty message)'}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
