// ════════════════════════════════════════════════════════════════════
// ModelPicker — full-screen model selection overlay
// ════════════════════════════════════════════════════════════════════
import { useState, useEffect, useRef, useMemo } from 'react'
import { apiUrl } from '../lib/api'
import { useModal } from '../hooks/useModal'
import { useModels } from '../hooks/useModels'
import { MODEL_RENDER_CAP, withFavsFirst, isModelAllowed, setAllowedModels, getAllowedModels } from '../lib/models'
import { RefreshCw, Plus } from 'lucide-react'

export function ModelPicker({ activeModel, onSelect, onClose, onOpenSettings }) {
  const { visible: models, all, loading, favModels, refresh, reload } = useModels()
  const [allowed, setAllowedState] = useState(() => getAllowedModels())
  const [search, setSearch] = useState('')
  const [error, setError] = useState(null)
  const inputRef = useRef(null)
  const panelRef = useRef(null)

  useEffect(() => { inputRef.current?.focus() }, [])
  useModal(panelRef, { onClose })

  const ordered = useMemo(() => withFavsFirst(models, favModels), [models, favModels])
  const q = search.trim().toLowerCase()
  const filtered = q ? ordered.filter(m => m.includes(q)) : ordered
  const capped = filtered.slice(0, MODEL_RENDER_CAP)
  // Does the search match models that exist but are hidden by the user's
  // Settings allow-list? If so, the empty state points there instead of
  // claiming "no such model".
  const hiddenByAllowlist = q && filtered.length === 0 && all.some(m => m.toLowerCase().includes(q))

  // Minimal-edit enable (pi-web #930): versteckte Treffer bei aktiver Suche
  // direkt im Picker anbieten — dimmed, + schaltet frei. Kein Settings-Umweg.
  const hiddenMatches = q
    ? all.filter(m => !isModelAllowed(m, allowed) && m.toLowerCase().includes(q)).slice(0, 10)
    : []
  const enableModel = (m) => {
    const next = allowed ? [...allowed, m] : [m]
    setAllowedModels(next); setAllowedState(next); refresh()
  }

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
      <div className="model-picker" ref={panelRef} role="dialog" aria-modal="true" aria-label="Choose model" onClick={e => e.stopPropagation()}>
        <div className="mp-search">
          <div className="mp-search-row">
            <input
              ref={inputRef}
              value={search}
              onChange={e => setSearch(e.target.value)}
              aria-label="Search models"
              placeholder="Search models…"
            />
            <button className="mp-refresh" onClick={reload} disabled={loading} title="Refresh model catalog" aria-label="Refresh model catalog">
              <RefreshCw size={13} className={loading ? 'spin' : ''} />
            </button>
          </div>
        </div>
        <div className="mp-list">
          {error && <div className="mp-error">{error}</div>}
          {loading && <div style={{ padding: 16, color: '#666', textAlign: 'center' }}>Loading models…</div>}
          {!loading && filtered.length === 0 && (
            <div className="mp-empty">
              {hiddenByAllowlist ? (
                <>
                  <div className="mp-empty-main">No visible models match “{search}”.</div>
                  <div className="mp-empty-sub">Matches exist but are hidden by your <b>Settings → model allow-list</b>.</div>
                  {onOpenSettings && (
                    <button className="mp-empty-action" onClick={() => { onClose(); onOpenSettings() }}>Open settings</button>
                  )}
                </>
              ) : (
                <div className="mp-empty-main">No models match “{search}”.</div>
              )}
            </div>
          )}
          {capped.map(m => (
            <button key={m} className={`mp-model ${m === activeModel ? 'active' : ''}`}
              onClick={() => handleSelect(m)}>
              {m}
            </button>
          ))}
          {!loading && filtered.length > capped.length && (
            <div className="mp-hint">Showing {capped.length} of {filtered.length} — type to narrow.</div>
          )}
          {hiddenMatches.length > 0 && (
            <>
              <div className="mp-hidden-head">Hidden by your allow-list — + enables</div>
              {hiddenMatches.map(m => (
                <div key={m} className="mp-model mp-model--hidden" title={`${m} (hidden) — enable to pick it`}>
                  <span className="mp-hidden-name">{m}</span>
                  <button className="mp-enable" onClick={() => enableModel(m)} title={`Enable ${m}`} aria-label={`Enable ${m}`}><Plus size={12} /></button>
                </div>
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
