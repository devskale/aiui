// ════════════════════════════════════════════════════════════════════
// ReleaseNotes — full-screen overlay showing the CHANGELOG.md
// Mounted at route 'releases' (#/releases). Markdown rendered with the
// same react-markdown + remark-gfm pipeline as chat entries.
// ════════════════════════════════════════════════════════════════════
import { useState, useEffect } from 'react'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { apiUrl } from '../lib/api'

const CLOSE_ICON = <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>

const mdComponents = {
  // Open links in a new tab.
  a: ({ href, children, ...props }) => (
    <a href={href} target="_blank" rel="noopener noreferrer" {...props}>{children}</a>
  ),
  // Style <h2> version headers as accent-colored cards.
  h2: ({ children }) => <h2 className="rn-version">{children}</h2>,
}

export function ReleaseNotes({ onClose }) {
  const [markdown, setMarkdown] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    fetch(apiUrl('/api/changelog'))
      .then(r => r.ok ? r.text() : Promise.reject(new Error(`HTTP ${r.status}`)))
      .then(text => { if (!cancelled) { setMarkdown(text); setLoading(false) } })
      .catch(err => { if (!cancelled) { setError(err.message); setLoading(false) } })
    return () => { cancelled = true }
  }, [])

  // Esc closes the overlay
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="rn-overlay" onClick={onClose}>
      <div className="rn-panel" onClick={e => e.stopPropagation()}>
        <header className="rn-header">
          <div className="rn-title">
            <span className="rn-logo">π</span>
            <span>Release Notes</span>
          </div>
          <button className="rn-close" onClick={onClose} title="Close (Esc)">{CLOSE_ICON}</button>
        </header>
        <div className="rn-content">
          {loading && <div className="rn-loading">Loading…</div>}
          {error && <div className="rn-error">⚠️ Failed to load changelog: {error}</div>}
          {!loading && !error && (
            <Markdown remarkPlugins={[remarkGfm]} components={mdComponents}>{markdown}</Markdown>
          )}
        </div>
        <footer className="rn-footer">
          <span>v{__APP_VERSION__}</span>
          <a href="https://github.com/devskale/aiui/blob/main/CHANGELOG.md" target="_blank" rel="noopener noreferrer">View on GitHub ↗</a>
        </footer>
      </div>
    </div>
  )
}
