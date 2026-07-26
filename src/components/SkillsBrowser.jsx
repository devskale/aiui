// ════════════════════════════════════════════════════════════════════
// SkillsBrowser — search the public skills.sh catalog (W6).
//
// Discovery only: see what skills exist and whether you already have one
// enabled. aiui's entitlement is default-deny + admin-curated (ADR-0001), so
// this panel intentionally cannot install — enabling stays out of band.
// ════════════════════════════════════════════════════════════════════
import { useState, useEffect, useRef } from 'react'
import { apiUrl } from '../lib/api'

function fmtInstalls(n) {
  if (!n) return ''
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`
  if (n >= 1_000) return `${Math.round(n / 1000)}K`
  return `${n}`
}

export function SkillsBrowser({ onClose }) {
  const [q, setQ] = useState('')
  const [data, setData] = useState(null)   // { results } | { error } | null
  const [enabled, setEnabled] = useState([]) // names the user already has
  const inputRef = useRef(null)
  const debounceRef = useRef(null)

  // enabled set, for the "enabled" badge
  useEffect(() => {
    fetch(apiUrl('/api/commands')).then(r => r.json()).then(c => {
      setEnabled((c?.skills || []).map(s => s.name))
    }).catch(() => {})
  }, [])

  useEffect(() => { inputRef.current?.focus() }, [])

  const runSearch = (query) => {
    if (!query.trim()) { setData(null); return }
    fetch(apiUrl(`/api/skills/search?q=${encodeURIComponent(query.trim())}`))
      .then(r => r.json())
      .then(setData)
      .catch(() => setData({ error: 'search failed' }))
  }

  const onChange = (val) => {
    setQ(val)
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => runSearch(val), 300)
  }

  const results = data?.results || []

  return (
    <div className="overlay" onClick={onClose}>
      <div className="skills-browser" onClick={e => e.stopPropagation()}>
        <header className="fe-header">
          <h2>Skills catalog</h2>
          <input
            ref={inputRef}
            className="sb-search fe-search"
            value={q}
            onChange={e => onChange(e.target.value)}
            placeholder="Search skills.sh…"
          />
          <button className="sp-close" onClick={onClose}>✕</button>
        </header>

        <div className="fe-body">
          {!q.trim() && (
            <div className="fe-empty">
              Search the public catalog. Enabling a skill is admin-curated — ask to have one added to your workspace.
            </div>
          )}
          {q.trim() && data === null && <div className="fe-empty">Searching…</div>}
          {q.trim() && data?.error && <div className="fe-empty">{data.error} — check your connection.</div>}
          {q.trim() && results.length === 0 && !data?.error && <div className="fe-empty">No results.</div>}
          {results.length > 0 && (
            <ul className="sk-list">
              {results.map(r => {
                const isEnabled = enabled.includes(r.name)
                return (
                  <li key={r.package} className="sk-item">
                    <div className="sk-item-main">
                      <span className="sk-name">{r.name}</span>
                      {isEnabled && <span className="sk-badge">enabled</span>}
                      <span className="sk-pkg">{r.package}</span>
                    </div>
                    <div className="sk-item-meta">
                      {r.installs > 0 && <span>{fmtInstalls(r.installs)} installs</span>}
                      {r.url && <a className="sk-link" href={r.url} target="_blank" rel="noreferrer">view ↗</a>}
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
