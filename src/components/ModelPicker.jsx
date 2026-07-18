// ════════════════════════════════════════════════════════════════════
// ModelPicker — full-screen model selection overlay
// ════════════════════════════════════════════════════════════════════
import { useState, useEffect, useRef } from 'react'
import { apiUrl } from '../lib/api'
import { flattenModels, isModelAllowed, getAllowedModels } from '../lib/models'

export function ModelPicker({ activeModel, onSelect, onClose }) {
  const [models, setModels] = useState([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const inputRef = useRef(null)

  useEffect(() => {
    inputRef.current?.focus()
    fetch(apiUrl('/api/models'))
      .then(r => r.json())
      .then(data => {
        const flat = flattenModels(data.providers)
        const allowed = getAllowedModels()
        setModels(flat.filter(m => isModelAllowed(m, allowed)))
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  const filtered = search
    ? models.filter(m => m.toLowerCase().includes(search.toLowerCase()))
    : models

  const handleSelect = (model) => {
    fetch(apiUrl('/api/model'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model }),
    }).then(() => {
      onSelect(model)
      onClose()
    })
  }

  return (
    <div className="model-picker-overlay" onClick={onClose}>
      <div className="model-picker" onClick={e => e.stopPropagation()}>
        <div className="mp-search">
          <input
            ref={inputRef}
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search models…"
          />
        </div>
        <div className="mp-list">
          {loading && <div style={{ padding: 16, color: '#666', textAlign: 'center' }}>Loading models…</div>}
          {!loading && filtered.length === 0 && <div style={{ padding: 16, color: '#555', textAlign: 'center' }}>No models found</div>}
          {filtered.map(m => (
            <button key={m} className={`mp-model ${m === activeModel ? 'active' : ''}`}
              onClick={() => handleSelect(m)}>
              {m}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
