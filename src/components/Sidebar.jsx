// ════════════════════════════════════════════════════════════════════
// Sidebar — new chat, sessions, skills/prompts/extensions
// ════════════════════════════════════════════════════════════════════
import { useState, useEffect } from 'react'
import { apiUrl } from '../lib/api'
import { Settings } from 'lucide-react'

function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'now'
  if (mins < 60) return `${mins}m`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.floor(hours / 24)
  return `${days}d`
}

export function Sidebar({ open, onToggle, connected, sessionAlive, sessionId, onNewChat, onSwitchSession, onShowReleaseNotes, onShowSettings, refreshTrigger }) {
  const [commands, setCommands] = useState(null)
  const [sessions, setSessions] = useState([])

  useEffect(() => {
    fetch(apiUrl('/api/commands'))
      .then(r => r.json())
      .then(setCommands)
      .catch(() => {})
  }, [])

  useEffect(() => {
    fetch(apiUrl('/api/sessions'))
      .then(r => r.json())
      .then(setSessions)
      .catch(() => {})
  }, [refreshTrigger])

  const groups = [
    { key: 'skills', label: 'Skills', icon: '⚡' },
    { key: 'prompts', label: 'Prompts', icon: '📝' },
    { key: 'extensions', label: 'Extensions', icon: '🔌' },
  ]

  return (
    <aside className={`sidebar ${open ? '' : 'collapsed'}`}>
      <div className="sb-header">
        <div className="sb-brand">
          <div className="sb-logo">π</div>
          <span className="sb-title">ui</span>
        </div>
        <button className="sb-icon-btn" onClick={onToggle}>◀</button>
      </div>

      <nav className="sb-nav">
        <button className="sb-nav-item" onClick={onNewChat}>
          <span>＋</span><span>New Chat</span>
        </button>
      </nav>

      {/* Session list */}
      <div className="sb-section sb-sessions">
        <span className="sb-label">Recent</span>
        <div className="sb-session-list">
          {!connected ? (
            <div className="connecting"><span className="thinking-dot" /><span>Connecting…</span></div>
          ) : sessions.length === 0 ? (
            <div className="connecting"><span className="thinking-dot" /><span>No sessions</span></div>
          ) : (
            sessions.map(s => (
              <button
                key={s.id}
                className={`sb-session ${s.id === sessionId ? 'active' : ''}`}
                onClick={() => onSwitchSession?.(s.path)}
                title={s.firstMessage}
              >
                <span className="sb-session-title">{s.firstMessage || 'New session'}</span>
                <span className="sb-session-meta">{timeAgo(s.modified)} · {s.messageCount} msgs</span>
              </button>
            ))
          )}
        </div>
      </div>

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

      <div className="sb-footer">
        {onShowSettings && (
          <button className="sb-settings-btn" onClick={onShowSettings} title="Settings">
            <Settings size={16} />
          </button>
        )}
        <button className="sb-version" onClick={onShowReleaseNotes} title="Release notes">v{__APP_VERSION__}</button>
        <span className="sb-footer-link"><a href="https://skale.dev" target="_blank" rel="noopener">by skale.dev</a></span>
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
