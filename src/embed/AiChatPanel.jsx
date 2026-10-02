// ════════════════════════════════════════════════════════════════════
// AiChatPanel — corner | modal | inline (ADR-0006 Zielbild & Varianten).
//
// corner  (default): Launcher-Bubble → Slide-Panel (fixed, unten rechts)
// modal  : Launcher → Backdrop + zentrierter Dialog. A11y-Pflicht: Focus-
//          Trap (focus-trap.js), Esc-to-close, role=dialog + aria-modal,
//          dismissOnBackdrop aus der Key-Config (default: an).
// inline : kein Launcher, Panel im Seitenfluss des Elements (statisch).
//
// Wiederverwendet, nicht geforkt (ADR-0006 D4): UserEntry/AssistantEntry/
// ErrorEntry unverändert aus ../components/StreamEntry.jsx.
// ════════════════════════════════════════════════════════════════════
import { useState, useRef, useEffect, useCallback } from 'react'
import { MessageCircle, X, SendHorizontal } from 'lucide-react'
import { UserEntry, AssistantEntry, ErrorEntry } from '../components/StreamEntry.jsx'
import { useWidgetChat } from './useWidgetChat.js'
import { resolveVariant } from './variant.js'
import { createFocusTrap } from './focus-trap.js'

export function AiChatPanel({ transport, launcherLabel = 'Chat', controller, onTheme, variantAttr }) {
  // Das Element kann sein variant-Attribut zur Laufzeit wechseln (Demo/
  // Host-UX: el.setAttribute('variant','modal')). React-Props sind bei
  // Custom Elements immutable — daher in State spiegeln und bei
  // Attributänderungen nachziehen, sonst bleibt die Variante eingefroren.
  const [attrVariant, setAttrVariant] = useState(variantAttr)
  useEffect(() => {
    const el = controller?.el
    if (!el || typeof MutationObserver === 'undefined') return
    const obs = new MutationObserver(() => setAttrVariant(el.getAttribute('variant')))
    obs.observe(el, { attributes: true, attributeFilter: ['variant'] })
    return () => obs.disconnect()
  }, [controller])
  // onTheme kommt von embed.jsx als Inline-Arrow — ohne useCallback wäre die
  // Effect-Dep im Connect-Effekt pro Render neu und würde den SSE-Stream bei
  // JEDEM Render schließen und neu öffnen (Connect-Flap).
  const stableOnTheme = useCallback((t) => onTheme?.(t), [onTheme])
  const chat = useWidgetChat({
    transport,
    onTheme: stableOnTheme,
    onSettled: (text) => controller?.onSettled?.(text),
  })
  const [text, setText] = useState('')
  const ref = useRef(null)
  const scrollRef = useRef(null)
  const dialogRef = useRef(null)
  const releaseTrapRef = useRef(null)

  const variant = resolveVariant(attrVariant, chat.config?.variant)
  const dismissOnBackdrop = chat.config?.dismissOnBackdrop !== false
  const open = variant === 'inline' ? true : chat.open

  // Host-Bridge: el.open()/close()/send() steuert dieselbe Instanz.
  useEffect(() => {
    if (!controller) return
    controller.open = () => chat.setOpen(true)
    controller.close = () => chat.setOpen(false)
    controller.send = (t) => chat.send(t)
  })

  // Modal: Focus-Trap + Start-Fokus beim Öffnen, Restore beim Schließen.
  useEffect(() => {
    if (variant !== 'modal' || !open) { releaseTrapRef.current?.(); releaseTrapRef.current = null; return }
    if (dialogRef.current) releaseTrapRef.current = createFocusTrap(dialogRef.current)
    return () => { releaseTrapRef.current?.(); releaseTrapRef.current = null }
  }, [variant, open])

  // Esc schließt den Dialog unabhaengig vom Fokus. Haengt weder am
  // Textarea-KeyDown noch am Dialog im Shadow: der Fokus sitzt nach dem
  // Start-Fokus im Close-Button, und Light-DOM-KeyEvents dringen gar nicht in
  // den closed ShadowRoot. Haengen am HOST-Element (dort laufen sie an) plus
  // document als Fallback fuer Tastendruecke, die am Host vorbeikommen —
  // composedPath() filtert auf genau DIES Widget, sonst schliesst Esc alle.
  useEffect(() => {
    if (variant === 'inline' || !open) return
    const host = controller?.el
    const onKey = (e) => {
      if (e.key !== 'Escape') return
      if (e.composedPath?.().includes?.(host)) { chat.setOpen(false); return }
    }
    host?.addEventListener('keydown', onKey)
    document.addEventListener('keydown', onKey)
    return () => { host?.removeEventListener('keydown', onKey); document.removeEventListener('keydown', onKey) }
  }, [variant, open, controller])

  // Smart autoscroll wie die Haupt-App: bei offenem Panel unten kleben.
  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [chat.entries, chat.current, open])

  const submit = () => {
    const t = text.trim()
    if (!t) return
    chat.send(t)
    setText('')
    if (ref.current) ref.current.style.height = 'auto'
  }

  const panelBody = (
    <>
      <header className="aiw-head">
        <span className="aiw-title">{launcherLabel}</span>
        <span className="aiw-status" title={chat.sessionModel || ''}>
          {chat.notice ? '⚠' : chat.streaming ? '●' : chat.sessionModel ? chat.sessionModel.split('@').pop() : ''}
        </span>
        {variant !== 'inline' && (
          <button className="aiw-x" onClick={() => chat.setOpen(false)} title="Close (Esc)"><X size={15} /></button>
        )}
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
            if (e.key === 'Escape' && variant !== 'inline') chat.setOpen(false)
          }}
        />
        <button className="aiw-send" onClick={submit} title="Send" disabled={!text.trim()}>
          <SendHorizontal size={15} />
        </button>
      </div>
    </>
  )

  if (variant === 'inline') {
    return <div className="aiw-panel aiw-inline">{panelBody}</div>
  }

  if (variant === 'modal') {
    return (
      <>
        {!open && (
          <button className="aiw-launcher" onClick={() => chat.setOpen(true)} title={launcherLabel}>
            <MessageCircle size={20} />
          </button>
        )}
        {open && (
          <div
            className="aiw-backdrop"
            onClick={() => { if (dismissOnBackdrop) chat.setOpen(false) }}
          >
            <div
              ref={dialogRef}
              className="aiw-panel aiw-modal"
              role="dialog"
              aria-modal="true"
              aria-label={launcherLabel}
              onClick={e => e.stopPropagation()}
            >
              {panelBody}
            </div>
          </div>
        )}
      </>
    )
  }

  // corner (default)
  return (
    <>
      {open && <div className="aiw-panel aiw-corner">{panelBody}</div>}
      {!open && (
        <button className="aiw-launcher" onClick={() => chat.setOpen(true)} title={launcherLabel}>
          <MessageCircle size={20} />
        </button>
      )}
    </>
  )
}
