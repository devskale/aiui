import { useState } from 'react'
import { Icons } from '../lib/icons'
import { apiGet } from '../lib/api'
import { FolderExpansion } from './FolderExpansion'

// Strip leading emoji from folder names stored in DB (e.g. "📚 Library" → "Library")
const stripEmoji = (s) => s.replace(/^[\p{Emoji_Presentation}\p{Extended_Pictographic}\s]+/u, '').trim()

// ════════════════════════════════════════════════════════════════════
// SIDEBAR
// ════════════════════════════════════════════════════════════════════
export function Sidebar({ open, onToggle, chats, activeChatId, onSelectChat,
  onNewChat, onDeleteChat, account, onOpenSettings, folders, onFoldersChange, onInsertFile }) {
  const [showFolders, setShowFolders] = useState(false)
  const [expandedFolderId, setExpandedFolderId] = useState(null)
  const [folderFiles, setFolderFiles] = useState([])
  const [newFolderName, setNewFolderName] = useState('')
  const [editingFolderId, setEditingFolderId] = useState(null)
  const [editFolderName, setEditFolderName] = useState('')

  // ─── Data helpers ───
  const loadFolders = async () => {
    try { onFoldersChange(await apiGet('/folders')) } catch { /* ignore */ }
  }

  // Refresh expanded file list + folder counts (called by FolderExpansion after mutations)
  const refreshAll = async () => {
    const fid = expandedFolderId
    try {
      const data = await apiGet(fid ? `/library?folder_id=${fid}` : '/library')
      setFolderFiles(data.files || [])
    } catch { setFolderFiles([]) }
    await loadFolders()
  }

  const toggleFolder = async (folder) => {
    if (expandedFolderId === folder.id) { setExpandedFolderId(null); return }
    setExpandedFolderId(folder.id)
    try {
      const data = await apiGet(`/library?folder_id=${folder.id}`)
      setFolderFiles(data.files || [])
    } catch { setFolderFiles([]) }
  }

  const handleAddFolder = async () => {
    const name = newFolderName.trim() || 'New Folder'
    try {
      const res = await fetch('/api/folders', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }),
      })
      if (res.ok) { setNewFolderName(''); loadFolders() }
    } catch { /* ignore */ }
  }

  const handleRenameFolder = async (id) => {
    if (!editFolderName.trim()) return
    try {
      await fetch(`/api/folders/${id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: stripEmoji(editFolderName.trim()) }),
      })
      setEditingFolderId(null); loadFolders()
    } catch { /* ignore */ }
  }

  const handleDeleteFolder = async (id) => {
    if (!confirm('Delete this folder? Files will become unsorted.')) return
    try {
      await fetch(`/api/folders/${id}`, { method: 'DELETE' })
      loadFolders(); if (expandedFolderId === id) setExpandedFolderId(null)
    } catch { /* ignore */ }
  }

  const uploadToFolder = async (folderId, e) => {
    const fileList = e.target.files
    if (!fileList.length) return
    const url = folderId ? `/api/upload?folder_id=${folderId}` : '/api/upload'
    for (const file of Array.from(fileList)) {
      const fd = new FormData(); fd.append('file', file)
      await fetch(url, { method: 'POST', body: fd })
    }
    e.target.value = ''
    await refreshAll()
  }

  // ─── Group chats by date ───
  const now = Date.now()
  const msDay = 86400000
  const todayChats = [], yesterdayChats = [], earlierChats = []
  chats.forEach(c => {
    const diff = now - (c.created_at || 0) * 1000
    if (diff < msDay) todayChats.push(c)
    else if (diff < msDay * 2) yesterdayChats.push(c)
    else earlierChats.push(c)
  })

  const renderChatGroup = (label, items) => items.length > 0 && (
    <>
      <span className="sb-date-label">{label}</span>
      {items.map(c => (
        <ChatItem key={c.id} chat={c} active={c.id === activeChatId}
          onSelect={() => onSelectChat(c.id)} onDelete={() => onDeleteChat(c.id)} />
      ))}
    </>
  )

  // ─── Render ───
  return (
    <aside className={`sidebar ${open ? '' : 'collapsed'}`}>
      <div className="sb-header">
        <div className="sb-brand">
          <span className="sb-logo"><Icons.logo /></span>
          <span className="sb-title">AIUI</span>
        </div>
        <button className="sb-icon-btn" onClick={onToggle}><Icons.panelLeft /></button>
      </div>

      <nav className="sb-nav">
        <button className="sb-nav-item" onClick={onNewChat}>
          <Icons.plus /><span>New Chat</span>
        </button>
        <button className={`sb-nav-item ${showFolders ? 'active' : ''}`}
          onClick={() => setShowFolders(!showFolders)} title="Files / Workspace">
          <Icons.folder /><span>Files</span>
        </button>
      </nav>

      {showFolders && (
        <div className="sb-section sb-folders">
          <div className="sb-folders-header">
            <span className="sb-label">Folders</span>
            <label className="sb-tiny-btn" title="New folder">
              +<input type="text" className="sb-new-folder-inline" placeholder="name..."
                value={newFolderName} onChange={e => setNewFolderName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddFolder() } }}
                onBlur={() => { if (newFolderName.trim()) handleAddFolder() }} />
            </label>
          </div>

          {(folders || []).filter(f => f.id !== null).map(folder => (
            <div key={folder.id} className="folder-row">
              <div className="sb-folder-item" onClick={() => toggleFolder(folder)}
                style={{ borderLeftColor: folder.color || '#888' }}>
                <span className="folder-arrow">{expandedFolderId === folder.id ? '▼' : '▶'}</span>
                {editingFolderId === folder.id ? (
                  <input autoFocus className="sb-rename-input" value={editFolderName}
                    onChange={e => setEditFolderName(e.target.value)}
                    onBlur={() => handleRenameFolder(folder.id)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') handleRenameFolder(folder.id)
                      if (e.key === 'Escape') setEditingFolderId(null)
                    }} />
                ) : (
                  <span className="folder-name"
                    onDoubleClick={() => { setEditingFolderId(folder.id); setEditFolderName(stripEmoji(folder.name)) }}>
                    {stripEmoji(folder.name)}
                  </span>
                )}
                {folder.file_count > 0 && <span className="folder-count-badge">{folder.file_count}</span>}
                <span className="folder-actions">
                  <label title="Upload files" className="sb-tiny-btn">
                    📎<input type="file" multiple hidden accept="image/*,.pdf,.txt,.md"
                      onChange={e => uploadToFolder(folder.id, e)} />
                  </label>
                  <button title="Rename" className="sb-tiny-btn"
                    onClick={e => { e.stopPropagation(); setEditingFolderId(folder.id); setEditFolderName(stripEmoji(folder.name)) }}>✏️</button>
                  <button title="Delete" className="sb-tiny-btn danger"
                    onClick={e => { e.stopPropagation(); handleDeleteFolder(folder.id) }}>🗑</button>
                </span>
              </div>
              {expandedFolderId === folder.id && (
                <FolderExpansion folderId={folder.id} files={folderFiles} folders={folders}
                  onRefresh={refreshAll} onInsertFile={onInsertFile} />
              )}
            </div>
          ))}

          <UnsortedSection expanded={expandedFolderId === null} folders={folders} files={folderFiles}
            onToggle={() => toggleFolder({ id: null })}
            onUpload={e => uploadToFolder(null, e)}
            onInsertFile={onInsertFile}
            onRefresh={refreshAll} />
        </div>
      )}

      <div className="sb-section sb-chats">
        <span className="sb-label">Chats</span>
        {renderChatGroup('Today', todayChats)}
        {renderChatGroup('Yesterday', yesterdayChats)}
        {renderChatGroup('Earlier', earlierChats)}
        {chats.length === 0 && <span className="sb-empty">No conversations yet</span>}
      </div>

      <div className="sb-user" onClick={onOpenSettings}>
        <div className="sb-avatar">{(account?.name || '?')[0]}</div>
        <span className="sb-username">{account?.name || 'User'}</span>
      </div>
    </aside>
  )
}

// ─── Sub-components ──────────────────────────────────────
function ChatItem({ chat, active, onSelect, onDelete }) {
  return (
    <button className={`sb-chat-item ${active ? 'active' : ''}`} onClick={onSelect}>
      <span className="sb-chat-title">{chat.title}</span>
      <span className="sb-chat-del" onClick={e => { e.stopPropagation(); onDelete() }}><Icons.close /></span>
    </button>
  )
}

function UnsortedSection({ expanded, folders, files, onToggle, onUpload, onInsertFile, onRefresh }) {
  const unsorted = (folders || []).find(f => f.id === null)
  if (!unsorted || unsorted.file_count === 0) return null

  return (
    <div className="folder-row">
      <div className="sb-folder-item" onClick={onToggle} style={{ borderLeftColor: '#666' }}>
        <span className="folder-arrow">{expanded ? '▼' : '▶'}</span>
        <span className="folder-name">{stripEmoji(unsorted.name)}</span>
        {unsorted.file_count > 0 && <span className="folder-count-badge">{unsorted.file_count}</span>}
        <label title="Upload" className="sb-tiny-btn">
          📎<input type="file" multiple hidden accept="image/*,.pdf,.txt,.md" onChange={onUpload} />
        </label>
      </div>
      {expanded && (
        <FolderExpansion folderId={null} files={files} folders={folders}
          onRefresh={onRefresh} onInsertFile={onInsertFile} />
      )}
    </div>
  )
}
