import { useState, useRef, useEffect, useCallback } from 'react'
import { useAgentEvents } from './hooks/useAgentEvents'
import { useAttachments } from './hooks/useAttachments'
import { useHashRoute } from './hooks/useHashRoute'
import { apiUrl } from './lib/api'
import { flattenModels, isModelAllowed, getAllowedModels } from './lib/models'
import { Sidebar } from './components/Sidebar'
import { ModelPicker } from './components/ModelPicker'
import { CommandPanel } from './components/CommandPanel'
import { InputBar } from './components/InputBar'
import { StatsFooter } from './components/StatsFooter'
import { ThinkingPicker } from './components/ThinkingPicker'
import { EmptyState } from './components/EmptyState'
import { ReleaseNotes } from './components/ReleaseNotes'
import { SettingsPanel } from './components/SettingsPanel'
import { UserEntry, AssistantEntry, ErrorEntry } from './components/StreamEntry'
import { Folder, Clock } from 'lucide-react'

// Format an elapsed duration (ms) as a single largest-unit token.
// Ladder: <1m → m → h → d → w → mo  (only the largest unit is shown).
function formatUptime(ms) {
  if (!ms || ms < 0) ms = 0
  const m = Math.floor(ms / 60000)
  const h = Math.floor(m / 60)
  const d = Math.floor(h / 24)
  const w = Math.floor(d / 7)
  const mo = Math.floor(d / 30)
  if (mo > 0) return `${mo}mo`
  if (w > 0) return `${w}w`
  if (d > 0) return `${d}d`
  if (h > 0) return `${h}h`
  if (m > 0) return `${m}m`
  return '<1m'
}

export default function App() {
  const { entries, current, steerQueue, streaming, connected, sessionAlive, sessionModel, sessionId, sessionCwd, sessionCwdShort, sessionStartedAt, sessionStats, thinkingLevel, isCompacting, autoCompactionEnabled, sendPrompt, sendSteer, abortAgent, startNewChat, dispatch } = useAgentEvents()
  const { attachments, addFiles, remove: removeAttachment, clear: clearAttachments, buildPayload } = useAttachments()
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [showModelPicker, setShowModelPicker] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [sessionRefresh, setSessionRefresh] = useState(0)
  const { route, navigate } = useHashRoute()
  const [model, setModel] = useState('')
  const endRef = useRef(null)
  const scrollContainerRef = useRef(null)
  const stickToBottomRef = useRef(true)  // stick to bottom unless the user scrolled up
  const [dragOver, setDragOver] = useState(false)
  const [now, setNow] = useState(() => Date.now())

  // Re-check once a minute — the uptime shows only the largest unit (w/d/h/m),
  // so a 1-minute tick is enough to keep it current.
  useEffect(() => {
    if (!sessionAlive || !sessionStartedAt) return
    const id = setInterval(() => setNow(Date.now()), 60000)
    return () => clearInterval(id)
  }, [sessionAlive, sessionStartedAt])

  // Fetch current model on mount — respect the allow-list from settings
  useEffect(() => {
    fetch(apiUrl('/api/models'))
      .then(r => r.json())
      .then(data => {
        const flat = flattenModels(data)
        const allowed = getAllowedModels()
        const visible = flat.filter(m => isModelAllowed(m, allowed))
        const preferred = visible.find(m => m === 'amd-local@tu@qwen-3.5-397b')
        setModel(preferred || visible[0] || '')
      })
      .catch(() => {})
  }, [showSettings])

  // Auto-scroll only when the user is near the bottom.
  // Scrolling up to read pauses auto-scroll; scrolling back down resumes it.
  useEffect(() => {
    if (stickToBottomRef.current) {
      endRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [entries, current])

  const handleScroll = useCallback(() => {
    const el = scrollContainerRef.current
    if (!el) return
    const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
    stickToBottomRef.current = distFromBottom < 80  // resume only when near bottom
  }, [])

  // Global drag/drop
  const handleDragOver = useCallback((e) => { e.preventDefault(); setDragOver(true) }, [])
  const handleDragLeave = useCallback(() => setDragOver(false), [])
  const handleDrop = useCallback((e) => {
    e.preventDefault()
    setDragOver(false)
    const files = Array.from(e.dataTransfer?.files || [])
    if (files.length) addFiles(files)
  }, [addFiles])

  const handleSend = async (text) => {
    const payload = buildPayload()
    await sendPrompt(text, payload)
    clearAttachments()
  }

  const handleSteer = async (text) => {
    const payload = buildPayload()
    await sendSteer(text, payload)
    clearAttachments()
  }

  const handleSwitchSession = async (path) => {
    await fetch(apiUrl('/api/session/switch'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path }),
    })
    setSessionRefresh(n => n + 1)
  }

  const handleNewChat = async () => {
    await startNewChat()
    setSessionRefresh(n => n + 1)
  }

  const handleCompact = async () => {
    await fetch(apiUrl('/api/compact'), { method: 'POST' }).catch(() => {})
  }

  const hasContent = entries.length > 0 || current

  const copyEntry = (el) => {
    // Clone node, strip UI chrome, extract clean textContent
    const clone = el.cloneNode(true)
    clone.querySelectorAll('.tc-line, .think-line, .entry-streaming, .copy-btn, .copy-entry').forEach(n => n.remove())
    let text = clone.textContent || ''
    text = text.replace(/[ \t]+/g, ' ').replace(/\s+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
    navigator.clipboard.writeText(text)
  }

  return (
    <div className="app" onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}>
      {dragOver && <div className="drop-zone"><span>Drop files here</span></div>}

      <Sidebar
        open={sidebarOpen}
        onToggle={() => setSidebarOpen(!sidebarOpen)}
        connected={connected}
        sessionAlive={sessionAlive}
        sessionId={sessionId}
        onNewChat={handleNewChat}
        onSwitchSession={handleSwitchSession}
        onShowReleaseNotes={() => navigate('releases')}
        onShowSettings={() => setShowSettings(true)}
        refreshTrigger={sessionRefresh}
      />

      <main className={`main ${!sidebarOpen ? 'full' : ''}`}>
        <header className="topbar">
          {!sidebarOpen && (
            <button className="tb-btn" onClick={() => setSidebarOpen(true)}>☰</button>
          )}
          <button className="tb-model" onClick={() => setShowModelPicker(true)}>
            {connected && sessionAlive && <span className="status-dot alive" title="Session alive" />}
            {sessionModel || model || 'select model'}
          </button>
          <ThinkingPicker thinkingLevel={thinkingLevel} sessionAlive={sessionAlive} />
          <div className="tb-session">
            {sessionCwd && (
              <span className="tb-pill" title={sessionCwd}>
                <Folder size={13} />
                <span className="tb-pill-text">{sessionCwdShort || sessionCwd}</span>
              </span>
            )}
            {sessionAlive && sessionStartedAt && (
              <span className="tb-pill" title="Agent uptime">
                <Clock size={13} />
                <span className="tb-pill-text">{formatUptime(now - sessionStartedAt)}</span>
              </span>
            )}
          </div>
          <div style={{ flex: 1 }} />
        </header>

        <div className="content" ref={scrollContainerRef} onScroll={handleScroll}>
          {hasContent ? (
            <div className="entries">
              {entries.map((entry, i) => {
                if (entry.role === 'user') return <UserEntry key={i} text={entry.text} onCopy={copyEntry} />
                if (entry.role === 'error') return <ErrorEntry key={i} text={entry.text} onCopy={copyEntry} />
                return <AssistantEntry key={i} entry={entry} isStreaming={false} onCopy={copyEntry} />
              })}
              {current && <AssistantEntry entry={current} isStreaming={true} onCopy={copyEntry} />}
              {steerQueue.map((text, i) => (
                <div key={`steer-${i}`} className="steer-msg">
                  <span className="steer-arrow">↳</span>
                  <span className="steer-text">{text}</span>
                  <span className="steer-badge">queued</span>
                </div>
              ))}
              <div ref={endRef} />
            </div>
          ) : (
            <EmptyState />
          )}
        </div>

        <StatsFooter stats={sessionStats} isCompacting={isCompacting} autoCompactionEnabled={autoCompactionEnabled} />
        <InputBar
          onSend={handleSend}
          onSteer={handleSteer}
          onStop={abortAgent}
          streaming={streaming}
          attachments={attachments}
          onRemoveAttachment={removeAttachment}
          onAddFiles={addFiles}
          onCompact={handleCompact}
          onNewChat={handleNewChat}
          onOpenModelPicker={() => setShowModelPicker(true)}
        />
      </main>

      {showModelPicker && (
        <ModelPicker
          activeModel={model}
          onSelect={setModel}
          onClose={() => setShowModelPicker(false)}
        />
      )}
      {route === 'releases' && (
        <ReleaseNotes onClose={() => navigate('')} />
      )}
      {showSettings && (
        <SettingsPanel onClose={() => setShowSettings(false)} />
      )}
    </div>
  )
}
