// ════════════════════════════════════════════════════════════════════
// SettingsPanel — model allow-list + future settings
// ════════════════════════════════════════════════════════════════════
import { useState, useEffect } from 'react'
import { apiUrl } from '../lib/api'
import { flattenModels, groupModels, getAllowedModels, setAllowedModels, isModelAllowed } from '../lib/models'

export function SettingsPanel({ onClose }) {
  const [allFlat, setAllFlat] = useState([])
  const [allowed, setAllowed] = useState(null) // null = all allowed
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setAllowed(getAllowedModels())
    fetch(apiUrl('/api/models'))
      .then(r => r.json())
      .then(data => {
        setAllFlat(flattenModels(data))
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  const toggle = (modelId) => {
    const current = allowed || allFlat // if null (all), start from full list
    const next = current.includes(modelId)
      ? current.filter(m => m !== modelId)
      : [...current, modelId]
    setAllowed(next)
    setAllowedModels(next)
  }

  const selectAll = () => { setAllowed(null); setAllowedModels(null) }
  const selectNone = () => { setAllowed([]); setAllowedModels([]) }
  const toggleProvider = (provider, ids) => {
    const current = allowed || allFlat
    const allOn = ids.every(id => isModelAllowed(`${provider}@${id}`, current))
    let next
    if (allOn) {
      next = current.filter(m => !ids.some(id => m === `${provider}@${id}`))
    } else {
      next = [...new Set([...current, ...ids.map(id => `${provider}@${id}`)])]
    }
    setAllowed(next.length === allFlat.length ? null : next)
    setAllowedModels(next.length === allFlat.length ? null : next)
  }

  const grouped = groupModels(allFlat)
  const effectiveAllowed = allowed || allFlat
  const allowedCount = effectiveAllowed.length

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
            <div className="sp-actions">
              <button className="sp-action-btn" onClick={selectAll}>All</button>
              <button className="sp-action-btn" onClick={selectNone}>None</button>
            </div>

            {loading && <div className="sp-loading">Loading models…</div>}

            {!loading && Object.entries(grouped).map(([provider, ids]) => {
              const allOn = ids.every(id => isModelAllowed(`${provider}@${id}`, effectiveAllowed))
              return (
                <div key={provider} className="sp-provider">
                  <label className="sp-provider-toggle">
                    <input type="checkbox" checked={allOn} onChange={() => toggleProvider(provider, ids)} />
                    <span>{provider}</span>
                    <span className="sp-provider-count">{ids.length}</span>
                  </label>
                  <div className="sp-model-grid">
                    {ids.map(id => {
                      const full = `${provider}@${id}`
                      return (
                        <label key={full} className={`sp-model ${isModelAllowed(full, effectiveAllowed) ? 'on' : ''}`}>
                          <input
                            type="checkbox"
                            checked={isModelAllowed(full, effectiveAllowed)}
                            onChange={() => toggle(full)}
                          />
                          <span>{id}</span>
                        </label>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </section>
        </div>
      </div>
    </div>
  )
}
