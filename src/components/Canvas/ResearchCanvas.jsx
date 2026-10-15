// ════════════════════════════════════════════════════════════════════
// ResearchCanvas — das rechtsseitige Recherche-Panel (ADR-0005):
// materialisiert sich mit den ersten Canvas-Daten, Progress / Karten /
// Lücken / nächste Schritte. `next` nutzt dieselben klickbaren Chips
// wie der Chat-Block (FollowUps aus StreamEntry) — eine Komponente,
// zwei Oberflächen.
//
// Zustände aus parseCanvas: normal | unsupported | parseError →
// Notice + raw JSON statt Stillstand (Versionstoleranz).
// ════════════════════════════════════════════════════════════════════
import { useState } from 'react'
import { X, FileText, CircleCheck, CircleDashed, Loader2, TriangleAlert } from 'lucide-react'
import { FollowUps } from '../StreamEntry.jsx'
import { CARD_REGISTRY } from './registry.jsx'
import { CardBoundary, GenericCard } from './GenericCard.jsx'
import { copy } from '../../lib/copy'

const PROGRESS_ICON = {
  done: <CircleCheck size={13} className="cv-pg-ic done" />,
  running: <Loader2 size={13} className="cv-pg-ic running spin" />,
  pending: <CircleDashed size={13} className="cv-pg-ic pending" />,
  degraded: <TriangleAlert size={13} className="cv-pg-ic degraded" />,
}

function ProgressList({ progress }) {
  if (!progress.length) return null
  return (
    <section className="cv-section">
      <div className="cv-section-head">{copy.progress}</div>
      {progress.map((p, i) => (
        <div key={i} className={`cv-pg-row ${p.state}`}>
          {PROGRESS_ICON[p.state] || PROGRESS_ICON.pending}
          <span className="cv-pg-label">{p.label}</span>
          {p.note && <span className="cv-pg-note">{p.note}</span>}
        </div>
      ))}
    </section>
  )
}

// Gaps: die Regexes klassifizieren DEUTSCHEN Agent-Text (Datenvertrag) —
// nur die Badge-Labels sind UI-Chrome (EN, via copy.gapBadge).
function GapsList({ gaps }) {
  if (!gaps.length) return null
  return (
    <section className="cv-section">
      <div className="cv-section-head">{copy.gaps}</div>
      {gaps.map((g, i) => {
        const kind = /nicht\s+(öffentl|public)/i.test(g) ? 'nonpublic'
          : /nicht\s+recherchiert/i.test(g) ? 'notsearched' : ''
        return (
          <div key={i} className={`cv-gap ${kind}`}>
            {kind && <span className={`cv-gap-badge ${kind}`}>{copy.gapBadge[kind]}</span>}
            <span className="cv-gap-text">{g.replace(/nicht\s+(öffentl\w*|recherchiert)/gi, '').replace(/^[\s:–-]+/, '')}</span>
          </div>
        )
      })}
    </section>
  )
}

function CanvasCard({ card }) {
  const Renderer = CARD_REGISTRY[card.type]
  return (
    <div className="cv-card">
      {card.title && <div className="cv-card-title">{card.title}</div>}
      <CardBoundary>
        {Renderer ? <Renderer card={card} /> : <GenericCard data={card.data} />}
      </CardBoundary>
      {card.source && <a className="cv-card-source" href="#" title={copy.sourceRef(card.source)}>{card.source}</a>}
    </div>
  )
}

export function ResearchCanvas({ state, onAsk, onClose }) {
  const c = state?.canvas
  if (!c) return null // keine Daten → kein Panel (exakt das heutige UI)

  if (c.unsupported || c.parseError) {
    return (
      <aside className="canvas-panel">
        <div className="cv-header">
          <span className="cv-title">Canvas</span>
          {onClose && <button className="cv-close" onClick={onClose} title={copy.closePanel} aria-label="Close panel"><X size={14} /></button>}
        </div>
        <div className="cv-notice">
          {c.unsupported ? copy.canvasUnsupported : copy.canvasParseError}
        </div>
        <pre className="cv-json">{c.raw}</pre>
      </aside>
    )
  }

  return (
    <aside className="canvas-panel">
      <div className="cv-header">
        <div className="cv-header-text">
          {c.title && <span className="cv-title">{c.title}</span>}
          {c.subtitle && <span className="cv-subtitle">{c.subtitle}</span>}
        </div>
        {onClose && <button className="cv-close" onClick={onClose} title={copy.closePanel} aria-label="Close panel"><X size={14} /></button>}
      </div>

      <div className="cv-body">
        <ProgressList progress={c.progress} />

        {c.cards.length > 0 && (
          <section className="cv-section">
            <div className="cv-section-head">{copy.cards}</div>
            {c.cards.map((card, i) => <CanvasCard key={i} card={card} />)}
          </section>
        )}

        <GapsList gaps={c.gaps} />

        {c.next.length > 0 && (
          <section className="cv-section">
            <FollowUps questions={c.next} onAsk={onAsk} />
          </section>
        )}

        {c.report && (
          <div className="cv-report-hint"><FileText size={12} /> Report: {c.report}</div>
        )}
      </div>
    </aside>
  )
}
