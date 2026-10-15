// ════════════════════════════════════════════════════════════════════
// Sidebar — new chat, sessions, skills/prompts/extensions
// ════════════════════════════════════════════════════════════════════
import { useState, useEffect, useMemo, useRef } from 'react'
import { apiUrl } from '../lib/api'
import { Settings, SquarePen, GitFork, Folder, ChevronDown, ChevronRight, CornerDownRight, Search, PanelLeftClose, Keyboard, Pencil, Download, Trash2 } from 'lucide-react'

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

export function Sidebar({ open, onToggle, connected, sessionAlive, sessionId, onNewChat, onSwitchSession, onShowReleaseNotes, onShowSettings, onShowShortcuts, onShowFork, onShowFiles, onShowSkills, refreshTrigger }) {
  const [commands, setCommands] = useState(null)
  const [sessions, setSessions] = useState([])
  const [search, setSearch] = useState('')
  const [docRefresh, setDocRefresh] = useState(0) // rename/delete: Liste selbst nachladen
  const reloadSessions = () => setDocRefresh(n => n + 1)

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
  }, [refreshTrigger, docRefresh])

  const filtered = search
    ? sessions.filter(s => (s.firstMessage || s.id || '').toLowerCase().includes(search.toLowerCase()))
    : null
  const tree = useMemo(() => search ? null : buildSessionTree(sessions), [sessions, search])

  const groups = [
    { key: 'skills', label: 'Skills' },
    { key: 'prompts', label: 'Prompts' },
    { key: 'extensions', label: 'Extensions' },
  ]

  return (
    <aside className={`sidebar ${open ? '' : 'collapsed'}`}>
      <div className="sb-header">
        <div className="sb-brand">
          <div className="sb-logo">π</div>
          <span className="sb-title">ui</span>
        </div>
        <button className="sb-icon-btn" onClick={onToggle} title="Collapse sidebar" aria-label="Collapse sidebar"><PanelLeftClose size={16} /></button>
      </div>

      <nav className="sb-nav">
        <button className="sb-nav-item" onClick={onNewChat}>
          <SquarePen size={15} /><span>New Chat</span>
        </button>
        {sessionAlive && (
          <button className="sb-nav-item" onClick={onShowFork} title="Branch from an earlier message">
            <GitFork size={15} /><span>Fork</span>
          </button>
        )}
        {sessionAlive && (
          <button className="sb-nav-item" onClick={onShowFiles} title="Browse workspace files">
            <Folder size={15} /><span>Files</span>
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
              <SessionRow key={s.id} s={s} active={s.id === sessionId} onSwitchSession={onSwitchSession} onChanged={reloadSessions} />
            ))
          ) : tree.length === 0 ? (
            <div className="connecting"><span className="thinking-dot" /><span>No sessions</span></div>
          ) : tree.map(s => (
            <SessionNode key={s.id} node={s} sessionId={sessionId} onSwitchSession={onSwitchSession} onChanged={reloadSessions} depth={0} />
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
        {onShowShortcuts && (
          <button className="sb-settings-btn" onClick={onShowShortcuts} title="Keyboard shortcuts (?)" aria-label="Keyboard shortcuts">
            <Keyboard size={15} />
          </button>
        )}
        {onShowSettings && (
          <button className="sb-settings-btn" onClick={onShowSettings} title="Settings" aria-label="Settings">
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
    <div className="sb-cmd-row">
      <button className="sb-cmd-toggle" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span className="sb-cmd-arrow">{open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}</span>
        <span className="sb-cmd-label">{label}</span>
        <span className="sb-cmd-count">{items.length}</span>
      </button>
      {onBrowse && (
        <button className="sb-cmd-browse" onClick={onBrowse} title="Browse the skills catalog" aria-label="Browse the skills catalog">
          <Search size={12} />
        </button>
      )}
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
function SessionNode({ node, sessionId, onSwitchSession, onChanged, depth }) {
  return (
    <>
      <SessionRow s={node} active={node.id === sessionId} isChild={depth > 0} depth={depth}
        onSwitchSession={onSwitchSession} onChanged={onChanged} />
      {node.children?.map(c => (
        <SessionNode key={c.id} node={c} sessionId={sessionId} onSwitchSession={onSwitchSession} onChanged={onChanged} depth={depth + 1} />
      ))}
    </>
  )
}

// Session-Zeile mit Doc-Mgmt-Aktionen (Issue session-doc-mgmt): rename
// (inline), export (Download), delete (zweistufig). Row ist ein div
// role=button, damit die Action-Buttons echte <button>s bleiben können
// (keine verschachtelten Buttons). Titel: name || firstMessage.
function SessionRow({ s, active, isChild = false, depth = 0, onSwitchSession, onChanged }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [armed, setArmed] = useState(false)
  const [busy, setBusy] = useState(false)
  const inputRef = useRef(null)

  useEffect(() => { if (editing) inputRef.current?.focus() }, [editing])
  useEffect(() => { // Armierung verfällt nach 2.5s
    if (!armed) return
    const t = setTimeout(() => setArmed(false), 2500)
    return () => clearTimeout(t)
  }, [armed])

  const title = s.name || s.firstMessage || 'New session'

  const saveRename = async () => {
    const name = draft.trim()
    setEditing(false)
    if (name === (s.name || '') || !name) return
    setBusy(true)
    try {
      await fetch(apiUrl('/api/session/rename'), {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: s.path, name }),
      })
      onChanged?.()
    } finally { setBusy(false) }
  }

  const doDelete = async () => {
    if (!armed) { setArmed(true); return } // erster Klick: nur armieren
    setBusy(true)
    try {
      await fetch(apiUrl('/api/session/delete'), {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: s.path }),
      })
      onChanged?.()
    } finally { setArmed(false); setBusy(false) }
  }

  if (editing) {
    return (
      <div className={`sb-session sb-session--editing ${active ? 'active' : ''}`}>
        <input
          ref={inputRef}
          className="sb-rename-input"
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') { e.preventDefault(); saveRename() }
            if (e.key === 'Escape') { e.preventDefault(); setEditing(false) }
          }}
          onBlur={saveRename}
          aria-label="Session name"
          maxLength={120}
        />
      </div>
    )
  }

  return (
    <div
      className={`sb-session ${active ? 'active' : ''} ${isChild ? 'sb-session--child' : ''}`}
      style={isChild ? { paddingLeft: `${12 + depth * 14}px` } : undefined}
      role="button"
      tabIndex={0}
      onClick={() => !busy && onSwitchSession?.(s.path)}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSwitchSession?.(s.path) } }}
      title={s.name || s.firstMessage}
    >
      {isChild && <span className="sb-session-branch"><CornerDownRight size={11} /></span>}
      <span className="sb-session-title">{title}</span>
      <span className="sb-session-actions">
        <button className="sb-doc-btn" disabled={busy} title="Rename" aria-label={`Rename ${title}`}
          onClick={e => { e.stopPropagation(); setDraft(s.name || ''); setEditing(true) }}>
          <Pencil size={11} />
        </button>
        <button className="sb-doc-btn" disabled={busy} title="Export as Markdown" aria-label={`Export ${title}`}
          onClick={e => { e.stopPropagation(); window.open(apiUrl(`/api/session/export?path=${encodeURIComponent(s.path)}`), '_blank') }}>
          <Download size={11} />
        </button>
        {!active && (
          <button className={`sb-doc-btn sb-doc-btn--del ${armed ? 'armed' : ''}`} disabled={busy}
            title={armed ? 'Click again to delete' : 'Delete'} aria-label={`Delete ${title}`}
            onClick={e => { e.stopPropagation(); doDelete() }}>
            <Trash2 size={11} />
          </button>
        )}
        {armed && <span className="sb-del-hint">sure?</span>}
      </span>
      <span className="sb-session-meta">{timeAgo(s.modified)} · {s.messageCount} msgs</span>
    </div>
  )
}
