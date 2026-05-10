import { useState, useEffect, useRef } from 'react'

import { Icons } from '../lib/icons'
import { IMG_TYPES, SUGGESTIONS, fileToDataUrl } from '../lib/utils'
import { apiGet } from '../lib/api'
import { useStreamChat } from '../hooks/useStreamChat'
import { Message } from './Message'
import { ChatInput, WelcomeInput, AttachmentBar } from './ChatInput'
import { ModelPicker } from './ModelPicker'

// ════════════════════════════════════════════════════════════════════
// MAIN AREA
// ════════════════════════════════════════════════════════════════════
export function MainArea({ sidebarOpen, onToggleSidebar, chat, account, activeModel,
  onSetActiveModel, onUpdateChat, onNewChat, onOpenSettings, ready, inputInsertRef }) {
  const [messages, setMessages] = useState(chat?.messages || [])
  const [input, setInput] = useState('')
  const [attachments, setAttachments] = useState([])
  const [webOn, setWebOn] = useState(false)
  const endRef = useRef(null)
  const inputRef = useRef(null)
  const fileInputRef = useRef(null)

  const { streaming, setStreaming, stream, abort } = useStreamChat()

  // ─── # Autocomplete ───
  const [acShow, acSetShow] = useState(false)
  const [acItems, acSetItems] = useState([])
  const [acIndex, acSetIndex] = useState(0)
  const acTimer = useRef(null)

  const getAcQuery = (text) => {
    const m = text.match(/#(\S*)$/)
    return m ? { query: m[1], start: text.length - m[0].length } : null
  }

  const handleInputChange = (val) => {
    setInput(val)
    const info = getAcQuery(val)
    if (!info?.query) { acSetShow(false); return }
    clearTimeout(acTimer.current)
    acTimer.current = setTimeout(async () => {
      try {
        const files = await apiGet(`/library/search?q=${encodeURIComponent(info.query)}&limit=12`)
        acSetItems(files); acSetIndex(0); acSetShow(files.length > 0)
      } catch { acSetShow(false) }
    }, 200)
  }

  const acSelect = (name) => {
    const info = getAcQuery(input)
    if (info) setInput(input.slice(0, info.start) + '#' + name + ' ')
    acSetShow(false)
    setTimeout(() => inputRef.current?.focus(), 30)
  }

  const acHandleKey = (e) => {
    if (!acShow) return false
    if (e.key === 'ArrowDown') { e.preventDefault(); acSetIndex(i => Math.min(i + 1, acItems.length - 1)); return true }
    if (e.key === 'ArrowUp') { e.preventDefault(); acSetIndex(i => Math.max(i - 1, 0)); return true }
    if (e.key === 'Enter' && acItems[acIndex]) { e.preventDefault(); acSelect(acItems[acIndex].original_name); return true }
    if (e.key === 'Escape') { e.preventDefault(); acSetShow(false); return true }
    return false
  }

  // Expose insert function for Sidebar #file injection
  useEffect(() => {
    if (inputInsertRef) {
      inputInsertRef.current = (text) => {
        setInput(prev => prev ? prev + ' #' + text : '#' + text)
        setTimeout(() => inputRef.current?.focus(), 50)
      }
    }
  }, [inputInsertRef])

  const llmConfig = account
    ? { baseUrl: account.baseUrl, apiKey: account.apiKey, model: activeModel } : null

  useEffect(() => { setMessages(chat?.messages || []); setInput(''); setAttachments([]) }, [chat?.id])
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  // ─── Attachments ───
  const addAttachments = async (files) => {
    for (const f of files) {
      if (!IMG_TYPES.includes(f.type)) continue
      try {
        const dataUrl = await fileToDataUrl(f)
        setAttachments(prev => [...prev,
          { id: Date.now().toString(36) + Math.random().toString(36).slice(2), file: f, dataUrl, name: f.name }])
      } catch (err) { alert(err.message) }
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
    addAttachments(Array.from(e.dataTransfer?.files || []).filter(f => IMG_TYPES.includes(f.type)))
  }

  // ─── Build user content blocks from text + image attachments ───
  const buildUserContent = (text, imgs) => {
    const blocks = []
    if (text && text !== '/') blocks.push({ type: 'text', text })
    for (const img of imgs) blocks.push({ type: 'image_url', image_url: { url: img.dataUrl } })
    return blocks
  }

  // ─── Commit a user message and stream the response ───
  const commitAndStream = async (userContent, title) => {
    const userMsg = {
      role: 'user',
      content: userContent.length === 1 && userContent[0].type === 'text'
        ? userContent[0].text : userContent,
    }
    const updated = [...messages, userMsg]
    setMessages(updated)
    if (updated.length === 1) {
      const t = (title || '📷 Image').slice(0, 50)
      onUpdateChat(chat.id, { title: t + (title && title.length > 50 ? '...' : '') })
    }
    setInput(''); setAttachments([]); setStreaming(true)
    await stream({ messages: updated, onUpdateMessages: setMessages, chatId: chat.id, onUpdateChat, llmConfig, webSearch: webOn })
  }

  // ─── Send ───
  const sendMessage = async (content, imgs = attachments) => {
    if ((!content.trim() || content.trim() === '/') && imgs.length === 0) return
    if (!chat) { onNewChat(); return }

    let finalContent = content.trim()

    // Resolve #filename references
    if (finalContent.includes('#')) {
      try {
        const res = await fetch('/api/resolve-references', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: finalContent }),
        })
        if (res.ok) {
          const data = await res.json()
          if (data.content && Array.isArray(data.content) &&
              data.content.some(b => b.type !== 'text' || b.text !== finalContent)) {
            // Use resolved blocks + attachments
            const blocks = data.content
              .filter(b => b.type === 'image_url' || (b.type === 'text' && b.text.trim()))
            for (const img of imgs) blocks.push({ type: 'image_url', image_url: { url: img.dataUrl } })
            await commitAndStream(blocks, finalContent)
            return
          }
        }
      } catch (e) { console.warn('Resolve refs failed:', e) }
      finalContent = finalContent.replace(/#[\w\-. ]+/g, '`$&`')
    }

    // Normal send
    await commitAndStream(buildUserContent(finalContent, imgs), finalContent)
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(input) }
  }

  if (!llmConfig || !ready) {
    return (
      <main className="main">
        <div className="content" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1 }}>
          <span style={{ color: '#555' }}>Loading...</span>
        </div>
      </main>
    )
  }

  const inputProps = {
    value: input, onChange: handleInputChange,
    onSend: () => sendMessage(input),
    onKeyDown: e => { if (!acHandleKey(e)) handleKeyDown(e) },
    streaming, onStop: abort,
    onAttachClick: () => fileInputRef.current?.click(),
    webOn, toggleWeb: () => setWebOn(prev => !prev),
    acShow, acItems, acIndex, acSetIndex, acSelect,
  }

  return (
    <main className={`main ${!sidebarOpen ? 'full' : ''}`}
      onPaste={handlePaste} onDrop={handleDrop} onDragOver={e => e.preventDefault()}>
      <input ref={fileInputRef} type="file" accept="image/*" multiple style={{ display: 'none' }}
        onChange={e => { addAttachments(Array.from(e.target.files || [])); e.target.value = '' }} />

      <header className="topbar">
        {!sidebarOpen && <button className="tb-btn" onClick={onToggleSidebar}><Icons.panelLeft /></button>}
        <ModelPicker models={account?.models || []} activeModel={activeModel} onSelect={onSetActiveModel} />
        <div style={{ flex: 1 }} />
        <button className="tb-btn" onClick={onOpenSettings}><Icons.settings /></button>
      </header>

      <div className="content">
        {streaming && (
          <button className="floating-stop" onClick={abort} title="Stop generating">
            <Icons.stop /><span>Stop</span>
          </button>
        )}

        {!chat ? (
          <div className="welcome">
            <div className="welcome-logo"><Icons.logo /></div>
            <h1 className="welcome-model">{activeModel}</h1>
            <div className="welcome-input-wrap">
              {attachments.length > 0 && <AttachmentBar attachments={attachments} onRemove={removeAttachment} />}
              <WelcomeInput ref={inputRef} {...inputProps} />
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
          <>
            <div className="messages">
              {messages.map((msg, i) => <Message key={i} msg={msg} />)}
              <div ref={endRef} />
            </div>
            <div className="chat-input-area">
              {attachments.length > 0 && <AttachmentBar attachments={attachments} onRemove={removeAttachment} />}
              <ChatInput ref={inputRef} {...inputProps} />
            </div>
          </>
        )}
      </div>
    </main>
  )
}
