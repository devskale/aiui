// ════════════════════════════════════════════════════════════════════
// ModelPicker — full-screen model selection overlay
// ════════════════════════════════════════════════════════════════════
import { useState, useEffect, useRef } from 'react'
import { apiUrl } from '../lib/api'

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
        // Flatten to "provider@id" and keep only ids starting with "tu@"
        const flat = []
        const push = (provider, m) => {
          const id = typeof m === 'string' ? m : (m.id || m.name)
          if (id) flat.push(provider ? `${provider}@${id}` : id)
        }
        if (Array.isArray(data)) {
          data.forEach(m => push(null, m))
        } else if (typeof data === 'object') {
          for (const [provider, list] of Object.entries(data)) {
            if (Array.isArray(list)) list.forEach(m => push(provider, m))
          }
        }
        setModels(flat.filter(m => m.startsWith('tu@')))
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
