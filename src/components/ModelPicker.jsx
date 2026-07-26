// ════════════════════════════════════════════════════════════════════
// ModelPicker — full-screen model selection overlay
// ════════════════════════════════════════════════════════════════════
import { useState, useEffect, useRef, useMemo } from 'react'
import { apiUrl } from '../lib/api'
import { useModels } from '../hooks/useModels'
import { MODEL_RENDER_CAP, withFavsFirst } from '../lib/models'

export function ModelPicker({ activeModel, onSelect, onClose }) {
  const { visible: models, loading, favModels } = useModels()
  const [search, setSearch] = useState('')
  const [error, setError] = useState(null)
  const inputRef = useRef(null)

  useEffect(() => { inputRef.current?.focus() }, [])

  const ordered = useMemo(() => withFavsFirst(models, favModels), [models, favModels])
  const filtered = search
    ? ordered.filter(m => m.toLowerCase().includes(search.toLowerCase()))
    : ordered
  const capped = filtered.slice(0, MODEL_RENDER_CAP)

  const handleSelect = (model) => {
    fetch(apiUrl('/api/model'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model }),
    }).then(async (r) => {
      if (!r.ok) {
        const j = await r.json().catch(() => ({}))
        setError(j.error || `HTTP ${r.status}`)
        return
      }
      setError(null)
      onSelect(model)
      onClose()
    }).catch(() => setError('network error'))
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
          {error && <div className="mp-error">{error}</div>}
          {loading && <div style={{ padding: 16, color: '#666', textAlign: 'center' }}>Loading models…</div>}
          {!loading && filtered.length === 0 && <div style={{ padding: 16, color: '#555', textAlign: 'center' }}>No models found</div>}
          {capped.map(m => (
            <button key={m} className={`mp-model ${m === activeModel ? 'active' : ''}`}
              onClick={() => handleSelect(m)}>
              {m}
            </button>
          ))}
          {!loading && filtered.length > capped.length && (
            <div className="mp-hint">Showing {capped.length} of {filtered.length} — type to narrow.</div>
          )}
        </div>
      </div>
    </div>
  )
}
