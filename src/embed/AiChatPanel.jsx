// ════════════════════════════════════════════════════════════════════
// AiChatPanel — corner-Variante: Launcher-Bubble → Slide-Panel.
//
// Wiederverwendet, nicht geforkt (ADR-0006 D4): UserEntry/AssistantEntry/
// ErrorEntry kommen unverändert aus ../components/StreamEntry.jsx — dieselbe
// Entry-Form wie die Haupt-App. Bewusste Teilmenge: nur Chat (Entries +
// Tool-Call-Karten im AssistantEntry), kein File-Browser/Settings/Sidebar.
// ════════════════════════════════════════════════════════════════════
import { useState, useRef, useEffect } from 'react'
import { MessageCircle, X, SendHorizontal } from 'lucide-react'
import { UserEntry, AssistantEntry, ErrorEntry } from '../components/StreamEntry.jsx'
import { useWidgetChat } from './useWidgetChat.js'

export function AiChatPanel({ transport, launcherLabel = 'Chat', controller, onTheme }) {
  const chat = useWidgetChat({
    transport,
    onTheme,
    onSettled: (text) => controller?.onSettled?.(text),
  })
  const [text, setText] = useState('')
  const ref = useRef(null)
  const scrollRef = useRef(null)

  // Host-Bridge: el.open()/close()/send() steuert dieselbe Instanz.
  useEffect(() => {
    if (!controller) return
    controller.open = () => chat.setOpen(true)
    controller.close = () => chat.setOpen(false)
    controller.send = (t) => chat.send(t)
  })

  // Smart autoscroll wie die Haupt-App: bei offenem Panel unten kleben.
  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [chat.entries, chat.current, chat.open])

  const submit = () => {
    const t = text.trim()
    if (!t) return
    chat.send(t)
    setText('')
    if (ref.current) ref.current.style.height = 'auto'
  }

  return (
    <>
      {chat.open && (
        <div className="aiw-panel">
          <header className="aiw-head">
            <span className="aiw-title">{launcherLabel}</span>
            <span className="aiw-status" title={chat.sessionModel || ''}>
              {chat.notice ? '⚠' : chat.streaming ? '●' : chat.sessionModel ? chat.sessionModel.split('@').pop() : ''}
            </span>
            <button className="aiw-x" onClick={() => chat.setOpen(false)} title="Close"><X size={15} /></button>
          </header>
          <div className="aiw-body" ref={scrollRef}>
            {chat.greeting && <div className="aiw-greeting">{chat.greeting}</div>}
            {chat.notice && <div className="aiw-notice">{chat.notice}</div>}
            {chat.entries.map((e, i) =>
              e.role === 'user' ? <UserEntry key={i} text={e.text} images={e.images} />
              : e.role === 'error' ? <ErrorEntry key={i} text={e.text} />
              : <AssistantEntry key={i} entry={e} isStreaming={false} />
            )}
            {chat.current && <AssistantEntry entry={chat.current} isStreaming />}
            {!chat.entries.length && !chat.current && !chat.greeting && !chat.notice && (
              <div className="aiw-greeting">Ask anything…</div>
            )}
          </div>
          <div className="aiw-inputrow">
            <textarea
              ref={ref}
              className="aiw-input"
              rows={1}
              value={text}
              placeholder={chat.streaming ? 'Queued after current turn…' : 'Ask…'}
              onChange={e => {
                setText(e.target.value)
                e.target.style.height = 'auto'
                e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px'
              }}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit() }
                if (e.key === 'Escape') chat.setOpen(false)
              }}
            />
            <button className="aiw-send" onClick={submit} title="Send" disabled={!text.trim()}>
              <SendHorizontal size={15} />
            </button>
          </div>
        </div>
      )}
      {!chat.open && (
        <button className="aiw-launcher" onClick={() => chat.setOpen(true)} title={launcherLabel}>
          <MessageCircle size={20} />
        </button>
      )}
    </>
  )
}
