import { useState, useRef, useEffect, useCallback } from 'react'
import { useAgentEvents } from './hooks/useAgentEvents'
import { useAttachments } from './hooks/useAttachments'
import { apiUrl } from './lib/api'
import { Sidebar } from './components/Sidebar'
import { ModelPicker } from './components/ModelPicker'
import { CommandPanel } from './components/CommandPanel'
import { InputBar } from './components/InputBar'
import { EmptyState } from './components/EmptyState'
import { UserEntry, AssistantEntry, ErrorEntry } from './components/StreamEntry'

export default function App() {
  const { entries, current, streaming, connected, sessionAlive, sessionModel, sendPrompt, abortAgent, dispatch } = useAgentEvents()
  const { attachments, addFiles, remove: removeAttachment, clear: clearAttachments, buildPayload } = useAttachments()
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [showModelPicker, setShowModelPicker] = useState(false)
  const [model, setModel] = useState('')
  const endRef = useRef(null)
  const [dragOver, setDragOver] = useState(false)

  // Fetch current model on mount
  useEffect(() => {
    fetch(apiUrl('/api/models'))
      .then(r => r.json())
      .then(data => {
        // Try to find the active model — flatten grouped models
        const all = Object.values(data).flat()
        // Prefer the settings default
        const preferred = all.find(m => m === 'tu@qwen-3.5-397b')
        if (preferred) setModel(preferred)
        else if (all[0]) setModel(typeof all[0] === 'string' ? all[0] : all[0]?.id || '')
      })
      .catch(() => {})
  }, [])

  // Auto-scroll
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [entries, current])

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
        onNewChat={() => dispatch({ type: 'reset' })}
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
          <div style={{ flex: 1 }} />
        </header>

        <div className="content">
          {hasContent ? (
            <div className="entries">
              {entries.map((entry, i) => {
                if (entry.role === 'user') return <UserEntry key={i} text={entry.text} onCopy={copyEntry} />
                if (entry.role === 'error') return <ErrorEntry key={i} text={entry.text} onCopy={copyEntry} />
                return <AssistantEntry key={i} entry={entry} isStreaming={false} onCopy={copyEntry} />
              })}
              {current && <AssistantEntry entry={current} isStreaming={true} onCopy={copyEntry} />}
              <div ref={endRef} />
            </div>
          ) : (
            <EmptyState />
          )}
        </div>

        <InputBar
          onSend={handleSend}
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
    </div>
  )
}
