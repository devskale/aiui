// ════════════════════════════════════════════════════════════════════
// Sidebar — new chat, sessions, skills/prompts/extensions
// ════════════════════════════════════════════════════════════════════
import { useState, useEffect, useMemo } from 'react'
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

// Build a parent→children tree from the flat session list. Sessions whose
// parent isn't in the list (deleted parent, or a root) become roots. Forks
// (G2) nest under their parent so the branch structure is visible.
function buildSessionTree(sessions) {
  const byPath = new Map(sessions.map(s => [s.path, s]))
  const childrenOf = new Map()
  const roots = []
  for (const s of sessions) {
    const parent = s.parent && byPath.has(s.parent) ? s.parent : null
    if (!parent) {
      roots.push(s)
    } else {
      if (!childrenOf.has(parent)) childrenOf.set(parent, [])
      childrenOf.get(parent).push(s)
    }
  }
  // Attach children arrays (sorted newest-first) onto each node.
  const attach = (s) => ({ ...s, children: (childrenOf.get(s.path) || []).sort((a, b) => new Date(b.modified) - new Date(a.modified)).map(attach) })
  return roots.map(attach)
}

export function Sidebar({ open, onToggle, connected, sessionAlive, sessionId, onNewChat, onSwitchSession, onShowReleaseNotes, onShowSettings, onShowFork, onShowFiles, onShowSkills, refreshTrigger }) {
  const [commands, setCommands] = useState(null)
  const [sessions, setSessions] = useState([])
  const [search, setSearch] = useState('')

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

  const filtered = search
    ? sessions.filter(s => (s.firstMessage || s.id || '').toLowerCase().includes(search.toLowerCase()))
    : null
  const tree = useMemo(() => search ? null : buildSessionTree(sessions), [sessions, search])

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
        {sessionAlive && (
          <button className="sb-nav-item" onClick={onShowFork} title="Branch from an earlier message">
            <span>⑃</span><span>Fork</span>
          </button>
        )}
        {sessionAlive && (
          <button className="sb-nav-item" onClick={onShowFiles} title="Browse workspace files">
            <span>📂</span><span>Files</span>
          </button>
        )}
      </nav>

      {/* Session list */}
      <div className="sb-section sb-sessions">
        <div className="sb-sessions-head">
          <span className="sb-label">Recent</span>
          <input
            className="sb-search"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search…"
            aria-label="Search sessions"
          />
        </div>
        <div className="sb-session-list">
          {!connected ? (
            <div className="connecting"><span className="thinking-dot" /><span>Connecting…</span></div>
          ) : search ? (
            filtered.length === 0 ? (
              <div className="connecting"><span className="thinking-dot" /><span>No matches</span></div>
            ) : filtered.map(s => (
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
          ) : tree.length === 0 ? (
            <div className="connecting"><span className="thinking-dot" /><span>No sessions</span></div>
          ) : tree.map(s => (
            <SessionNode key={s.id} node={s} sessionId={sessionId} onSwitchSession={onSwitchSession} depth={0} />
          ))}
        </div>
      </div>

      {/* Collapsible command groups */}
      <div className="sb-section">
        {groups.map(({ key, label }) => {
          const items = commands?.[key] || []
          if (items.length === 0) return null
          return (
            <CollapsibleGroup key={key} label={label} items={items} onBrowse={key === 'skills' ? onShowSkills : undefined} />
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

function CollapsibleGroup({ label, items, onBrowse }) {
  const [open, setOpen] = useState(false)

  return (
    <div className="sb-cmd-group">
      <button className="sb-cmd-toggle" onClick={() => setOpen(!open)}>
        <span className="sb-cmd-arrow">{open ? '▾' : '▸'}</span>
        <span className="sb-cmd-label">{label}</span>
        <span className="sb-cmd-count">{items.length}</span>
        {onBrowse && <span className="sb-cmd-browse" onClick={(e) => { e.stopPropagation(); onBrowse() }} title="Browse the skills catalog">⊕</span>}
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

// One node in the session tree. Forks render indented under their parent
// with a branch glyph so the conversation tree (G2) is visible at a glance.
function SessionNode({ node, sessionId, onSwitchSession, depth }) {
  const isChild = depth > 0
  return (
    <>
      <button
        className={`sb-session ${node.id === sessionId ? 'active' : ''} ${isChild ? 'sb-session--child' : ''}`}
        style={isChild ? { paddingLeft: `${12 + depth * 14}px` } : undefined}
        onClick={() => onSwitchSession?.(node.path)}
        title={node.firstMessage}
      >
        {isChild && <span className="sb-session-branch">↳</span>}
        <span className="sb-session-title">{node.firstMessage || 'New session'}</span>
        <span className="sb-session-meta">{timeAgo(node.modified)} · {node.messageCount} msgs</span>
      </button>
      {node.children?.map(c => (
        <SessionNode key={c.id} node={c} sessionId={sessionId} onSwitchSession={onSwitchSession} depth={depth + 1} />
      ))}
    </>
  )
}
