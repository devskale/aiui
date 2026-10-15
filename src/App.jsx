import { useState, useRef, useEffect, useCallback } from 'react'
import { useAgentEvents } from './hooks/useAgentEvents'
import { useAttachments } from './hooks/useAttachments'
import { useHashRoute } from './hooks/useHashRoute'
import { useModels } from './hooks/useModels'
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts'
import { apiUrl } from './lib/api'
import { visibleWindow, growWindow, captureScrollDistance, restoreScrollTop, isAtTail, PAGE_SIZE } from './lib/chat-window'
import { prefersReducedMotion } from './lib/motion'
import { visibleCountForJump } from './lib/turn-rail'
import { copy } from './lib/copy'
import { JumpToLatest } from './components/JumpToLatest'
import { TurnRail } from './components/TurnRail'
import { Sidebar } from './components/Sidebar'
import { ModelPicker } from './components/ModelPicker'
import { AgentPicker } from './components/AgentPicker'
import { useTts } from './hooks/useTts'
import { InputBar } from './components/InputBar'
import { StatsFooter } from './components/StatsFooter'
import { ThinkingPicker } from './components/ThinkingPicker'
import { ForkPicker } from './components/ForkPicker'
import { FileExplorer } from './components/FileExplorer'
import { SkillsBrowser } from './components/SkillsBrowser'
import { EmptyState } from './components/EmptyState'
import { ReleaseNotes } from './components/ReleaseNotes'
import { SettingsPanel } from './components/SettingsPanel'
import { LoginModal } from './components/LoginModal'
import { ToastProvider } from './components/Toasts'
import { ShortcutHelp } from './components/ShortcutHelp'
import { UserEntry, AssistantEntry, ErrorEntry } from './components/StreamEntry'
import { ResearchCanvas } from './components/Canvas/ResearchCanvas.jsx'
import { useCanvas } from './hooks/useCanvas'
import { findImageMentions } from './lib/compose'
import { Folder, Clock, Volume2, VolumeX, PanelRight } from 'lucide-react'

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
  // ── Auth: gate the live app behind a login (when configured) ──
  const [me, setMe] = useState(null)
  const [authLoading, setAuthLoading] = useState(true)
  const checkMe = useCallback(() => {
    fetch(apiUrl('/api/me'))
      .then(r => (r.ok ? r.json() : { authed: false, authRequired: true }))
      .then(d => { setMe(d); setAuthLoading(false) })
      .catch(() => { setMe({ authed: false, authRequired: true }); setAuthLoading(false) })
  }, [])
  useEffect(() => { checkMe() }, [checkMe])
  const authed = !!me?.authed
  const handleLogout = async () => {
    await fetch(apiUrl('/api/logout'), { method: 'POST' }).catch(() => {})
    setAuthLoading(true)
    checkMe()
  }

  const { entries, current, steerQueue, streaming, connected, sessionAlive, sessionAgent, sessionModel, sessionId, sessionCwd, sessionCwdShort, sessionStartedAt, sessionStats, thinkingLevel, isCompacting, autoCompactionEnabled, sendPrompt, sendSteer, abortAgent, startNewChat, dispatch } = useAgentEvents(authed)
  const { attachments, addFiles, remove: removeAttachment, clear: clearAttachments, buildPayload } = useAttachments()
  const [sidebarOpen, setSidebarOpen] = useState(true)
  // Work-Details-Modus (Issue work-details-folding): standard = heutiges
  // Verhalten; persistiert per localStorage. Scroll-Distanz beim Wechsel
  // bewahren — Compact↔Verbose ändert massiv Höhen (wie Reveal-Older).
  const [workDetails, setWorkDetails] = useState(() => {
    const v = localStorage.getItem('aiui-work-details')
    return ['standard', 'verbose', 'compact'].includes(v) ? v : 'standard'
  })
  const [showModelPicker, setShowModelPicker] = useState(false)
  const [showAgentPicker, setShowAgentPicker] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [showShortcuts, setShowShortcuts] = useState(false)
  const [sessionRefresh, setSessionRefresh] = useState(0)
  const [showFork, setShowFork] = useState(false)
  const [showFiles, setShowFiles] = useState(false)
  const [showSkills, setShowSkills] = useState(false)
  const [agents, setAgents] = useState([{ id: 'default', name: 'Assistant' }])
  const [sttInfo, setSttInfo] = useState({ enabled: false })
  const { route, navigate } = useHashRoute()
  const [model, setModel] = useState('')
  const { visible, imageModels, favModels } = useModels(authed, me?.user)
  const endRef = useRef(null)
  const inputRef = useRef(null)
  // Lazy-Render-Fenster (ideas.md „Lazy render"): nur das Ende der Historie
  // im DOM, älteres wird beim Hochscrollen on demand eingeblendet. Bei
  // Session-Wechsel/Neu auf Ausgangsfenster zurücksetzen.
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)
  const revealPendingRef = useRef(null) // { distance } für Scroll-Restore

  // ── Canvas (ADR-0005): Panel nur für Agents mit Canvas-Deklaration ──
  const canvasGlob = agents.find(a => a.id === sessionAgent)?.canvas || null
  const canvasState = useCanvas({ glob: canvasGlob, entries, current })
  const [canvasOpen, setCanvasOpen] = useState(() => localStorage.getItem('aiui-canvas-open') !== '0')

  // ── TTS (agent-gated spoken answers — ADR-0004) ──
  const activeAgent = agents.find(a => a.id === sessionAgent)
  const ttsAvailable = !!activeAgent?.tts
  const [ttsOn, setTtsOn] = useState(() => localStorage.getItem('aiui-tts') === '1')
  const { speaking, speak, cancel } = useTts()
  const lastSpokenRef = useRef(null)

  // Auto-speak each newly finished assistant answer while the toggle is on.
  useEffect(() => {
    if (!ttsOn || !ttsAvailable) return
    const last = [...entries].reverse().find(e => e.role === 'assistant' && (e.text || '').trim())
    if (!last) return
    const key = `${entries.length}:${last.text.slice(0, 80)}`
    if (lastSpokenRef.current === key) return
    lastSpokenRef.current = key
    speak(last.text)
  }, [entries, ttsOn, ttsAvailable, speak])

  // A new turn interrupts the spoken answer; toggling off stops it.
  useEffect(() => { if (streaming) cancel() }, [streaming, cancel])
  const toggleTts = () => {
    const next = !ttsOn
    setTtsOn(next)
    localStorage.setItem('aiui-tts', next ? '1' : '0')
    if (!next) cancel()
  }

  const scrollContainerRef = useRef(null)
  const stickToBottomRef = useRef(true)  // stick to bottom unless the user scrolled up
  const pendingJumpRef = useRef(null)    // { index } — Turn-Rail-Sprung nach Fenster-Wachstum

  // ── Screenreader-Live-Region (letzter a11y-Rest, pi-web/dsh-Muster):
  // Turn-Start/Ende und Fehler angemeldet — sonst ist ein laufender Agent
  // für SR-Nutzer stumm. Dedupe per Ref, damit Re-Renders nichts
  // erneut ansagen. Widget: eigenes Surface, bewusst außen vor.
  const [liveMsg, setLiveMsg] = useState('')
  const prevStreamingRef = useRef(false)
  const lastErrAnnouncedRef = useRef(null)
  useEffect(() => {
    if (streaming && !prevStreamingRef.current) setLiveMsg('Agent is working')
    if (!streaming && prevStreamingRef.current) {
      const lastErr = [...entries].reverse().find(e => e.role === 'error')
      if (lastErr && lastErr.text !== lastErrAnnouncedRef.current) {
        lastErrAnnouncedRef.current = lastErr.text
        setLiveMsg('Error: ' + lastErr.text.slice(0, 120))
      } else {
        setLiveMsg('Turn finished')
      }
    }
    prevStreamingRef.current = streaming
  }, [streaming, entries])
  // ── Browser-Notification bei Turn-Ende (pi-web-Muster; Ledger-S-Item:
  // E2E-Recherchen laufen 375s+ — im Hintergrund-Tab wird Ende sichtbar.
  // Nur wenn: Permission granted UND Tab versteckt; Permission-Frage beim
  // ersten Prompt-Send (User-Geste).
  const turnRanRef = useRef(false)
  useEffect(() => { if (streaming) turnRanRef.current = true }, [streaming])
  useEffect(() => {
    if (streaming || !turnRanRef.current) return
    turnRanRef.current = false
    if (typeof document === 'undefined' || document.visibilityState !== 'hidden') return
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return
    const last = [...entries].reverse().find(e => e.role === 'assistant' && (e.text || '').trim())
    try {
      const n = new Notification('πui — turn finished', {
        body: (last?.text || 'The agent has finished its turn.').replace(/\s+/g, ' ').slice(0, 120),
      })
      n.onclick = () => { window.focus(); n.close() }
    } catch { /* manche Kontexte (SW) verbauen den Konstruktor */ }
  }, [streaming, entries])

  // ── Session pro Tab merken (pi-web #887): sessionStorage überlebt Reloads,
  // gilt aber nur für DIESEN Tab — parallele Tabs behalten jeweils ihre
  // eigene Session.
  const tabSessionRestoredRef = useRef(false)
  const [dragOver, setDragOver] = useState(false)
  // atTail spiegelt stickToBottomRef in den Render (Ref allein zeigt keinen
  // Jump-Button). Nur am Ende ist der Button weg — sonst sichtbar.
  const [atTail, setAtTail] = useState(true)
  // Reconnect-Indikator erst nach einer ECHTEN Verbindung zeigen: beim ersten
  // Mount ist connected kurz false (SSE open kommt einen Tick später) — das
  // wäre ein Flackern beim Laden, kein Ausfall (dsh: Indicator erscheint erst
  // nach einer Outage, nicht während des Startaufbaus).
  const [wasConnected, setWasConnected] = useState(false)
  useEffect(() => { if (connected) setWasConnected(true) }, [connected])
  const [now, setNow] = useState(() => Date.now())

  // Re-check once a minute — the uptime shows only the largest unit (w/d/h/m),
  // so a 1-minute tick is enough to keep it current.
  useEffect(() => {
    if (!sessionAlive || !sessionStartedAt) return
    const id = setInterval(() => setNow(Date.now()), 60000)
    return () => clearInterval(id)
  }, [sessionAlive, sessionStartedAt])

  // Agent catalog + STT availability (ADR-0004). Fetched once per login.
  useEffect(() => {
    if (!authed) return
    fetch(apiUrl('/api/agents'))
      .then(r => (r.ok ? r.json() : null))
      .then(d => {
        if (!d?.agents?.length) return
        setAgents(d.agents)
        setSttInfo(d.stt || { enabled: false })
      })
      .catch(() => {})
  }, [authed])

  // Default model = first favorite (if any) that's visible, else the first visible.
  useEffect(() => {
    if (model || !visible.length) return
    const firstFav = favModels.find(m => visible.includes(m))
    setModel(firstFav || visible[0] || '')
  }, [visible, favModels, model])

  // Auto-scroll only when the user is near the bottom.
  // Scrolling up to read pauses auto-scroll; scrolling back down resumes it.
  useEffect(() => {
    if (stickToBottomRef.current) {
      endRef.current?.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth' })
    }
  }, [entries, current])

  // Lazy-Render: Fenster berechnen. hasMoreRef hält den Scroll-Handler ohne
  // Dependency-Zyklus auf dem neuesten Stand. Auto-Grow nur bei NEUEN Entries
  // unter dem laufenden Chat (prevLen > 0) — ein Session-Load (0 → N) füllt
  // das Fenster nicht auf, sonst wäre Lazy-Render beim Öffnen langer
  // Sessions wirkungslos.
  const win = visibleWindow(entries.length, visibleCount)
  const hasMoreRef = useRef(false)
  hasMoreRef.current = win.hasMore
  const prevEntriesLenRef = useRef(0)
  useEffect(() => {
    const grew = prevEntriesLenRef.current > 0 && entries.length > prevEntriesLenRef.current
    prevEntriesLenRef.current = entries.length
    if (!grew || !stickToBottomRef.current) return
    setVisibleCount(c => Math.max(c, entries.length))
  }, [entries.length])
  // Scroll-Position nach dem Einmontieren älterer Entries wiederherstellen.
  useEffect(() => {
    const p = revealPendingRef.current
    if (!p) return
    const el = scrollContainerRef.current
    if (!el) return
    revealPendingRef.current = null
    el.scrollTop = restoreScrollTop(el.scrollHeight, p.distance)
  }, [visibleCount])

  // ── Turn-Navigation (Issue turn-navigation): Sprung zum Turn ──
  // Innerhalb des Fensters sofort scrollen; davor liegende Turns decken
  // das Fenster auf (visibleCountForJump) — dieser Effect scrollt NACH dem
  // Re-Render auf das frisch gemountete [data-entry-idx] (wie reveal: erst
  // wachsen, dann positionieren, damit scrollHeight schon stimmt).
  useEffect(() => {
    const p = pendingJumpRef.current
    if (!p) return
    const target = document.querySelector(`[data-entry-idx="${p.index}"]`)
    if (!target) return
    pendingJumpRef.current = null
    stickToBottomRef.current = false
    setAtTail(false)
    target.scrollIntoView({ behavior: 'auto', block: 'start' })
  }, [visibleCount, entries])

  const handleJumpToEntry = useCallback((index) => {
    const target = document.querySelector(`[data-entry-idx="${index}"]`)
    if (target) {
      // liegt im Fenster → direkt (smooth, außer reduced motion)
      stickToBottomRef.current = false
      setAtTail(false)
      target.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' })
      return
    }
    // außerhalb: Fenster aufdecken (Index inklusive + etwas Luft), der
    // Effect oben springt nach dem Render — instant, kein Smooth über Seiten.
    pendingJumpRef.current = { index }
    setVisibleCount(c => Math.min(entries.length, visibleCountForJump(c, entries.length, index) + 2))
  }, [entries.length])

  const handleScroll = useCallback(() => {
    const el = scrollContainerRef.current
    if (!el) return
    // Lazy-Render: oben an den Fensterrand gescrollt → ältere Entries
    // einmontieren. Distanz-vom-Ende merken, damit der Viewport nicht springt.
    if (revealPendingRef.current === null) {
      const nearTop = el.scrollTop <= 24
      if (nearTop && hasMoreRef.current) {
        revealPendingRef.current = { distance: captureScrollDistance(el.scrollHeight, el.scrollTop) }
        setVisibleCount(c => growWindow(c))
      }
    }
    // Gemeinsame Schluss-Regel: Auto-Scroll klebt nur, wenn der Reader am
    // Ende ist (isAtTail, getestet) — dieselbe Toleranz für Ref und Button.
    const tail = isAtTail(el.scrollTop, el.clientHeight, el.scrollHeight)
    stickToBottomRef.current = tail
    setAtTail(prev => (prev === tail ? prev : tail))
  }, [])

  // „Zum Neuesten" — klebenden Modus wiederherstellen und ans Ende fahren.
  // Reduced motion bekommt den Sprung statt der Animation.
  const scrollToLatest = useCallback(() => {
    stickToBottomRef.current = true
    setAtTail(true)
    endRef.current?.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth' })
  }, [])

  // Work-Details-Wechsel: Distanz vom Ende vorher einfangen, nach dem
  // Re-Render (geänderte Höhen!) wiederherstellen — gleiches Muster wie
  // Reveal-Older (chat-window.js), kein Springen beim Umklappen.
  const workScrollRef = useRef(null)
  const changeWorkDetails = useCallback((mode) => {
    const el = scrollContainerRef.current
    if (el) workScrollRef.current = { distance: captureScrollDistance(el.scrollHeight, el.scrollTop) }
    setWorkDetails(mode)
    try { localStorage.setItem('aiui-work-details', mode) } catch {}
  }, [])
  useEffect(() => {
    const p = workScrollRef.current
    if (!p) return
    workScrollRef.current = null
    const el = scrollContainerRef.current
    if (!el) return
    el.scrollTop = restoreScrollTop(el.scrollHeight, p.distance)
  }, [workDetails])

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
    // Notification-Permission beim ersten Send holen (User-Geste). Still
    // bleiben bei 'denied' — fragenwirbelt niemanden.
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      try { Notification.requestPermission() } catch { /* older API */ }
    }
    // Resolve @<image> mentions into attachments so they preview live in the
    // chat AND are sent as vision content. (The server also attaches bare
    // @tokens as a fallback; client-side resolution is what powers the preview.)
    let cleanText = text
    const resolved = []
    for (const { token, relPath } of findImageMentions(text)) {
      try {
        const r = await fetch(apiUrl('/api/file/raw?path=' + encodeURIComponent(relPath)))
        if (!r.ok) continue
        const dataUrl = await r.blob().then(b => new Promise((res, rej) => {
          const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = rej; fr.readAsDataURL(b)
        }))
        resolved.push({ isImage: true, dataUrl, path: relPath, relPath })
        cleanText = cleanText.replace(token, '')
      } catch { /* leave the @token — server-side fallback will attach it */ }
    }
    const payload = [...buildPayload(), ...resolved]
    await sendPrompt(cleanText.replace(/\s{2,}/g, ' ').trim(), payload)
    clearAttachments()
  }

  const handleSteer = async (text) => {
    const payload = buildPayload()
    await sendSteer(text, payload)
    clearAttachments()
  }

  const handleSwitchSession = async (path) => {
    try { sessionStorage.setItem('aiui-tab-session', path) } catch {}
    await fetch(apiUrl('/api/session/switch'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path }),
    })
    setVisibleCount(PAGE_SIZE) // Lazy-Render: Fenster zurücksetzen
    setSessionRefresh(n => n + 1)
  }

  // Tab-Restore (pi-web #887): nachdem der Server die Live-Session gepusht
  // hat, springt der Tab EINMAL auf seine gemerkte Session zurück — nur wenn
  // die noch existiert. Ein neues Chat (kein Pfad gemerkt) räumt den Key ab.
  useEffect(() => {
    if (tabSessionRestoredRef.current || !connected || !sessionId) return
    tabSessionRestoredRef.current = true
    let stored = null
    try { stored = sessionStorage.getItem('aiui-tab-session') } catch { return }
    if (!stored) return
    fetch(apiUrl('/api/sessions'))
      .then(r => (r.ok ? r.json() : []))
      .then(list => {
        const arr = Array.isArray(list) ? list : (list?.sessions || [])
        const hit = arr.find(s => s.path === stored)
        if (hit && hit.id !== sessionId) {
          fetch(apiUrl('/api/session/switch'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path: stored }),
          }).then(() => { setVisibleCount(PAGE_SIZE); setSessionRefresh(n => n + 1) }).catch(() => {})
        }
      })
      .catch(() => {})
  }, [connected, sessionId])

  const handleNewChat = async () => {
    try { sessionStorage.removeItem('aiui-tab-session') } catch {}
    await startNewChat()
    setVisibleCount(PAGE_SIZE) // Lazy-Render: Fenster zurücksetzen
    setSessionRefresh(n => n + 1)
  }

  // Switching agents starts a new chat — the persona binds at session build.
  const handleSelectAgent = async (agentId) => {
    if (agentId === sessionAgent) { setShowAgentPicker(false); return }
    if (hasContent && !window.confirm('Switching agents starts a new chat. Continue?')) return
    setShowAgentPicker(false)
    dispatch({ type: 'reset' })
    await fetch(apiUrl('/api/agent'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agent: agentId }),
    }).catch(() => {})
    setSessionRefresh(n => n + 1)
  }

  // EmptyState agent cards do the same thing (no confirm — the chat is empty).
  const handlePickAgent = async (agentId) => {
    if (agentId === sessionAgent) return
    await startNewChat(agentId)
    setSessionRefresh(n => n + 1)
  }

  // ── Prefill seam: example chips + deep link share one draft state. ──
  // { text, nonce } — InputBar applies on nonce bump (one-shot per click).
  const [draft, setDraft] = useState(null)
  const pickExample = useCallback((text) => {
    setDraft({ text, nonce: Date.now() })
  }, [])

  // ── Deep link: #/?agent=<id>&q=<prompt> (e.g. from skale.dev/firmenindex).
  // Picks the agent, starts a fresh chat, prefills the prompt — the user
  // presses Enter (no auto-send: deep links never burn quota unseen).
  // Consumed once after agents load, then the hash is cleaned to `#`.
  const deepLinkDone = useRef(false)
  useEffect(() => {
    if (deepLinkDone.current || !authed || agents.length <= 1) return
    const h = window.location.hash.replace(/^#\/?/, '')
    if (!h.includes('?')) return
    const params = new URLSearchParams(h.split('?')[1] || '')
    const agentId = params.get('agent')
    const q = params.get('q') || ''
    window.history.replaceState(null, '', window.location.pathname + window.location.search + '#')
    deepLinkDone.current = true
    if (!agentId || !agents.some(a => a.id === agentId)) return
    if (agentId !== sessionAgent) startNewChat(agentId)
    if (q) setTimeout(() => setDraft({ text: q, nonce: Date.now() }), 50)
  }, [authed, agents, sessionAgent, startNewChat])

  // Shortcut-Hilfe öffnen: Ctrl/Cmd + "/" überall (der Composer
  // autofokusiert — ein nacktes "?" wäre fast nie erreichbar und müsste
  // beim Tippen von Fragen ja auch das Zeichen durchlassen), plus "?"
  // wenn der Fokus gerade NICHT in einem Eingabefeld sitzt.
  useEffect(() => {
    const onKey = (e) => {
      const tag = document.activeElement?.tagName
      const inField = tag === 'TEXTAREA' || tag === 'INPUT' || document.activeElement?.isContentEditable
      const mod = e.metaKey || e.ctrlKey
      const hit = (mod && e.key === '/') || (e.key === '?' && !inField)
      if (!hit) return
      if (document.querySelector('[role="dialog"]')) return
      e.preventDefault()
      setShowShortcuts(v => !v)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  // Keyboard shortcuts — must sit BELOW the handler definitions: the object
  // literal reads handleNewChat's binding at call time, and a const read
  // before its declaration is a TDZ crash (the minifier only sometimes
  // reorders it away).
  useKeyboardShortcuts({
    onAbort: abortAgent,
    onNewChat: handleNewChat,
    inputRef,
    isStreaming: streaming,
  })

  const handleCompact = async () => {
    await fetch(apiUrl('/api/compact'), { method: 'POST' }).catch(() => {})
  }

  const hasContent = entries.length > 0 || current

  // Can the current model accept images? Derived from each model's `input`
  // capability (models.json via /api/models) — only models that declare image
  // input accept images. Not a preference.
  const imageCapable = imageModels.includes(sessionModel || model)

  const copyEntry = (el) => {
    // Clone node, strip UI chrome, extract clean textContent
    const clone = el.cloneNode(true)
    clone.querySelectorAll('.tc-line, .think-line, .entry-streaming, .copy-btn, .copy-entry').forEach(n => n.remove())
    let text = clone.textContent || ''
    text = text.replace(/[ \t]+/g, ' ').replace(/\s+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
    navigator.clipboard.writeText(text)
  }

  // Until authed, render only the login (the full shell fetches data that
  // 401s when unauthed — don't mount it). UI loads once logged in.
  if (authLoading) return <div className="app" />
  if (!authed) {
    return (
      <div className="app">
        <LoginModal onSuccess={checkMe} />
      </div>
    )
  }

  return (
    <ToastProvider>
    <div className="app" onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}>
      {dragOver && <div className="drop-zone"><span>Drop files here</span></div>}
      {!authLoading && !authed && <LoginModal onSuccess={checkMe} />}

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
        onShowShortcuts={() => setShowShortcuts(true)}
        onShowFork={() => setShowFork(true)}
        onShowFiles={() => setShowFiles(true)}
        onShowSkills={() => setShowSkills(true)}
        refreshTrigger={sessionRefresh}
      />

      <main className={`main ${!sidebarOpen ? 'full' : ''}`}>
        <header className="topbar">
          {!sidebarOpen && (
            <button className="tb-btn" onClick={() => setSidebarOpen(true)} title="Show sidebar" aria-label="Show sidebar">☰</button>
          )}
          {wasConnected && !connected && (
            <span className="tb-reconnect" role="status" title="Connection lost — reconnecting to the server">
              <span className="tb-reconnect-dots" aria-hidden="true"><i /><i /><i /></span>
              Reconnecting
            </span>
          )}
          {agents.length > 1 && (
            <button className="tb-agent" onClick={() => setShowAgentPicker(true)} title="Choose agent">
              {activeAgent?.name || 'Assistant'}
            </button>
          )}
          {ttsAvailable && (
            <button
              className={`tb-btn tb-tts ${ttsOn ? 'on' : ''} ${speaking ? 'speaking' : ''}`}
              onClick={toggleTts}
              aria-label={ttsOn ? 'Read answers aloud (on)' : 'Read answers aloud (off)'}
              title={ttsOn ? 'Reads answers aloud (on)' : 'Read answers aloud'}
            >
              {ttsOn ? <Volume2 size={15} /> : <VolumeX size={15} />}
            </button>
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
          {canvasState.canvas && (
            <button
              className={`tb-btn tb-canvas ${canvasOpen ? 'on' : ''}`}
              onClick={() => { const n = !canvasOpen; setCanvasOpen(n); localStorage.setItem('aiui-canvas-open', n ? '1' : '0') }}
              title={canvasOpen ? copy.canvasClose : copy.canvasOpen}
              aria-label={canvasOpen ? 'Close research panel' : 'Open research panel'}
            >
              <PanelRight size={15} />
            </button>
          )}
          {me?.authRequired && me?.user && (
            <div className="tb-user">
              <span className="tb-user-name">{me.user}</span>
              {me.quota && me.quota.limit !== null && (
                <span className="tb-user-quota" title="queries used today / daily limit">{me.quota.used}/{me.quota.limit}</span>
              )}
              <button className="tb-user-logout" onClick={handleLogout} title="Log out" aria-label="Log out">⎋</button>
            </div>
          )}
          <div style={{ flex: 1 }} />
        </header>

        <div className="content" ref={scrollContainerRef} onScroll={handleScroll}>
          {hasContent ? (
            <div className="entries">
              {win.hasMore && (
                <button className="reveal-older" onClick={() => {
                  const el = scrollContainerRef.current
                  revealPendingRef.current = { distance: el ? captureScrollDistance(el.scrollHeight, el.scrollTop) : 0 }
                  setVisibleCount(c => growWindow(c))
                }}>
                  {(win.startIndex > PAGE_SIZE
                    ? copy.showOlder(Math.min(win.startIndex, PAGE_SIZE))
                    : copy.showOlderAll(Math.min(win.startIndex, PAGE_SIZE)))}
                </button>
              )}
              {entries.slice(win.startIndex).map((entry, i) => {
                const entryIdx = win.startIndex + i
                if (entry.role === 'user') return <UserEntry key={i} entryIdx={entryIdx} text={entry.text} images={entry.images} onCopy={copyEntry} />
                if (entry.role === 'error') return <ErrorEntry key={i} text={entry.text} onCopy={copyEntry} />
                // Follow-ups are clickable only on the settled chat tail —
                // a new turn (current/streaming) unmounts them naturally.
                const interactive = i === entries.length - win.startIndex - 1 && !current && !streaming
                return <AssistantEntry key={i} entry={entry} isStreaming={false} onCopy={copyEntry} interactive={interactive} onAsk={handleSend} workDetails={workDetails} />
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
            <EmptyState agents={agents} activeAgent={sessionAgent} onPickAgent={handlePickAgent} onPickExample={pickExample} />
          )}
        </div>

        {hasContent && <TurnRail entries={entries} startIndex={win.startIndex} onJump={handleJumpToEntry} />}

        {hasContent && !atTail && <JumpToLatest onClick={scrollToLatest} />}

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
          imageCapable={imageCapable}
          inputRef={inputRef}
          sttLanguage={agents.find(a => a.id === sessionAgent)?.sttLanguage || 'auto'}
          prefill={draft}
          sessionId={sessionId}
          user={me?.user}
        />
      </main>

      {canvasState.canvas && canvasOpen && (
        <ResearchCanvas
          state={canvasState}
          onAsk={handleSend}
          onClose={() => { setCanvasOpen(false); localStorage.setItem('aiui-canvas-open', '0') }}
        />
      )}

      {showModelPicker && (
        <ModelPicker
          activeModel={model}
          onSelect={setModel}
          onClose={() => setShowModelPicker(false)}
          onOpenSettings={() => setShowSettings(true)}
        />
      )}
      {showAgentPicker && (
        <AgentPicker
          activeAgent={sessionAgent}
          agents={agents}
          streaming={streaming}
          onSelect={handleSelectAgent}
          onClose={() => setShowAgentPicker(false)}
        />
      )}
      {showFork && (
        <ForkPicker onClose={() => setShowFork(false)} />
      )}
      {showFiles && (
        <FileExplorer onClose={() => setShowFiles(false)} />
      )}
      {showSkills && (
        <SkillsBrowser onClose={() => setShowSkills(false)} />
      )}
      {route === 'releases' && (
        <ReleaseNotes onClose={() => navigate('')} />
      )}
      {showShortcuts && (
        <ShortcutHelp onClose={() => setShowShortcuts(false)} />
      )}
      {showSettings && (
        <SettingsPanel onClose={() => setShowSettings(false)} workDetails={workDetails} onWorkDetailsChange={changeWorkDetails} />
      )}

      {/* SR-Live-Region: Turn-Start/Ende/Fehler — visuell unsichtbar,
          für Screenreader angemeldet (letzter a11y-Rest). */}
      <div className="sr-only" role="status" aria-live="polite">{liveMsg}</div>
    </div>
    </ToastProvider>
  )
}
