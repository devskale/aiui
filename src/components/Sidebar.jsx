// ════════════════════════════════════════════════════════════════════
// Sidebar — new chat, model info, collapsible skills/prompts/extensions
// ════════════════════════════════════════════════════════════════════
import { useState, useEffect } from 'react'

export function Sidebar({ open, onToggle, model, streaming, connected }) {
  const [commands, setCommands] = useState(null)

  useEffect(() => {
    fetch('/api/commands')
      .then(r => r.json())
      .then(setCommands)
      .catch(() => {})
  }, [])

  const groups = [
    { key: 'skills', label: 'Skills', icon: '⚡' },
    { key: 'prompts', label: 'Prompts', icon: '📝' },
    { key: 'extensions', label: 'Extensions', icon: '🔌' },
  ]

  return (
    <aside className={`sidebar ${open ? '' : 'collapsed'}`}>
      <div className="sb-header">
        <div className="sb-brand">
          <span className="sb-logo">π</span>
          <span className="sb-title">πui</span>
        </div>
        <button className="sb-icon-btn" onClick={onToggle}>◀</button>
      </div>

      <nav className="sb-nav">
        <button className="sb-nav-item">
          <span>＋</span><span>New Chat</span>
        </button>
      </nav>

      {/* Collapsible command groups */}
      <div className="sb-section">
        {groups.map(({ key, label }) => {
          const items = commands?.[key] || []
          if (items.length === 0) return null
          return (
            <CollapsibleGroup key={key} label={label} items={items} />
          )
        })}
      </div>

      <div className="sb-section">
        <span className="sb-label">Recent</span>
      </div>

      <div className="sb-content">
        {!connected && (
          <div className="connecting">
            <span className="thinking-dot" />
            <span>Connecting...</span>
          </div>
        )}
      </div>

      <div className="sb-footer">
        <div className="sb-avatar">π</div>
        <span className="sb-model-name">{model || 'loading...'}</span>
      </div>
    </aside>
  )
}

function CollapsibleGroup({ label, items }) {
  const [open, setOpen] = useState(false)

  return (
    <div className="sb-cmd-group">
      <button className="sb-cmd-toggle" onClick={() => setOpen(!open)}>
        <span className="sb-cmd-arrow">{open ? '▾' : '▸'}</span>
        <span className="sb-cmd-label">{label}</span>
        <span className="sb-cmd-count">{items.length}</span>
      </button>
      {open && (
        <div className="sb-cmd-list">
          {items.map(item => (
            <div key={item.name} className="sb-cmd-item" title={item.description}>
              <span className="sb-cmd-item-name">{item.name}</span>
              {item.description && (
                <span className="sb-cmd-item-desc">
                  {item.description.length > 60
                    ? item.description.slice(0, 60) + '…'
                    : item.description}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
