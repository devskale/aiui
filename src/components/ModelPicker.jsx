import { useState, useEffect, useRef } from 'react'
import { Icons } from '../lib/icons'

// ════════════════════════════════════════════════════════════════════
// MODEL PICKER
// ════════════════════════════════════════════════════════════════════
export function ModelPicker({ models, activeModel, onSelect }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  if (!models.length) return null

  return (
    <div className="model-picker" ref={ref}>
      <button className="mp-trigger" onClick={() => setOpen(!open)}>
        <span className="mp-name">{activeModel}</span><Icons.chevronDown />
      </button>
      {open && (
        <div className="mp-dropdown">
          {models.map(m => (
            <button key={m} className={`mp-option ${m === activeModel ? 'active' : ''}`}
              onClick={() => { onSelect(m); setOpen(false) }}>{m}</button>
          ))}
        </div>
      )}
    </div>
  )
}
