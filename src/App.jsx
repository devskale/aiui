import { useState, useCallback, useEffect, useRef } from 'react'

import { DEFAULT_ACCOUNTS, apiGet, apiPost, apiPut, apiDel, lsGet, lsSet } from './lib/api'
import { Sidebar } from './components/Sidebar'
import { MainArea } from './components/MainArea'
import { SettingsModal } from './components/SettingsModal'

// ════════════════════════════════════════════════════════════════════
// APP — root component, state management, data loading
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
      } catch (e) { console.error('Failed to load:', e) }
      setReady(true)
    })()
  }, [])

  // ─── Persist active model, validate ───
  useEffect(() => {
    if (!ready || !account) return
    lsSet('aiui_active_model', activeModel)
    const models = account.models || []
    if (models.length && !models.includes(activeModel)) setActiveModel(models[0])
  }, [activeModel, ready, account])

  const createChat = useCallback(async () => {
    const c = await apiPost('/chats', { account_id: account?.id || 'default', model: activeModel })
    setChats(prev => [
      { id: c.id, title: c.title, messages: [], created_at: Date.now() / 1000, updated_at: Date.now() / 1000 },
      ...prev,
    ])
    setActiveChatId(c.id)
  }, [account, activeModel])

  const deleteChat = useCallback(async (id) => {
    await apiDel(`/chats/${id}`)
    setChats(prev => prev.filter(c => c.id !== id))
    if (activeChatId === id) setActiveChatId(null)
  }, [activeChatId])

  const updateChat = useCallback(async (id, updates) => {
    setChats(prev => prev.map(c => c.id === id ? { ...c, ...updates } : c))
    try { await apiPut(`/chats/${id}`, updates) }
    catch (e) { console.error('Save chat failed:', e) }
  }, [])

  return (
    <div className="app">
      <Sidebar
        open={sidebarOpen} onToggle={() => setSidebarOpen(!sidebarOpen)}
        chats={chats} activeChatId={activeChatId}
        onSelectChat={setActiveChatId} onNewChat={createChat} onDeleteChat={deleteChat}
        onRenameChat={(id, title) => updateChat(id, { title })}
        account={account} onOpenSettings={() => setShowSettings(true)}
        folders={folders} onFoldersChange={setFolders}
        onInsertFile={inputInsertRef}
      />
      <MainArea
        sidebarOpen={sidebarOpen} onToggleSidebar={() => setSidebarOpen(!sidebarOpen)}
        chat={chats.find(c => c.id === activeChatId)}
        account={account} activeModel={activeModel} onSetActiveModel={setActiveModel}
        onUpdateChat={updateChat} onNewChat={createChat}
        onOpenSettings={() => setShowSettings(true)}
        ready={ready} inputInsertRef={inputInsertRef}
      />
      {showSettings && (
        <SettingsModal
          accounts={accounts} account={account} activeModel={activeModel}
          onSetActiveModel={setActiveModel}
          onClose={() => setShowSettings(false)}
          onSave={async (acs) => {
            setAccounts(acs)
            try { await apiPut('/accounts', acs) } catch (e) { console.error('Save accounts failed:', e) }
          }}
        />
      )}
    </div>
  )
}
