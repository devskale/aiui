import React, { useState, useCallback, useEffect, useRef, forwardRef } from 'react'

// ─── Default Account ────────────────────────────────────────────────
const DEFAULT_ACCOUNTS = [
  {
    id: 'default',
    name: 'Default',
    baseUrl: 'https://amd1.mooo.com:8123/v1',
    apiKey: 'test23@test34',
    models: ['tu@qwen-3.6-35b', 'tu@qwen-3.5-397b'],
  },
]

// ─── API Client ────────────────────────────────────────────────────
const API = '/api'
const LS_ACTIVE_ACCOUNT = 'aiui_active_account'  // only this stays in localStorage

async function apiGet(path)  { const r = await fetch(`${API}${path}`); return r.json() }
async function apiPost(path, body) { const r = await fetch(`${API}${path}`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body) }); return r.json() }
async function apiPut(path, body)  { const r = await fetch(`${API}${path}`, { method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body) }); return r.json() }
async function apiDel(path)  { const r = await fetch(`${API}${path}`, { method:'DELETE' }); return r.json() }

// File upload (multipart)
async function apiUpload(file) {
  const fd = new FormData(); fd.append('file', file)
  const r = await fetch(`${API}/upload`, { method:'POST', body:fd })
  return r.json()
}

function lsGet(k) { try { return JSON.parse(localStorage.getItem(k)) } catch { return null } }
function lsSet(k, v) { localStorage.setItem(k, JSON.stringify(v)) }

// ─── Icons (inline SVG) ────────────────────────────────────────────
const Icons = {
  logo: () => <svg viewBox="0 0 24 24" fill="currentColor" width="22" height="22"><circle cx="12" cy="12" r="10" opacity=".2"/><path d="M12 2a10 10 0 100 20 10 10 0 000-20zm0 14.5a4.5 4.5 0 110-9 4.5 4.5 0 010 9z"/></svg>,
  chat: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" width="18" height="18"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>,
  search: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" width="18" height="18"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>,
  note: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" width="18" height="18"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>,
  folder: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" width="18" height="18"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/></svg>,
  plus: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>,
  chevronDown: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16"><polyline points="6 9 12 15 18 9"/></svg>,
  send: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>,
  stop: () => <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14"><rect x="4" y="4" width="16" height="16" rx="2"/></svg>,
  attach: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>,
  settings: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" width="18" height="18"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>,
  panelLeft: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" width="18" height="18"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="9" y1="3" x2="9" y2="21"/></svg>,
  close: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,
  user: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" width="18" height="18"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>,
  sparkles: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" width="14" height="14"><path d="M12 3v18M3 12h18M5.6 5.6l12.8 12.8M18.4 5.6L5.6 18.4"/></svg>,
  mic: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" width="18" height="18"><path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z"/><path d="M19 10v2a7 7 0 01-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>,
}

// ─── Suggestions ──────────────────────────────────────────────────
const SUGGESTIONS = [
  { title: 'Show me a code snippet', sub: "of a website's sticky header" },
  { title: 'Help me study', sub: 'vocabulary for a college entrance exam' },
  { title: 'Overcome procrastination', sub: 'give me tips' },
]

// ════════════════════════════════════════════════════════════════════
// APP
// ════════════════════════════════════════════════════════════════════
export default function App() {
  const [accounts, setAccounts] = useState([])
  const [activeModel, setActiveModel] = useState(() => lsGet('aiui_active_model') || 'tu@qwen-3.6-35b')
  const [chats, setChats] = useState([])
  const [activeChatId, setActiveChatId] = useState(null)
  const [folders, setFolders] = useState([])
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [showSettings, setShowSettings] = useState(false)
  const [ready, setReady] = useState(false)
  const [view, setView] = useState('chat') // 'chat' | 'library'
  const inputInsertRef = useRef(null) // { current: (text) => void }

  const account = accounts[0]

  // ─── Load from backend on mount ───
  useEffect(() => {
    (async () => {
      try {
        const accts = await apiGet('/accounts')
        setAccounts(accts.length ? accts : [DEFAULT_ACCOUNTS])
        const chatList = await apiGet('/chats')
        setChats(chatList)
        if (chatList.length) setActiveChatId(chatList[0].id)
        const fldrs = await apiGet('/folders')
        setFolders(fldrs)
      } catch(e) { console.error('Failed to load:', e) }
      setReady(true)
    })()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Reload chats when account switches ───
  useEffect(() => {
    if (!ready || !account) return
    lsSet('aiui_active_model', activeModel)
    const models = account.models || []
    if (models.length && !models.includes(activeModel)) {
      setActiveModel(models[0])
    }
  }, [activeModel, ready, account])

  const createChat = useCallback(async () => {
    const c = await apiPost('/chats', { account_id: account?.id || 'default', model: activeModel })
    setChats(prev => [{ id: c.id, title: c.title, messages: [], created_at: Date.now()/1000, updated_at: Date.now()/1000 }, ...prev])
    setActiveChatId(c.id)
  }, [account, activeModel])

  const deleteChat = useCallback(async (id) => {
    await apiDel(`/chats/${id}`)
    setChats(prev => prev.filter(c => c.id !== id))
    if (activeChatId === id) setActiveChatId(null)
  }, [activeChatId])

  const updateChat = useCallback(async (id, updates) => {
    // Update local state immediately
    setChats(prev => prev.map(c => c.id === id ? { ...c, ...updates } : c))
    // Persist to backend (messages + title)
    try {
      const chat = chats.find(c => c.id === id)
      if (chat) {
        await apiPut(`/chats/${id}`, updates)
      }
    } catch(e) { console.error('Save chat failed:', e) }
  }, [chats])

  return (
    <div className="app">
      <Sidebar open={sidebarOpen} onToggle={() => setSidebarOpen(!sidebarOpen)}
        chats={chats} activeChatId={activeChatId} onSelectChat={setActiveChatId}
        onNewChat={createChat} onDeleteChat={deleteChat}
        account={account} activeModel={activeModel} onSetActiveModel={setActiveModel} onOpenSettings={() => setShowSettings(true)}
        folders={folders} onFoldersChange={setFolders}
        onInsertFile={inputInsertRef} view={view} onViewChange={setView}
      />
      <MainArea sidebarOpen={sidebarOpen} onToggleSidebar={() => setSidebarOpen(!sidebarOpen)}
        chat={chats.find(c => c.id === activeChatId)} account={account} activeModel={activeModel} onSetActiveModel={setActiveModel}
        onUpdateChat={updateChat} onNewChat={createChat} onOpenSettings={() => setShowSettings(true)}
        ready={ready} inputInsertRef={inputInsertRef}
        view={view} onViewChange={setView} folders={folders} onFoldersChange={setFolders}
      />
      {showSettings && <SettingsModal accounts={accounts} account={account} activeModel={activeModel} onSetActiveModel={setActiveModel}
        onClose={() => setShowSettings(false)}
        onSave={async (acs) => { setAccounts(acs); try { await apiPut('/accounts', acs) } catch(e) { console.error('Save accounts failed:', e) } }}
      />}
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════
// SIDEBAR
// ════════════════════════════════════════════════════════════════════
function Sidebar({ open, onToggle, chats, activeChatId, onSelectChat, onNewChat, onDeleteChat, account, onOpenSettings, folders, onFoldersChange, onInsertFile }) {
  const [showFolders, setShowFolders] = useState(false)
  const [expandedFolderId, setExpandedFolderId] = useState(null)
  const [folderFiles, setFolderFiles] = useState([])
  const [newFolderName, setNewFolderName] = useState('')
  const [editingFolderId, setEditingFolderId] = useState(null)
  const [editFolderName, setEditFolderName] = useState('')

  // Group chats by date
  const todayChats = []
  const yesterdayChats = []
  const earlierChats = []
  const now = Date.now()
  const msDay = 86400000
  chats.forEach(c => {
    const diff = now - (c.createdAt || 0)
    if (diff < msDay) todayChats.push(c)
    else if (diff < msDay * 2) yesterdayChats.push(c)
    else earlierChats.push(c)
  })

  // ─── Folder CRUD ───
  const handleAddFolder = async () => {
    const name = newFolderName.trim() || 'New Folder'
    try {
      const res = await fetch('/api/folders', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ name }) })
      if (res.ok) { setNewFolderName(''); loadFolders() }
    } catch(e) {}
  }

  const handleRenameFolder = async (id) => {
    if (!editFolderName.trim()) return
    try {
      await fetch(`/api/folders/${id}`, { method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify({name: editFolderName.trim()}) })
      setEditingFolderId(null); loadFolders()
    } catch(e){}
  }

  const handleDeleteFolder = async (id) => {
    if (!confirm('Delete this folder? Files will become unsorted.')) return
    try { await fetch(`/api/folders/${id}`, { method:'DELETE' }); loadFolders(); if (expandedFolderId === id) setExpandedFolderId(null) } catch(e){}
  }

  const loadFolders = async () => {
    try { const f = await apiGet('/folders'); onFoldersChange(f) } catch(e){}
  }
  const refreshExpanded = async (fid) => {
    // Always re-fetch files for currently expanded folder (no toggle)
    try {
      const data = await apiGet(fid ? `/library?folder_id=${fid}` : '/library')
      setFolderFiles(data.files || [])
    } catch(e) { setFolderFiles([]) }
  }

  const toggleFolder = async (folder) => {
    if (expandedFolderId === folder.id) { setExpandedFolderId(null); return }
    setExpandedFolderId(folder.id)
    await refreshExpanded(folder.id)
  }

  const uploadToFolder = async (folderId, e) => {
    const files = e.target.files
    if (!files.length) return
    const url = folderId ? `/api/upload?folder_id=${folderId}` : '/api/upload'
    for (const file of Array.from(files)) {
      const fd = new FormData()
      fd.append('file', file)
      await fetch(url, { method: 'POST', body: fd })
    }
    e.target.value = ''
    await refreshExpanded(expandedFolderId)
    await loadFolders()
  }

  const deleteFile = async (fileId) => {
    if (!confirm('Delete this file?')) return
    try { await fetch(`/api/files/${fileId}`, { method:'DELETE' }); await refreshExpanded(expandedFolderId); await loadFolders() } catch(e){}
  }

  const moveFileToFolder = async (fileId, newFolderId) => {
    try { await fetch(`/api/files/${fileId}`, { method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify({folder_id: newFolderId}) }); await refreshExpanded(expandedFolderId); await loadFolders() } catch(e){}
  }

  return (
    <aside className={`sidebar ${open ? '' : 'collapsed'}`}>
      {/* Header */}
      <div className="sb-header">
        <div className="sb-brand">
          <span className="sb-logo"><Icons.logo /></span>
          <span className="sb-title">AIUI</span>
        </div>
        <button className="sb-icon-btn" onClick={onToggle}><Icons.panelLeft /></button>
      </div>

      {/* Nav Items */}
      <nav className="sb-nav">
        <button className="sb-nav-item" onClick={onNewChat}>
          <Icons.plus /><span>New Chat</span>
        </button>
        <button className={`sb-nav-item ${showFolders ? 'active' : ''}`} onClick={() => setShowFolders(!showFolders)} title="Files / Workspace">
          <Icons.folder /><span>Files</span>
        </button>
      </nav>

      {/* FOLDERS SECTION */}
      {showFolders && (
        <div className="sb-section sb-folders">
          <div className="sb-folders-header">
            <span className="sb-label">Folders</span>
            <label className="sb-tiny-btn" title="New folder">+<input type="text" className="sb-new-folder-inline" placeholder="name..." value={newFolderName} onChange={e=>setNewFolderName(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();handleAddFolder()}}} onBlur={()=>{if(newFolderName.trim())handleAddFolder()}} /></label>
          </div>
          
          {(folders||[]).filter(f=>f.id!==null).map(folder => (
            <div key={folder.id} className="folder-row">
              {/* Folder header row */}
              <div className="sb-folder-item" onClick={() => toggleFolder(folder)} style={{borderLeftColor: folder.color||'#888'}}>
                <span className="folder-arrow">{expandedFolderId===folder.id ? '▼' : '▶'}</span>
                <span className="folder-emoji">{folder.icon||'📁'}</span>
                {editingFolderId === folder.id ? (
                  <input autoFocus className="sb-rename-input" value={editFolderName} onChange={e=>setEditFolderName(e.target.value)} onBlur={()=>handleRenameFolder(folder.id)} onKeyDown={e=>{if(e.key==='Enter')handleRenameFolder(folder.id);if(e.key==='Escape')setEditingFolderId(null)}} />
                ) : (
                  <span className="folder-name" onDoubleClick={() => { setEditingFolderId(folder.id); setEditFolderName(folder.name) }}>{folder.name}</span>
                )}
                {folder.file_count > 0 && <span className="folder-count-badge">{folder.file_count}</span>}
                <span className="folder-actions">
                  <label title="Upload files" className="sb-tiny-btn">📎<input type="file" multiple hidden accept="image/*,.pdf,.txt,.md" onChange={(e)=>uploadToFolder(folder.id,e)} /></label>
                  <button title="Rename" className="sb-tiny-btn" onClick={e=>{e.stopPropagation();setEditingFolderId(folder.id);setEditFolderName(folder.name)}}>✏️</button>
                  <button title="Delete" className="sb-tiny-btn danger" onClick={e=>{e.stopPropagation();handleDeleteFolder(folder.id)}}>🗑</button>
                </span>
              </div>

              {/* Expanded: show files inside */}
              {expandedFolderId === folder.id && (
                <div className="folder-files-list">
                  {/* Upload bar */}
                  <label className="folder-upload-bar">
                    <span>📤 Upload...</span>
                    <input type="file" multiple accept="image/*,.pdf,.txt,.md" onChange={(e)=>uploadToFolder(folder.id,e)} />
                  </label>
                  
                  {folderFiles.length === 0 ? (
                    <span className="folder-empty">Empty</span>
                  ) : (
                    folderFiles.map(file => (
                      <div key={file.id} className="folder-file-item">
                        <span className="ff-icon">{file.mime_type?.startsWith('image/')?'🖼':file.mime_type==='application/pdf'?'📄':'📝'}</span>
                        <span className="ff-name" title={file.original_name}>{file.original_name}</span>
                        <span className="ff-file-actions">
                          <button className="ff-add" title="Add to chat" onClick={()=>onInsertFile?.current?.(file.original_name)}>+</button>
                          <select className="ff-move-mini" defaultValue={file.folder_id||''} onChange={e=>moveFileToFolder(file.id, e.target.value||null)} title="Move">
                            <option value="">—</option>
                            {(folders||[]).filter(f=>f.id!==null&&f.id!==file.folder_id).map(f=><option key={f.id} value={f.id}>{f.icon}</option>)}
                          </select>
                          <button className="ff-del" onClick={()=>deleteFile(file.id)}>✕</button>
                        </span>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          ))}

          {/* Unsorted section */}
          {(() => {
            const unsorted = (folders||[]).find(f=>f.id===null)
            if (!unsorted || unsorted.file_count === 0) return null
            return (
              <div className="folder-row">
                <div className="sb-folder-item" onClick={() => toggleFolder({id: null})} style={{borderLeftColor:'#666'}}>
                  <span className="folder-arrow">{expandedFolderId===null ? '▼' : '▶'}</span>
                  <span className="folder-emoji">{unsorted.icon||'📥'}</span>
                  <span className="folder-name">{unsorted.name}</span>
                  {unsorted.file_count > 0 && <span className="folder-count-badge">{unsorted.file_count}</span>}
                  <label title="Upload" className="sb-tiny-btn">📎<input type="file" multiple hidden accept="image/*,.pdf,.txt,.md" onChange={(e)=>uploadToFolder(null,e)} /></label>
                </div>
                {expandedFolderId === null && (
                  <div className="folder-files-list">
                    <label className="folder-upload-bar">
                      <span>📤 Upload...</span>
                      <input type="file" multiple accept="image/*,.pdf,.txt,.md" onChange={(e)=>uploadToFolder(null,e)} />
                    </label>
                    {folderFiles.map(file => (
                      <div key={file.id} className="folder-file-item">
                        <span className="ff-icon">{file.mime_type?.startsWith('image/')?'🖼':file.mime_type==='application/pdf'?'📄':'📝'}</span>
                        <span className="ff-name" title={file.original_name}>{file.original_name}</span>
                        <span className="ff-file-actions">
                          <button className="ff-add" title="Add to chat" onClick={()=>onInsertFile?.current?.(file.original_name)}>+</button>
                          <select className="ff-move-mini" defaultValue={file.folder_id||''} onChange={e=>moveFileToFolder(file.id, e.target.value||null)} title="Move">
                            <option value="">—</option>
                            {(folders||[]).filter(f=>f.id!==null&&f.id!==file.folder_id).map(f=><option key={f.id} value={f.id}>{f.icon}</option>)}
                          </select>
                          <button className="ff-del" onClick={()=>deleteFile(file.id)}>✕</button>
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })()}
        </div>
      )}

      {/* Chats */}
      <div className="sb-section sb-chats">
        <span className="sb-label">Chats</span>

        {todayChats.length > 0 && (
          <>
            <span className="sb-date-label">Today</span>
            {todayChats.map(c => (
              <ChatItem key={c.id} chat={c} active={c.id === activeChatId} onSelect={() => onSelectChat(c.id)} onDelete={() => onDeleteChat(c.id)} />
            ))}
          </>
        )}
        {yesterdayChats.length > 0 && (
          <>
            <span className="sb-date-label">Yesterday</span>
            {yesterdayChats.map(c => (
              <ChatItem key={c.id} chat={c} active={c.id === activeChatId} onSelect={() => onSelectChat(c.id)} onDelete={() => onDeleteChat(c.id)} />
            ))}
          </>
        )}
        {earlierChats.length > 0 && (
          <>
            <span className="sb-date-label">Earlier</span>
            {earlierChats.map(c => (
              <ChatItem key={c.id} chat={c} active={c.id === activeChatId} onSelect={() => onSelectChat(c.id)} onDelete={() => onDeleteChat(c.id)} />
            ))}
          </>
        )}
        {chats.length === 0 && <span className="sb-empty">No conversations yet</span>}
      </div>

      {/* User */}
      <div className="sb-user" onClick={onOpenSettings}>
        <div className="sb-avatar">{(account?.name || '?')[0]}</div>
        <span className="sb-username">{account?.name || 'User'}</span>
      </div>
    </aside>
  )
}

function ChatItem({ chat, active, onSelect, onDelete }) {
  return (
    <button className={`sb-chat-item ${active ? 'active' : ''}`} onClick={onSelect}>
      <span className="sb-chat-title">{chat.title}</span>
      <span className="sb-chat-del" onClick={e => { e.stopPropagation(); onDelete() }}><Icons.close /></span>
    </button>
  )
}

// ════════════════════════════════════════════════════════════════════
// MAIN AREA
// ════════════════════════════════════════════════════════════════════
// ─── Image Helpers ──────────────────────────────────────────
const IMG_TYPES = ['image/png','image/jpeg','image/gif','image/webp']
const MAX_IMG_SIZE = 10 * 1024 * 1024 // 10MB

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    if (file.size > MAX_IMG_SIZE) return reject(new Error(`${file.name} is too large (max 10MB)`))
    const r = new FileReader()
    r.onload = () => resolve(r.result)
    r.onerror = reject
    r.readAsDataURL(file)
  })
}

// ════════════════════════════════════════════════════════════════════
// MAIN AREA
// ════════════════════════════════════════════════════════════════════
function MainArea({ sidebarOpen, onToggleSidebar, chat, account, activeModel, onSetActiveModel, onUpdateChat, onNewChat, onOpenSettings, ready, inputInsertRef }) {
  const [messages, setMessages] = useState(chat?.messages || [])
  const [streaming, setStreaming] = useState(false)
  const [input, setInput] = useState('')
  const [attachments, setAttachments] = useState([]) // {id, file, dataUrl, name}
  const endRef = useRef(null)
  const inputRef = useRef(null)
  const abortRef = useRef(null)

  // ─── # Autocomplete ───
  const [acShow, acSetShow] = useState(false)
  const [acItems, acSetItems] = useState([])
  const [acIndex, acSetIndex] = useState(0)
  const acTimer = useRef(null)

  const getAcQuery = (text, pos) => {
    const before = text.slice(0, pos)
    const m = before.match(/#(\S*)$/)
    return m ? { query: m[1], start: pos - m[0].length } : null
  }
  const doAcSearch = async (query) => {
    if (!query) { acSetShow(false); return }
    try { const files = await apiGet(`/library/search?q=${encodeURIComponent(query)}&limit=12`); acSetItems(files); acSetIndex(0); acSetShow(files.length > 0) }
    catch(e) { acSetShow(false) }
  }
  const handleInputChange = (val) => {
    setInput(val)
    const info = getAcQuery(val, val.length)
    if (!info?.query) { acSetShow(false); return }
    clearTimeout(acTimer.current)
    acTimer.current = setTimeout(() => doAcSearch(info.query), 200)
  }
  const acSelect = (name) => {
    const info = getAcQuery(input, input.length)
    if (info) setInput(input.slice(0, info.start) + '#' + name + ' ')
    acSetShow(false)
    setTimeout(() => inputRef.current?.focus(), 30)
  }
  const acHandleKey = (e) => {
    if (!acShow) return false
    if (e.key === 'ArrowDown') { e.preventDefault(); acSetIndex(i => Math.min(i+1, acItems.length-1)); return true }
    if (e.key === 'ArrowUp')   { e.preventDefault(); acSetIndex(i => Math.max(i-1, 0)); return true }
    if (e.key === 'Enter' && acItems[acIndex]) { e.preventDefault(); acSelect(acItems[acIndex].original_name); return true }
    if (e.key === 'Escape')     { e.preventDefault(); acSetShow(false); return true }
    return false
  }

  // Expose insert function to parent (Sidebar + button uses this)
  useEffect(() => {
    if (inputInsertRef) {
      inputInsertRef.current = (text) => {
        setInput(prev => prev ? prev + ' #' + text : '#' + text)
        setTimeout(() => inputRef.current?.focus(), 50)
      }
    }
  }, [inputInsertRef])
  const fileInputRef = useRef(null)

  const llmConfig = account ? { baseUrl: account.baseUrl, apiKey: account.apiKey, model: activeModel } : null

  useEffect(() => { setMessages(chat?.messages || []); setInput(''); setAttachments([]) }, [chat?.id])
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  // ─── Attachment handlers ───
  const addAttachments = async (files) => {
    for (const f of files) {
      if (!IMG_TYPES.includes(f.type)) continue
      try {
        const dataUrl = await fileToDataUrl(f)
        setAttachments(prev => [...prev, { id: Date.now().toString(36) + Math.random().toString(36).slice(2), file: f, dataUrl, name: f.name }])
      } catch (err) {
        alert(err.message)
      }
    }
  }

  const removeAttachment = (id) => setAttachments(prev => prev.filter(a => a.id !== id))

  const handlePaste = (e) => {
    const items = e.clipboardData?.items
    if (!items) return
    const files = []
    for (const item of items) {
      if (item.kind === 'file' && IMG_TYPES.includes(item.type)) files.push(item.getAsFile())
    }
    if (files.length) { e.preventDefault(); addAttachments(files) }
  }

  const handleDrop = (e) => {
    e.preventDefault()
    const files = Array.from(e.dataTransfer?.files || []).filter(f => IMG_TYPES.includes(f.type))
    if (files.length) addAttachments(files)
  }

  const handleDragOver = (e) => e.preventDefault()

  // ─── Send ───
  const sendMessage = async (content, imgs = attachments) => {
    if ((!content.trim() || content.trim() === '/') && imgs.length === 0) return
    if (!chat) { onNewChat(); return }

    // ─── Resolve #filename references ───
    let finalContent = content.trim()
    let resolvedFiles = []
    if (finalContent.includes('#')) {
      try {
        const res = await fetch('/api/resolve-references', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: finalContent })
        })
        if (res.ok) {
          const data = await res.json()
          // If we got back a multimodal array, use it directly
          if (data.content && Array.isArray(data.content) && data.content.some(b => b.type !== 'text' || b.text !== finalContent)) {
            // Build user content from resolved blocks
            const userContent = []
            for (const block of data.content) {
              if (block.type === 'image_url') {
                userContent.push({ type: 'image_url', image_url: block.image_url })
              } else if (block.type === 'text' && block.text.trim()) {
                userContent.push({ type: 'text', text: block.text })
              }
            }
            // Add attachment images too
            for (const img of imgs) {
              userContent.push({ type: 'image_url', image_url: { url: img.dataUrl } })
            }
            const userMsg = { role: 'user', content: userContent.length === 1 && userContent[0].type === 'text' ? userContent[0].text : userContent }
            const updated = [...messages, userMsg]
            setMessages(updated)
            if (updated.length === 1) onUpdateChat(chat.id, { title: (finalContent.slice(0, 50)) + (finalContent.length > 50 ? '...' : '') })
            setInput(''); setAttachments([]); setStreaming(true)
            await streamToLLM(updated, llmConfig, data.resolved || [])
            return
          }
        }
      } catch(e) { console.warn('Resolve refs failed, sending as plain text:', e) }
      // Fallback: just strip # and send as text
      finalContent = finalContent.replace(/#[\w\-. ]+/g, '`$&`')
    }

    // Build user content (text + images)
    const userContent = []
    if (finalContent && finalContent !== '/') userContent.push({ type: 'text', text: finalContent })
    for (const img of imgs) {
      userContent.push({ type: 'image_url', image_url: { url: img.dataUrl } })
    }
    const userMsg = { role: 'user', content: userContent.length === 1 && userContent[0].type === 'text' ? userContent[0].text : userContent }
    const updated = [...messages, userMsg]
    setMessages(updated)

    if (updated.length === 1) {
      onUpdateChat(chat.id, { title: (finalContent || '📷 Image') .slice(0, 50) + ((finalContent || '').length > 50 ? '...' : '') })
    }
    setInput('')
    setAttachments([])
    setStreaming(true)

    await streamToLLM(updated, llmConfig)
  }

  // ─── Stream messages to LLM (shared by normal + #ref sends) ───
  const streamToLLM = async (updated, llmCfg, resolvedNames = []) => {
    try {
      const apiMessages = updated.map(m => ({ role: m.role, content: m.content }))
      let assistantContent = ''
      let toolCalls = []  // track tool calls for display

      setMessages(prev => [...prev, { role: 'assistant', content: '', tools: [] }])

      // Go through backend proxy — passes base_url/api_key in body
      const res = await fetch('/api/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          __base_url: llmCfg.baseUrl,
          __api_key: llmCfg.apiKey,
          model: llmCfg.model,
          messages: apiMessages,
          stream: true,
        }),
        signal: abortRef.current?.signal,
      })

      if (!res.ok) throw new Error(`API ${res.status}: ${await res.text()}`)

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buf = ''
      let currentEvent = null  // for custom SSE events

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buf += decoder.decode(value, { stream: true })
        // Split on newlines but handle event: lines too
        const lines = buf.split('\n')
        buf = lines.pop() || ''

        for (const line of lines) {
          const t = line.trim()

          // Handle custom event type
          if (t.startsWith('event:')) {
            currentEvent = t.slice(6).trim()
            continue
          }
          if (!t.startsWith('data:')) continue
          const d = t.slice(5).trim()
          if (d === '[DONE]') { currentEvent = null; continue }

          try {
            const j = JSON.parse(d)

            // Custom tool_status event from backend
            if (currentEvent === 'tool_status') {
              if (j.type === 'tool_start') {
                toolCalls.push({ name: j.tool, args: j.args, status: 'running', result: null })
              } else if (j.type === 'tool_result') {
                const last = toolCalls[toolCalls.length - 1]
                if (last) { last.status = j.ok ? 'done' : 'error'; last.result = j.preview }
              }
              // Update message with tool info
              setMessages(prev => {
                const n = [...prev]; n[n.length - 1] = {
                  ...n[n.length - 1],
                  content: assistantContent,
                  tools: [...toolCalls],
                }; return n
              })
              currentEvent = null
              continue
            }

            // Regular streaming content
            const delta = j.choices?.[0]?.delta?.content
            if (delta) {
              assistantContent += delta
              setMessages(prev => {
                const n = [...prev]; n[n.length - 1] = {
                  ...n[n.length - 1],
                  content: assistantContent,
                  tools: [...toolCalls],
                }; return n
              })
            }
          } catch {}
        }
      }

      const final = [...updated, { role: 'assistant', content: assistantContent }]
      // Sanitize for DB: strip base64 from images, keep text refs instead
      const sanitized = final.map(m => {
        if (typeof m.content === 'string') return m
        if (!Array.isArray(m.content)) return m
        const clean = m.content.map(b => {
          if (b.type === 'image_url' && b.image_url?.url?.startsWith('data:')) {
            return { type: 'text', text: `[🖼 ${b.ref_name || 'image'}]` }
          }
          return b
        }).filter(b => !(b.type === 'text' && !b.text.trim()))
        // Collapse to simple string if only one text block left
        if (clean.length === 0) return { ...m, content: '' }
        if (clean.length === 1 && clean[0].type === 'text') return { ...m, content: clean[0].text }
        return { ...m, content: clean }
      })
      onUpdateChat(chat.id, { messages: sanitized })
      setMessages(final)
    } catch (err) {
      if (err.name !== 'AbortError') {
        setMessages(prev => [...prev.slice(0, -1), { role: 'error', content: `Error: ${err.message}` }])
      }
    } finally {
      setStreaming(false)
      abortRef.current = null
    }
  }

  const handleKeyDown = (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(input) } }

  // Guard: wait for data
  if (!llmConfig || !ready) {
    return (
      <main className="main">
        <div className="content" style={{display:'flex',alignItems:'center',justifyContent:'center',flex:1}}>
          <span style={{color:'#555'}}>Loading...</span>
        </div>
      </main>
    )
  }

  // Welcome screen or chat
  return (
    <main className={`main ${!sidebarOpen ? 'full' : ''}`}
      onPaste={handlePaste} onDrop={handleDrop} onDragOver={handleDragOver}>
      {/* Hidden file input */}
      <input ref={fileInputRef} type="file" accept="image/*" multiple style={{display:'none'}}
        onChange={e => { addAttachments(Array.from(e.target.files||[])); e.target.value = '' }}
      />

      {/* Top bar */}
      <header className="topbar">
        {!sidebarOpen && <button className="tb-btn" onClick={onToggleSidebar}><Icons.panelLeft /></button>}

        <ModelPicker models={account?.models||[]} activeModel={activeModel} onSelect={onSetActiveModel} />
        <div style={{flex:1}} />
        <button className="tb-btn" onClick={onOpenSettings}><Icons.settings /></button>
      </header>

      {/* Content */}
      <div className="content">
        {/* Floating stop button — always visible during streaming */}
        {streaming && (
          <button className="floating-stop" onClick={() => abortRef.current?.abort()} title="Stop generating">
            <Icons.stop />
            <span>Stop</span>
          </button>
        )}

        {!chat ? (
          /* ── Welcome Screen ── */
          <div className="welcome">
            <div className="welcome-logo"><Icons.logo /></div>
            <h1 className="welcome-model">{activeModel}</h1>

            <div className="welcome-input-wrap">
              {attachments.length > 0 && (
                <AttachmentBar attachments={attachments} onRemove={removeAttachment} />
              )}
              <WelcomeInput ref={inputRef} value={input} onChange={handleInputChange}
                onSend={() => sendMessage(input)} onKeyDown={(e)=>{if(!acHandleKey(e)) handleKeyDown(e)}} streaming={streaming}
                acShow={acShow} acItems={acItems} acIndex={acIndex} acSetIndex={acSetIndex} acSelect={acSelect} acSetShow={acSetShow}
                onStop={() => abortRef.current?.abort()}
                onAttachClick={() => fileInputRef.current?.click()}
              />
            </div>

            <div className="suggestions">
              <div className="suggestions-header"><Icons.sparkles /> Suggested</div>
              {SUGGESTIONS.map((s, i) => (
                <button key={i} className="suggestion-chip" onClick={() => sendMessage(s.title)}>
                  <span className="sug-title">{s.title}</span>
                  <span className="sug-sub">{s.sub}</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          /* ── Chat View ── */
          <>
            <div className="messages">
              {messages.map((msg, i) => <Message key={i} msg={msg} />)}
              {streaming && !messages[messages.length - 1]?.content && <TypingIndicator />}
              <div ref={endRef} />
            </div>
            <div className="chat-input-area">
              {attachments.length > 0 && (
                <AttachmentBar attachments={attachments} onRemove={removeAttachment} />
              )}
              <ChatInput ref={inputRef} value={input} onChange={handleInputChange}
                onSend={() => sendMessage(input)} onKeyDown={(e)=>{if(!acHandleKey(e)) handleKeyDown(e)}}
                streaming={streaming} onStop={() => abortRef.current?.abort()}
                onAttachClick={() => fileInputRef.current?.click()}
                acShow={acShow} acItems={acItems} acIndex={acIndex} acSetIndex={acSetIndex} acSelect={acSelect} acSetShow={acSetShow}
              />
            </div>
          </>
        )}
      </div>
    </main>
  )
}

// ════════════════════════════════════════════════════════════════════
// MESSAGE
// ════════════════════════════════════════════════════════════════════
function Message({ msg }) {
  if (msg.role === 'error') {
    return <div className="msg-row error"><div className="msg-bubble error-bubble">{msg.content}</div></div>
  }
  const isUser = msg.role === 'user'

  // Extract text and images from content
  let text = ''
  let images = []
  let raw = msg.content
  // Content may come from DB as JSON-stringified array
  if (typeof raw === 'string' && raw.trim().startsWith('[')) {
    try { raw = JSON.parse(raw) } catch(e) {}
  }
  if (typeof raw === 'string') {
    text = raw
  } else if (Array.isArray(raw)) {
    for (const block of raw) {
      if (block.type === 'text') text += block.text
      else if (block.type === 'image_url') images.push(block.image_url?.url)
    }
  }

  const tools = msg.tools || []
  const toolIcons = { read_file: '📄', web_search: '🔍', fetch_url: '🌐' }

  return (
    <div className={`msg-row ${isUser ? 'user' : 'assistant'}`}>
      {!isUser && <div className="msg-avatar"><Icons.logo /></div>}
      <div className={`msg-bubble ${isUser ? 'user-bubble' : ''}`}>
        {/* Tool calls display */}
        {tools.length > 0 && (
          <div className="tool-calls">
            {tools.map((tc, i) => (
              <div key={i} className={`tool-call ${tc.status}`}>
                <span className="tool-icon">{toolIcons[tc.name] || '🔧'}</span>
                <span className="tool-name">{tc.name}</span>
                {tc.status === 'running' && <span className="tool-spinner">⟳</span>}
                {tc.status === 'done' && <span className="tool-status-ok">✓</span>}
                {tc.status === 'error' && <span className="tool-status-err">✗</span>}
                {tc.args && tc.status !== 'running' && (
                  <span className="tool-args">
                    {tc.name === 'read_file' && tc.args.file_id}
                    {tc.name === 'web_search' && `"${(tc.args.query||'').slice(0,40)}"`}
                    {tc.name === 'fetch_url' && (tc.args.url||'').slice(0,40)}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
        {images.length > 0 && images.map((src, i) => (
          <img key={i} src={src} alt="attachment" className="msg-image" />
        ))}
        {text ? renderMd(text) : (!tools.length ? <TypingInline /> : null)}
      </div>
    </div>
  )
}

function TypingIndicator() {
  return (
    <div className="msg-row assistant">
      <div className="msg-avatar"><Icons.logo /></div>
      <div className="msg-bubble"><TypingInline /></div>
    </div>
  )
}

function TypingInline() {
  return <span className="typing-dots"><i/><i/><i/></span>
}

function renderMd(text) {
  let h = text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
  h = h.replace(/```(\w*)\n([\s\S]*?)```/g, (_,lang,c) => `<pre><code class="lang-${lang}">${c.trim()}</code></pre>`)
  h = h.replace(/`([^`]+)`/g, '<code>$1</code>')
  h = h.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  h = h.replace(/\*([^*]+)\*/g, '<em>$1</em>')
  h = h.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>')
  h = h.replace(/\n/g, '<br/>')
  return React.createElement('span', { dangerouslySetInnerHTML: { __html: h } })
}

// ════════════════════════════════════════════════════════════════════
// ════════════════════════════════════════════════════════════════════
// AUTOCOMPLETE DROPDOWN for #file references
// ════════════════════════════════════════════════════════════════════
function AcDropdown({ items, index, setIndex, onSelect, onClose }) {
  const ref = useRef(null)
  // Auto-scroll into view
  useEffect(() => {
    const el = ref.current?.children[index]
    el?.scrollIntoView({ block: 'nearest' })
  }, [index])
  return (
    <div className="ac-dropdown" ref={ref}>
      {items.map((f, i) => (
        <div key={f.id}
          className={`ac-item ${i === index ? 'active' : ''}`}
          onMouseEnter={() => setIndex(i)}
          onClick={() => onSelect(f.original_name)}
        >
          <span className="ac-icon">{f.mime_type?.startsWith('image/')?'🖼':f.mime_type==='application/pdf'?'📄':'📝'}</span>
          <span className="ac-name">{f.original_name}</span>
          <span className="ac-folder">{f.folder_name || '—'}</span>
        </div>
      ))}
    </div>
  )
}

// WELCOME INPUT (big centered input)
// ════════════════════════════════════════════════════════════════════
const WelcomeInput = forwardRef(({ value, onChange, onSend, onKeyDown, streaming, onStop, onAttachClick,
  acShow, acItems, acIndex, acSetIndex, acSelect, acSetShow }, ref) => {
  return (
    <div className="welcome-input-wrap" style={{position:'relative'}}>
      <div className="welcome-input-box">
        <textarea ref={ref} value={value} onChange={e => onChange(e.target.value)}
          onKeyDown={onKeyDown} placeholder="How can I help you today?" rows={1}
          disabled={streaming} className="wi-textarea"
        />
        <div className="wi-actions-left">
          <button className="wi-action-btn" onClick={onAttachClick} title="Attach image"><Icons.attach /></button>
        </div>
        <div className="wi-actions-right">
          {streaming
            ? <button className="wi-send-btn stop" onClick={onStop} title="Stop"><Icons.stop /></button>
            : <button className="wi-send-btn" onClick={onSend} disabled={!value.trim()} title="Send"><Icons.send /></button>
          }
          <button className="wi-action-btn" title="Voice"><Icons.mic /></button>
        </div>
      </div>
      {acShow && <AcDropdown items={acItems} index={acIndex} setIndex={acSetIndex} onSelect={acSelect} onClose={()=>acSetShow(false)} />}
    </div>
  )
})

// ════════════════════════════════════════════════════════════════════
// CHAT INPUT (bottom bar in conversation)
// ════════════════════════════════════════════════════════════════════
const ChatInput = forwardRef(({ value, onChange, onSend, onKeyDown, streaming, onStop, onAttachClick,
  acShow, acItems, acIndex, acSetIndex, acSelect, acSetShow }, ref) => {
  return (
    <div style={{position:'relative'}}>
      <div className="chat-input-box">
        <textarea ref={ref} value={value} onChange={e => onChange(e.target.value)}
          onKeyDown={onKeyDown} placeholder="Send a message..." rows={1}
          disabled={streaming} className="ci-textarea"
        />
        <div className="ci-actions">
          <button className="ci-action-btn" onClick={onAttachClick} title="Attach image"><Icons.attach /></button>
          {streaming
            ? <button className="ci-send-btn stop" onClick={onStop} title="Stop"><Icons.stop /></button>
            : <button className="ci-send-btn" onClick={onSend} disabled={!value.trim()} title="Send"><Icons.send /></button>
          }
        </div>
      </div>
      {acShow && <AcDropdown items={acItems} index={acIndex} setIndex={acSetIndex} onSelect={acSelect} onClose={()=>acSetShow(false)} />}
    </div>
  )
})

// ════════════════════════════════════════════════════════════════════
// ATTACHMENT BAR
// ════════════════════════════════════════════════════════════════════
function AttachmentBar({ attachments, onRemove }) {
  if (!attachments.length) return null
  return (
    <div className="attachment-bar">
      {attachments.map(att => (
        <div key={att.id} className="attachment-thumb">
          <img src={att.dataUrl} alt={att.name} />
          <button className="att-remove" onClick={() => onRemove(att.id)} title="Remove"><Icons.close /></button>
          <span className="att-name">{att.name}</span>
        </div>
      ))}
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════
// SETTINGS MODAL
// ════════════════════════════════════════════════════════════════════
// MODEL PICKER
function ModelPicker({ models, activeModel, onSelect }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  useEffect(() => {
    if (!open) return
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])
  if (!models.length) return null
  return (
    <div className="model-picker" ref={ref}>
      <button className="mp-trigger" onClick={() => setOpen(!open)}>
        <span className="mp-name">{activeModel}</span><Icons.chevronDown />
      </button>
      {open && (
        <div className="mp-dropdown">
          {models.map(m => (
            <button key={m} className={`mp-option ${m===activeModel?'active':''}`} onClick={() => { onSelect(m); setOpen(false) }}>{m}</button>
          ))}
        </div>
      )}
    </div>
  )
}

// SETTINGS MODAL
function SettingsModal({ accounts, account, onClose, onSave }) {
  const [name, setName] = useState(account?.name || '')
  const [baseUrl, setBaseUrl] = useState(account?.baseUrl || '')
  const [apiKey, setApiKey] = useState(account?.apiKey || '')
  const [modelsStr, setModelsStr] = useState((account?.models || []).join('\n'))
  const handleSave = () => {
    const models = modelsStr.split('\n').map(s=>s.trim()).filter(Boolean)
    const updated = accounts.map(a => ({ ...a }))
    if (updated[0]) Object.assign(updated[0], { name, baseUrl, apiKey, models })
    onSave(updated)
  }
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e=>e.stopPropagation()}>
        <div className="modal-head"><h2>Settings</h2><button className="sb-icon-btn" onClick={onClose}><Icons.close /></button></div>
        <div className="modal-body">
          <h3 className="sec-label">Provider</h3>
          <div className="acc-card active">
            <div className="acc-edit">
              <input value={name} onChange={e=>setName(e.target.value)} placeholder="Name" />
              <input value={baseUrl} onChange={e=>setBaseUrl(e.target.value)} placeholder="Base URL" />
              <input value={apiKey} type="password" onChange={e=>setApiKey(e.target.value)} placeholder="API Key" />
            </div>
          </div>
          <h3 className="sec-label">Models (one per line)</h3>
          <textarea className="models-textarea" value={modelsStr} onChange={e=>setModelsStr(e.target.value)} rows={4} placeholder={'tu@qwen-3.6-35b\ntu@qwen-3.5-397b'} />
        </div>
        <div className="modal-foot">
          <button className="btn btn-outline" onClick={async () => {
            const b = event.target
            b.textContent = 'Testing...'
            try {
              const r = await fetch('/api/e2e')
              const d = await r.json()
              alert('E2E ' + d.status + ' | DB:' + d.db + ' | Files:' + d.files_dir + ' | LLM:' + d.llm)
            } catch(e) { alert('E2E failed: ' + e.message) }
            finally { b.textContent = 'Run E2E Test' }
          }}>Run E2E Test</button>
          <button className="btn btn-primary" onClick={handleSave}>Save & Close</button>
        </div>
      </div>
    </div>
  )
}

/* ════════════════════════════════════════════════════════════════════
   STYLES
   ════════════════════════════════════════════════════════════════════ */

const CSS = `
/* ─ Reset ─ */
*, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }
html, body, #root { height: 100%; width: 100%; overflow: hidden; }
body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Inter', sans-serif;
  background: #0b0b0c; color: #ececec; font-size: 15px; line-height: 1.6;
  -webkit-font-smoothing: antialiased;
}
::-webkit-scrollbar { width: 5px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: #333; border-radius: 3px; }
::selection { background: #7c5dfa; color: #fff; }

/* ─ Layout ─ */
.app { display: flex; height: 100vh; width: 100vw; overflow: hidden; }

/* ═══ SIDEBAR ═══ */
.sidebar {
  width: 250px; min-width: 250px; background: #111113; border-right: 1px solid #222;
  display: flex; flex-direction: column; transition: margin .2s ease;
  z-index: 20;
}
.sidebar.collapsed { margin-left: -250px; pointer-events: none; }

.sb-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 14px 16px; border-bottom: 1px solid #1f1f1f;
}
.sb-brand { display: flex; align-items: center; gap: 9px; }
.sb-logo { color: #fff; display: flex; }
.sb-title { font-size: 15px; font-weight: 600; letter-spacing: -.2px; color: #ececec; }
.sb-icon-btn {
  background: none; border: none; color: #888; cursor: pointer;
  padding: 5px; border-radius: 6px; display: flex; align-items: center;
}
.sb-icon-btn:hover { background: #1a1a1a; color: #ddd; }

.sb-nav { display: flex; flex-direction: column; padding: 8px 8px; gap: 1px; }
.sb-nav-item {
  display: flex; align-items: center; gap: 10px; padding: 8px 12px;
  background: none; border: none; color: #aaa; cursor: pointer;
  border-radius: 8px; font-size: 13.5px; transition: all .1s;
}
.sb-nav-item:hover { background: #1a1a1a; color: #eee; }
.sb-nav-item svg { flex-shrink: 0; opacity: .8; }

.sb-section { padding: 4px 12px; }
.sb-chats { flex: 1; overflow-y: auto; min-height: 0; }
.sb-label {
  font-size: 11.5px; font-weight: 600; text-transform: uppercase;
  letter-spacing: .8px; color: #666; padding: 10px 8px 4px;
}
.sb-date-label {
  font-size: 11.5px; font-weight: 600; color: #555; padding: 10px 8px 4px;
}

.sb-chat-item {
  display: flex; align-items: center; justify-content: space-between;
  width: 100%; padding: 7px 10px; background: none; border: none;
  color: #999; cursor: pointer; border-radius: 7px; font-size: 13px;
  transition: all .1s; text-align: left;
}
.sb-chat-item:hover { background: #1a1a1a; color: #ddd; }
.sb-chat-item.active { background: #1e1e20; color: #eee; }
.sb-chat-title { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; }
.sb-chat-del {
  background: none; border: none; color: transparent; cursor: pointer;
  padding: 2px; border-radius: 4px; display: flex; flex-shrink: 0;
}
.sb-chat-item:hover .sb-chat-del { color: #666; }
.sb-chat-del:hover { color: #f44 !important; background: rgba(255,68,68,.1); }

/* ── Compact Folders ── */
.sb-folder-item {
  display: flex; align-items: center; gap: 5px; width: 100%;
  padding: 5px 8px; background: none; border: none; border-left: 3px solid transparent;
  color: #aaa; cursor: pointer; border-radius: 0 6px 6px 0; font-size: 12.5px;
  transition: all .15s;
}
.sb-folder-item:hover { background: #1a1a1a; color: #ddd; }
.folder-arrow { font-size: 9px; color: #555; width: 10px; text-align: center; flex-shrink: 0; }
.folder-emoji { font-size: 13px; flex-shrink: 0; }
.folder-name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.folder-count-badge {
  font-size: 9.5px; font-weight: 600; color: #aaa; background: #222;
  padding: 0 5px; border-radius: 8px; line-height: 16px; flex-shrink: 0;
}
.folder-actions { display: flex; gap: 1px; opacity: 0; transition: opacity .15s; flex-shrink: 0; }
.sb-folder-item:hover .folder-actions { opacity: 1; }
.sb-tiny-btn { background: none; border: none; cursor: pointer; font-size: 11px; padding: 1px 3px; border-radius: 3px; line-height: 1.4; }
.sb-tiny-btn:hover { background: #2a2a2a; }
.sb-tiny-btn.danger:hover { background: rgba(244,68,68,.2); }

/* Inline new-folder input */
.sb-new-folder-inline {
  background: #111; border: 1px solid #333; color: #ccc; font-size: 11px;
  padding: 1px 5px; border-radius: 4px; outline: none; width: 72px; margin-left: 2px;
}
.sb-new-folder-inline:focus { border-color: #f59e0b; width: 100px; }
.sb-rename-input {
  background: #111; border: 1px solid #f59e0b; color: #fff; font-size: 11.5px;
  padding: 1px 4px; border-radius: 3px; outline: none; width: 80px;
}

/* Folders section */
.sb-folders-header { display: flex; justify-content: space-between; align-items: center; padding-bottom: 2px; }
.sb-folders { max-height: 45vh; overflow-y: auto; }
.folder-row { margin-bottom: 1px; }

/* Expanded files list */
.folder-files-list {
  margin-left: 14px; padding: 2px 0; border-left: 1px solid #222;
}
.folder-upload-bar {
  display: block; padding: 4px 8px; margin: 2px 0; border: 1px dashed #333; border-radius: 5px;
  color: #555; font-size: 11px; cursor: pointer; text-align: center; transition: all .15s;
}
.folder-upload-bar:hover { border-color: #f59e0b; color: #999; }
.folder-upload-bar input[type="file"] { display: none; }
.folder-empty { color: #444; font-size: 10.5px; padding: 3px 8px; font-style: italic; }

/* File row — compact */
.folder-file-item {
  display: flex; align-items: center; gap: 4px; padding: 2px 6px; font-size: 11.5px; color: #888;
  transition: background .1s; border-radius: 3px;
}
.folder-file-item:hover { background: #1a1a1a; color: #bbb; }
.ff-icon { font-size: 12px; flex-shrink: 0; }
.ff-name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
.ff-file-actions { display: flex; gap: 2px; flex-shrink: 0; opacity: 0; transition: opacity .15s; }
.folder-file-item:hover .ff-file-actions { opacity: 1; }
.ff-move-mini {
  background: #111; border: 1px solid #222; color: #666; font-size: 9px;
  padding: 0 2px; border-radius: 3px; cursor: pointer; width: 22px; max-width: 22px;
}
.ff-move-mini:focus { border-color: #f59e0b; }
.ff-add {
  background: #f59e0b22; border: 1px solid #f59e0b44; color: #f59e0b;
  font-size: 11px; font-weight: 700; padding: 0 4px; border-radius: 3px;
  cursor: pointer; min-width: 17px; text-align: center; line-height: 17px;
}
.ff-add:hover { background: #f59e0b44; color: #fff; }
.ff-del {
  background: none; border: none; color: #555; cursor: pointer;
  font-size: 10px; padding: 0 2px; border-radius: 3px; line-height: 17px;
}
.ff-del:hover { color: #f44; background: rgba(244,68,68,.15); }

.sb-hash { color: #666; font-size: 14px; margin-right: 2px; }
.sb-empty { color: #444; font-size: 12px; padding: 12px 8px; }

.sb-user {
  display: flex; align-items: center; gap: 10px; padding: 12px 16px;
  border-top: 1px solid #1f1f1f; cursor: pointer; transition: background .1s;
}
.sb-user:hover { background: #1a1a1a; }
.sb-avatar {
  width: 30px; height: 30px; border-radius: 50%;
  background: linear-gradient(135deg, #f59e0b, #d97706);
  display: flex; align-items: center; justify-content: center;
  font-size: 13px; font-weight: 700; color: #000; flex-shrink: 0;
}
.sb-username { font-size: 13px; font-weight: 500; color: #ccc; }

/* ═══ MAIN AREA ═══ */
.main {
  flex: 1; display: flex; flex-direction: column; min-width: 0;
  background: #0b0b0c; position: relative;
}
.main.full { margin-left: 0; }

/* ─ Top Bar ─ */
.topbar {
  display: flex; align-items: center; gap: 8px; padding: 10px 20px;
  border-bottom: 1px solid #1a1a1a; background: #0b0b0c; min-height: 52px;
}
.tb-btn {
  background: none; border: none; color: #888; cursor: pointer;
  padding: 6px; border-radius: 6px; display: flex; align-items: center;
}
.tb-btn:hover { background: #1a1a1a; color: #ddd; }

.tb-model-selector {
  display: flex; align-items: center; gap: 4px;
  padding: 5px 10px 5px 12px; border-radius: 8px;
  cursor: pointer; transition: background .15s;
}
.tb-model-selector:hover { background: #161618; }
.tb-model-name { font-size: 14px; font-weight: 500; color: #ececec; }
.tb-model-selector svg { color: #888; }
.tb-plus {
  font-size: 16px; color: #666; margin-left: 4px; font-weight: 300;
}
.tb-plus:hover { color: #aaa; }

.tb-avatar {
  width: 32px; height: 32px; border-radius: 50%;
  background: linear-gradient(135deg, #f59e0b, #d97706);
  display: flex; align-items: center; justify-content: center;
  font-size: 13px; font-weight: 700; color: #000; cursor: pointer;
}

/* ─ Content Area ─ */
.content { flex: 1; display: flex; flex-direction: column; overflow: hidden; }

/* ─ Welcome Screen ─ */
.welcome {
  flex: 1; display: flex; flex-direction: column; align-items: center;
  justify-content: center; padding: 40px 20px; gap: 28px;
}
.welcome-logo {
  width: 48px; height: 48px; color: #fff; animation: float 3s ease-in-out infinite;
}
@keyframes float {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-6px); }
}
.welcome-model { font-size: 26px; font-weight: 400; color: #ccc; letter-spacing: -.3px; }

.welcome-input-wrap { width: 100%; max-width: 720px; }
.welcome-input-box {
  position: relative; display: flex; align-items: flex-end;
  background: #18181b; border: 1px solid #2a2a2e; border-radius: 16px;
  padding: 12px 14px; transition: border-color .2s;
}
.welcome-input-box:focus-within { border-color: #555; }
.wi-textarea {
  flex: 1; background: none; border: none; outline: none; resize: none;
  color: #ececec; font-family: inherit; font-size: 15px; line-height: 1.5;
  max-height: 200px; min-height: 24px; padding: 2px 4px;
}
.wi-textarea::placeholder { color: #555; }
.wi-actions-left, .wi-actions-right { display: flex; align-items: center; gap: 4px; flex-shrink: 0; }
.wi-action-btn {
  background: none; border: none; color: #666; cursor: pointer;
  padding: 6px; border-radius: 6px; display: flex; align-items: center;
}
.wi-action-btn:hover { color: #bbb; background: #222; }
.wi-send-btn {
  background: none; border: none; color: #888; cursor: pointer;
  padding: 6px; border-radius: 6px; display: flex; align-items: center;
}
.wi-send-btn:not(:disabled):hover { color: #fff; }
.wi-send-btn:disabled { color: #333; cursor: default; }
.wi-send-btn.stop { color: #f44; }

/* ── Autocomplete Dropdown ── */
.ac-dropdown {
  position: absolute; bottom: 100%; left: 0; right: 0;
  max-height: 220px; overflow-y: auto;
  background: #1a1a1e; border: 1px solid #333; border-radius: 10px;
  box-shadow: 0 8px 32px rgba(0,0,0,.5); z-index: 50;
  padding: 4px 0; margin-bottom: 4px;
}
.ac-item {
  display: flex; align-items: center; gap: 8px;
  padding: 7px 12px; cursor: pointer; font-size: 13px; color: #bbb;
  transition: background .1s;
}
.ac-item:hover, .ac-item.active { background: #252530; color: #fff; }
.ac-icon { font-size: 14px; flex-shrink: 0; }
.ac-name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 500; }
.ac-folder { font-size: 11px; color: #666; flex-shrink: 0; }
/* In chat input (bottom bar), position above */
.chat-input-box + .ac-dropdown,
.chat-input-box ~ .ac-dropdown { bottom: 100%; left: -4px; right: -4px; }

/* ─ Suggestions ─ */
.suggestions { max-width: 720px; width: 100%; display: flex; flex-direction: column; gap: 8px; }
.suggestions-header {
  display: flex; align-items: center; gap: 6px; font-size: 12px;
  color: #666; font-weight: 500; padding: 0 4px;
}
.suggestions-header svg { color: #888; }
.suggestion-chips { display: flex; gap: 8px; flex-wrap: wrap; }
.suggestion-chip {
  display: flex; flex-direction: column; align-items: flex-start; gap: 2px;
  padding: 12px 16px; background: #18181b; border: 1px solid #252529;
  border-radius: 12px; cursor: pointer; transition: all .15s; text-align: left;
}
.suggestion-chip:hover { background: #1f1f23; border-color: #333; }
.sug-title { font-size: 13.5px; font-weight: 500; color: #ddd; }
.sug-sub { font-size: 11.5px; color: #777; }

/* ─ Messages (chat view) ─ */
.messages {
  flex: 1; overflow-y: auto; padding: 24px 20px;
  display: flex; flex-direction: column; gap: 2px;
}
.msg-row { display: flex; gap: 12px; max-width: 800px; width: 100%; margin: 0 auto; animation: fadeIn .2s ease; }
.msg-row.user { flex-direction: row-reverse; }
@keyframes fadeIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }

.msg-avatar {
  width: 28px; height: 28px; border-radius: 50%; background: #1a1a1a;
  border: 1px solid #2a2a2a; display: flex; align-items: center;
  justify-content: center; flex-shrink: 0; margin-top: 3px; color: #888;
}
.msg-bubble {
  line-height: 1.7; word-break: break-word; overflow-wrap: break-word;
  font-size: 14.5px; color: #ddd; max-width: fit-content;
}
.msg-bubble pre {
  background: #141416; border: 1px solid #222; border-radius: 10px;
  padding: 14px 16px; margin: 10px 0; overflow-x: auto;
}
.msg-bubble code { font-family: 'JetBrains Mono','Fira Code',monospace; font-size: 13px; }
.msg-bubble code:not(pre code) { background: #222; padding: 2px 6px; border-radius: 4px; }
.msg-bubble strong { font-weight: 600; color: #eee; }
.msg-bubble em { font-style: italic; }
.msg-bubble a { color: #7c5dfa; word-break: break-all; }

.user-bubble {
  background: #1e2028; padding: 10px 16px; border-radius: 16px;
  border-bottom-right-radius: 4px;
}

.error-bubble {
  background: rgba(255,68,68,.08); border: 1px solid rgba(255,68,68,.15);
  color: #f88; padding: 10px 16px; border-radius: 12px;
}

.typing-dots { display: inline-flex; gap: 4px; vertical-align: middle; }
.typing-dots i {
  width: 6px; height: 6px; border-radius: 50%; background: #666;
  animation: bounce 1.4s infinite both; display: inline-block;
}
.typing-dots i:nth-child(2) { animation-delay: .16s; }
.typing-dots i:nth-child(3) { animation-delay: .32s; }
@keyframes bounce { 0%,80%,100% { transform: scale(.6); opacity: .4; } 40% { transform: scale(1); opacity: 1; } }
@keyframes spin { to { transform: rotate(360deg); } }

/* ─ Chat Input Bar ─ */
.chat-input-area {
  padding: 12px 20px 20px; background: #0b0b0c;
}
.chat-input-box {
  max-width: 800px; margin: 0 auto; position: relative;
  display: flex; align-items: flex-end; background: #18181b;
  border: 1px solid #2a2a2e; border-radius: 16px; padding: 8px 10px;
  transition: border-color .2s;
}
.chat-input-box:focus-within { border-color: #555; }
.ci-textarea {
  flex: 1; background: none; border: none; outline: none; resize: none;
  color: #ececec; font-family: inherit; font-size: 14.5px; line-height: 1.5;
  max-height: 200px; min-height: 24px; padding: 4px 6px;
}
.ci-textarea::placeholder { color: #555; }
.ci-actions { display: flex; align-items: center; gap: 2px; flex-shrink: 0; }
.ci-action-btn {
  background: none; border: none; color: #666; cursor: pointer;
  padding: 6px; border-radius: 6px; display: flex; align-items: center;
}
.ci-action-btn:hover { color: #bbb; background: #222; }
.ci-send-btn {
  background: none; border: none; color: #888; cursor: pointer;
  padding: 6px; border-radius: 6px; display: flex; align-items: center;
}
.ci-send-btn:not(:disabled):hover { color: #fff; }
.ci-send-btn:disabled { color: #333; cursor: default; }
.ci-send-btn.stop { color: #f44; }

/* ── Floating Stop Button (global, always visible during streaming) ── */
.floating-stop {
  position: fixed;
  top: 16px;
  right: 80px;
  z-index: 100;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  background: rgba(244,68,68,.15);
  border: 1px solid rgba(244,68,68,.3);
  border-radius: 10px;
  color: #f44;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  backdrop-filter: blur(8px);
  animation: stopPulse 1.5s ease-in-out infinite;
  transition: all .2s;
}
.floating-stop:hover {
  background: rgba(244,68,68,.25);
  border-color: rgba(244,68,68,.5);
  color: #ff6666;
}
@keyframes stopPulse {
  0%, 100% { opacity: 1; }
  50% { opacity: .6; }
}

/* ── Attachment Bar ── */
.attachment-bar {
  display: flex; gap: 8px; flex-wrap: wrap;
  max-width: 800px; margin: 0 auto 8px; padding: 0 4px;
}
.attachment-thumb {
  position: relative; display: flex; flex-direction: column; align-items: center;
  width: 72px; height: 72px; border-radius: 10px; overflow: hidden;
  background: #1a1a1c; border: 1px solid #2a2a2e;
}
.attachment-thumb img {
  width: 100%; height: 56px; object-fit: cover;
}
.att-name {
  font-size: 9px; color: #666; text-align: center;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  width: 100%; padding: 0 3px; line-height: 1.2;
}
.att-remove {
  position: absolute; top: 3px; right: 3px;
  background: rgba(0,0,0,.65); border: none; border-radius: 50%;
  color: #ccc; cursor: pointer; padding: 2px; display: flex;
  align-items: center; justify-content: center; opacity: 0;
  transition: opacity .15s; width: 18px; height: 18px;
}
.attachment-thumb:hover .att-remove { opacity: 1; }
.att-remove:hover { background: rgba(255,68,68,.7); color: #fff; }
.att-remove svg { width: 10px; height: 10px; }

/* ── Message Images ── */
.msg-image {
  max-width: 280px; max-height: 280px; border-radius: 12px;
  margin-bottom: 8px; object-fit: contain;
}
.msg-bubble.user-bubble .msg-image { margin-top: 4px; }

/* ── Tool Calls (inline in assistant message) ── */
.tool-calls {
  display: flex; flex-direction: column; gap: 4px;
  margin-bottom: 8px; padding: 8px 10px;
  background: rgba(255,255,255,.04); border-radius: 8px;
  border-left: 3px solid #555;
}
.tool-call {
  display: inline-flex; align-items: center; gap: 6px;
  font-size: 12.5px; color: #aaa; line-height: 1.6;
}
.tool-call.done { color: #8bc34a; }
.tool-call.error { color: #f44; }
.tool-icon { font-size: 14px; }
.tool-name { font-weight: 600; font-family: var(--mono, monospace); }
.tool-spinner { animation: spin .8s linear infinite; }
.tool-status-ok { color: #8bc34a; font-weight: bold; }
.tool-status-err { color: #f44; font-weight: bold; }
.tool-args { color: #777; max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-style: italic; }

/* ═══ MODAL ═══ */
.modal-overlay {
  position: fixed; inset: 0; background: rgba(0,0,0,.65);
  backdrop-filter: blur(4px); display: flex; align-items: center;
  justify-content: center; z-index: 100; animation: fadeIn .15s ease;
}
.modal {
  background: #18181b; border: 1px solid #2a2a2e; border-radius: 16px;
  width: 92%; max-width: 560px; max-height: 80vh;
  display: flex; flex-direction: column;
  box-shadow: 0 20px 60px rgba(0,0,0,.5);
}
.modal-head {
  display: flex; align-items: center; justify-content: space-between;
  padding: 18px 22px; border-bottom: 1px solid #222;
}
.modal-head h2 { font-size: 16px; font-weight: 600; }
.modal-body { flex: 1; overflow-y: auto; padding: 20px 22px; }
.modal-foot { padding: 16px 22px; border-top: 1px solid #222; display: flex; justify-content: flex-end; }

.sec-label {
  font-size: 12px; font-weight: 600; text-transform: uppercase;
  letter-spacing: .8px; color: #666; margin-bottom: 12px;
}

.acc-card {
  border: 1px solid #252529; border-radius: 10px; margin-bottom: 8px;
  overflow: hidden; transition: border-color .15s;
}
.acc-card.active { border-color: #7c5dfa; }
.acc-card:hover { border-color: #3a3a3e; }
.acc-view { padding: 14px 16px; cursor: pointer; transition: background .1s; }
.acc-view:hover { background: #1f1f22; }
.acc-view strong { display: block; font-size: 14px; color: #eee; margin-bottom: 4px; }
.acc-detail { display: block; font-size: 11.5px; color: #777; font-family: 'JetBrains Mono','Fira Code',monospace; line-height: 1.6; }

.acc-edit { padding: 14px 16px; display: flex; flex-direction: column; gap: 10px; }
.acc-edit input {
  background: #0b0b0c; border: 1px solid #2a2a2e; color: #ececec;
  padding: 9px 12px; border-radius: 8px; font-size: 13px; font-family: inherit;
  outline: none; transition: border-color .15s;
}
.acc-edit input:focus { border-color: #7c5dfa; }
.acc-edit input::placeholder { color: #555; }
.acc-edit-btns { display: flex; gap: 8px; justify-content: flex-end; }

.btn {
  padding: 7px 16px; border-radius: 8px; border: none; font-size: 13px;
  font-weight: 500; cursor: pointer; transition: all .15s;
}
.btn-primary { background: #7c5dfa; color: #fff; }
.btn-primary:hover { background: #6b4ee6; }
.btn-danger { background: transparent; color: #f44; border: 1px solid #f44; }
.btn-danger:hover { background: rgba(255,68,68,.1); }
.btn-outline { background: transparent; color: #888; border: 1px dashed #444; }
.btn-outline:hover { color: #ccc; border-color: #666; }

/* ═══ RESPONSIVE ═══ */
@media (max-width: 768px) {
  .sidebar { position: absolute; height: 100%; z-index: 20; box-shadow: 8px 0 30px rgba(0,0,0,.4); }
  .sidebar.collapsed { margin-left: -250px; }
  .messages { padding: 16px; }
  .chat-input-area { padding: 8px 12px 14px; }
  .welcome { padding: 24px 16px; }
  .suggestion-chip { flex: 1 1 calc(50% - 4px); min-width: 140px; }
}

/* MODEL PICKER */
.model-picker{position:relative}
.mp-trigger{display:flex;align-items:center;gap:4px;padding:5px 10px 5px 12px;border-radius:8px;cursor:pointer;background:none;border:1px solid transparent;color:#ececec;font-size:14px;font-weight:500;transition:all .15s}.mp-trigger:hover{background:#161618;border-color:#2a2a2e}
.mp-name{max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.mp-trigger svg{color:#888;flex-shrink:0}
.mp-dropdown{position:absolute;top:100%;left:0;margin-top:4px;min-width:220px;background:#1a1a1e;border:1px solid #333;border-radius:10px;box-shadow:0 8px 32px rgba(0,0,0,.5);z-index:50;padding:4px 0;max-height:300px;overflow-y:auto}
.mp-option{display:block;width:100%;padding:8px 14px;background:none;border:none;text-align:left;color:#bbb;cursor:pointer;font-size:13px;font-family:inherit;transition:background .08s}.mp-option:hover{background:#252530;color:#fff}.mp-option.active{color:#7c5dfa;background:rgba(124,93,250,.1)}
.models-textarea{width:100%;background:#0b0b0c;border:1px solid #2a2a2e;color:#ececec;padding:10px 12px;border-radius:8px;font-family:'JetBrains Mono','Fira Code',monospace;font-size:12.5px;line-height:1.6;resize:vertical;outline:none;transition:border-color .15s}.models-textarea:focus{border-color:#7c5dfa}.models-textarea::placeholder{color:#555}
`

if (!document.getElementById('aiui-css')) {
  const el = document.createElement('style'); el.id = 'aiui-css'; el.textContent = CSS
  document.head.appendChild(el)
}
