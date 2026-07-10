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

export default function App() {
  const { entries, current, steerQueue, streaming, connected, sessionAlive, sessionModel, sessionStats, thinkingLevel, isCompacting, autoCompactionEnabled, sendPrompt, sendSteer, abortAgent, startNewChat, dispatch } = useAgentEvents()
  const { attachments, addFiles, remove: removeAttachment, clear: clearAttachments, buildPayload } = useAttachments()
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [showModelPicker, setShowModelPicker] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const { route, navigate } = useHashRoute()
  const [model, setModel] = useState('')
  const endRef = useRef(null)
  const scrollContainerRef = useRef(null)
  const stickToBottomRef = useRef(true)  // stick to bottom unless the user scrolled up
  const [dragOver, setDragOver] = useState(false)

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
        onNewChat={startNewChat}
        onShowReleaseNotes={() => navigate('releases')}
        onShowSettings={() => setShowSettings(true)}
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
