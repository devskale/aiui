import { useState, useEffect, useRef } from 'react'
import { RefreshCw } from 'lucide-react'
import { Icons } from '../lib/icons'

export function ModelPicker({ models, activeModel, onSelect, account }) {
  const [open, setOpen] = useState(false)
  const [fetched, setFetched] = useState([])
  const [loading, setLoading] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const fetchModels = async () => {
    if (!account?.baseUrl) return
    setLoading(true)
    try {
      const params = new URLSearchParams({ base_url: account.baseUrl, api_key: account.apiKey || '' })
      const res = await fetch(`/api/models?${params}`)
      if (res.ok) {
        const data = await res.json()
        if (data.models?.length) setFetched(data.models)
      }
    } catch { /* ignore */ }
    setLoading(false)
  }

  // Use fetched models if available, else configured models
  const allModels = fetched.length ? fetched : models
  if (!allModels.length) return null

  return (
    <div className="model-picker" ref={ref}>
      <button className="mp-trigger" onClick={() => setOpen(!open)}>
        <span className="mp-name">{activeModel}</span><Icons.chevronDown />
      </button>
      {open && (
        <div className="mp-dropdown">
          {allModels.map(m => (
            <button key={m} className={`mp-option ${m === activeModel ? 'active' : ''}`}
              onClick={() => { onSelect(m); setOpen(false) }}>{m}</button>
          ))}
          <button className="mp-fetch" onClick={fetchModels} disabled={loading}>
            <RefreshCw size={12} className={loading ? 'spinning' : ''} />
            {loading ? 'Fetching...' : 'Fetch from API'}
          </button>
        </div>
      )}
    </div>
  )
}
