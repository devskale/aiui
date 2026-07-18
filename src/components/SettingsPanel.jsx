// ════════════════════════════════════════════════════════════════════
// SettingsPanel — model allow-list (picker visibility)
//
// Image capability is NOT configured here — it's a fact derived from each
// model's `input` array (models.json via /api/models). Only models that
// declare image input accept images. See App.jsx → imageCapable.
// ════════════════════════════════════════════════════════════════════
import { useState, useEffect } from 'react'
import { apiUrl } from '../lib/api'
import {
  flattenModels, groupModels, isModelAllowed,
  getAllowedModels, setAllowedModels,
  toggleModelInList, toggleProviderInList,
} from '../lib/models'

// Reusable provider→models checkbox tree. `selected` is null = "all on".
function ModelGrid({ allFlat, selected, onToggleModel, onToggleProvider }) {
  const grouped = groupModels(allFlat)
  return Object.entries(grouped).map(([provider, ids]) => {
    const allOn = ids.every(id => isModelAllowed(`${provider}@${id}`, selected))
    return (
      <div key={provider} className="sp-provider">
        <label className="sp-provider-toggle">
          <input type="checkbox" checked={allOn} onChange={() => onToggleProvider(provider, ids)} />
          <span>{provider}</span>
          <span className="sp-provider-count">{ids.length}</span>
        </label>
        <div className="sp-model-grid">
          {ids.map(id => {
            const full = `${provider}@${id}`
            const on = isModelAllowed(full, selected)
            return (
              <label key={full} className={`sp-model ${on ? 'on' : ''}`}>
                <input type="checkbox" checked={on} onChange={() => onToggleModel(full)} />
                <span>{id}</span>
              </label>
            )
          })}
        </div>
      </div>
    )
  })
}

export function SettingsPanel({ onClose }) {
  const [allFlat, setAllFlat] = useState([])
  const [allowed, setAllowed] = useState(null) // null = all allowed
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setAllowed(getAllowedModels())
    fetch(apiUrl('/api/models'))
      .then(r => r.json())
      .then(data => {
        setAllFlat(flattenModels(data.providers))
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  const toggleAllowed = (modelId) => {
    const next = toggleModelInList(modelId, allowed, allFlat)
    setAllowed(next); setAllowedModels(next)
  }
  const toggleAllowedProvider = (provider, ids) => {
    const next = toggleProviderInList(provider, ids, allowed, allFlat)
    setAllowed(next); setAllowedModels(next)
  }

  const allowedCount = (allowed || allFlat).length

  return (
    <div className="overlay" onClick={onClose}>
      <div className="settings-panel" onClick={e => e.stopPropagation()}>
        <header className="sp-header">
          <h2>Settings</h2>
          <button className="sp-close" onClick={onClose}>✕</button>
        </header>

        <div className="sp-body">
          <section className="sp-section">
            <div className="sp-section-head">
              <h3>Allowed Models</h3>
              <span className="sp-hint">{allowedCount} of {allFlat.length} shown in picker</span>
            </div>
            <p className="sp-help">
              Controls which models appear in the picker. Image support is
              automatic — only models that declare image input accept images.
            </p>
            <div className="sp-actions">
              <button className="sp-action-btn" onClick={() => { setAllowed(null); setAllowedModels(null) }}>All</button>
              <button className="sp-action-btn" onClick={() => { setAllowed([]); setAllowedModels([]) }}>None</button>
            </div>
            {loading && <div className="sp-loading">Loading models…</div>}
            {!loading && (
              <ModelGrid
                allFlat={allFlat}
                selected={allowed}
                onToggleModel={toggleAllowed}
                onToggleProvider={toggleAllowedProvider}
              />
            )}
          </section>
        </div>
      </div>
    </div>
  )
}
