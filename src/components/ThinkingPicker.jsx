// ════════════════════════════════════════════════════════════════════
// ThinkingPicker — dropdown for selecting thinking/reasoning level
// ════════════════════════════════════════════════════════════════════
import { useState, useEffect, useRef } from 'react'
import { Brain } from 'lucide-react'
import { apiUrl } from '../lib/api'

export function ThinkingPicker({ thinkingLevel, sessionAlive }) {
  const [open, setOpen] = useState(false)
  const [levels, setLevels] = useState([])
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    fetch(apiUrl('/api/thinking-level'))
      .then(r => r.json())
      .then(data => {
        if (data?.available) setLevels(data.available)
      })
      .catch(() => {})
  }, [open])

  // Close on click outside
  useEffect(() => {
    if (!open) return
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const handleSelect = (level) => {
    fetch(apiUrl('/api/thinking-level'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ level }),
    }).then(() => setOpen(false))
  }

  // Don't show until we have a level
  if (!thinkingLevel) return null

  return (
    <div className="tp-wrapper" ref={ref}>
      <button
        className="tp-btn"
        onClick={() => setOpen(!open)}
        disabled={!sessionAlive}
        title="Thinking level"
      >
        <Brain size={14} />
        <span>{thinkingLevel}</span>
      </button>
      {open && (
        <div className="tp-dropdown">
          <div className="tp-label">Thinking Level</div>
          {levels.map(level => (
            <button
              key={level}
              className={`tp-option ${level === thinkingLevel ? 'active' : ''}`}
              onClick={() => handleSelect(level)}
            >
              <span className="tp-check">{level === thinkingLevel ? '✓' : ''}</span>
              <span>{level}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
