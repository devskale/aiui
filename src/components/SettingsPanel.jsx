// ════════════════════════════════════════════════════════════════════
// SettingsPanel — model allow-list (picker visibility)
//
// The catalog can hold 1000+ models across ~40 providers, so this never
// renders the whole thing:
//   • browse mode (no search) — providers are collapsed accordions; only the
//     expanded one renders its models.
//   • search mode — a flat, capped list of matches.
// Image capability is NOT configured here — it's a fact derived from each
// model's `input` array. See App.jsx → imageCapable.
// ════════════════════════════════════════════════════════════════════
import { useState, useEffect } from 'react'
import { useModels } from '../hooks/useModels'
import {
  MODEL_RENDER_CAP, groupModels, isModelAllowed,
  getAllowedModels, setAllowedModels,
  toggleModelInList, toggleProviderInList,
  setFavModels, toggleFav,
} from '../lib/models'

export function SettingsPanel({ onClose }) {
  const { all: allFlat, loading, refresh, favModels } = useModels()
  const [allowed, setAllowed] = useState(null)      // null = all allowed
  const [search, setSearch] = useState('')
  const [favSearch, setFavSearch] = useState('')
  const [expanded, setExpanded] = useState(() => new Set())  // expanded provider names

  useEffect(() => { setAllowed(getAllowedModels()) }, [])

  const toggleAllowed = (modelId) => {
    const next = toggleModelInList(modelId, allowed, allFlat)
    setAllowed(next); setAllowedModels(next); refresh()
  }
  const toggleAllowedProvider = (provider, ids) => {
    const next = toggleProviderInList(provider, ids, allowed, allFlat)
    setAllowed(next); setAllowedModels(next); refresh()
  }
  const toggleExpand = (provider) => {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(provider)) next.delete(provider)
      else next.add(provider)
      return next
    })
  }

  const allowedCount = (allowed || allFlat).length
  const q = search.trim().toLowerCase()
  const searching = q.length > 0

  // Search mode: flat, capped matches.
  const matches = searching ? allFlat.filter(m => m.toLowerCase().includes(q)) : []
  const matchCapped = matches.slice(0, MODEL_RENDER_CAP)

  // Browse mode: grouped providers (rendered as collapsed accordions).
  const grouped = searching ? {} : groupModels(allFlat)

  // Favorites add-box matches (models not already favorited).
  const favQuery = favSearch.trim().toLowerCase()
  const favMatches = favQuery
    ? allFlat.filter(m => m.toLowerCase().includes(favQuery) && !favModels.includes(m)).slice(0, MODEL_RENDER_CAP)
    : []

  return (
    <div className="overlay" onClick={onClose}>
      <div className="settings-panel" onClick={e => e.stopPropagation()}>
        <header className="sp-header">
          <h2>Settings</h2>
          <button className="sp-close" onClick={onClose}>✕</button>
        </header>

        <div className="sp-body">
          {/* ── Favorite models (preferred in the picker) ── */}
          <section className="sp-section">
            <div className="sp-section-head">
              <h3>Favorite Models</h3>
              <span className="sp-hint">{favModels.length} pinned — shown first in the picker</span>
            </div>
            <p className="sp-help">
              Favorites sort to the top of the model picker, and the first favorite is selected by default.
            </p>
            <input
              className="sp-search"
              value={favSearch}
              onChange={e => setFavSearch(e.target.value)}
              placeholder="Search to add a favorite…"
            />
            {favMatches.length > 0 && (
              <div className="sp-fav-matches">
                {favMatches.map(m => (
                  <button
                    key={m}
                    className="sp-fav-add"
                    onClick={() => { setFavModels(toggleFav(m, favModels)); setFavSearch(''); refresh() }}
                  >
                    + {m}
                  </button>
                ))}
              </div>
            )}
            {favModels.length > 0 ? (
              <div className="sp-fav-chips">
                {favModels.map(m => (
                  <span key={m} className="sp-fav-chip">
                    <span className="sp-fav-star">★</span>{m}
                    <button className="sp-fav-remove" onClick={() => { setFavModels(toggleFav(m, favModels)); refresh() }} title="Remove">×</button>
                  </span>
                ))}
              </div>
            ) : (
              <div className="sp-loading">No favorites yet.</div>
            )}
          </section>

          {/* ── Allowed models (picker visibility) ── */}
          <section className="sp-section">
            <div className="sp-section-head">
              <h3>Allowed Models</h3>
              <span className="sp-hint">{allowedCount} of {allFlat.length} shown in picker</span>
            </div>
            <p className="sp-help">
              Controls which models appear in the picker. Image support is
              automatic — only models that declare image input accept images.
            </p>
            <input
              className="sp-search"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search models to toggle…"
            />
            <div className="sp-actions">
              <button className="sp-action-btn" onClick={() => { setAllowed(null); setAllowedModels(null); refresh() }}>All</button>
              <button className="sp-action-btn" onClick={() => { setAllowed([]); setAllowedModels([]); refresh() }}>None</button>
            </div>

            {loading && <div className="sp-loading">Loading models…</div>}

            {/* Search mode: flat capped matches */}
            {!loading && searching && (
              <div className="sp-search-results">
                {matchCapped.length === 0 && (
                  <div className="sp-loading">No models match “{search}”.</div>
                )}
                {matchCapped.map(full => {
                  const on = isModelAllowed(full, allowed)
                  return (
                    <label key={full} className={`sp-model ${on ? 'on' : ''}`}>
                      <input type="checkbox" checked={on} onChange={() => toggleAllowed(full)} />
                      <span>{full}</span>
                    </label>
                  )
                })}
                {matches.length > matchCapped.length && (
                  <div className="sp-hint">Showing {matchCapped.length} of {matches.length} — narrow your search.</div>
                )}
              </div>
            )}

            {/* Browse mode: collapsed provider accordions */}
            {!loading && !searching && Object.entries(grouped).map(([provider, ids]) => {
              const allOn = ids.every(id => isModelAllowed(`${provider}@${id}`, allowed))
              const isOpen = expanded.has(provider)
              return (
                <div key={provider} className="sp-provider">
                  <div className="sp-provider-row">
                    <label className="sp-provider-toggle">
                      <input type="checkbox" checked={allOn} onChange={() => toggleAllowedProvider(provider, ids)} />
                      <span>{provider}</span>
                      <span className="sp-provider-count">{ids.length}</span>
                    </label>
                    <button className="sp-provider-expand" onClick={() => toggleExpand(provider)} title={isOpen ? 'Collapse' : 'Expand'}>
                      {isOpen ? '▾' : '▸'}
                    </button>
                  </div>
                  {isOpen && (
                    <div className="sp-model-grid">
                      {ids.map(id => {
                        const full = `${provider}@${id}`
                        const on = isModelAllowed(full, allowed)
                        return (
                          <label key={full} className={`sp-model ${on ? 'on' : ''}`}>
                            <input type="checkbox" checked={on} onChange={() => toggleAllowed(full)} />
                            <span>{id}</span>
                          </label>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })}
          </section>
        </div>
      </div>
    </div>
  )
}
