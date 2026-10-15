// ════════════════════════════════════════════════════════════════════
// TurnRail — Navigations-Marks am rechten Rand des Transkripts
// (Issue turn-navigation).
//
// dsh-Regeln, hier übernommen: Die Rail sitzt AUSSERHALB des Chat-Flows
// (absolute Positionierung in .main — kein Layout-Shift des Streams), und
// sie blendet sich aus, wenn die verfügbare Transkript-Breite zu klein ist
// (dsh: ≤900px — hier als Fenster-Media-Query genähert: 1180px Fenster
// ≈ 930px Content neben der 248px-Sidebar). Marks = User-Turns; Klick
// springt zum Turn — auch außerhalb des Lazy-Render-Fensters (App deckt
// das Fenster auf und scrollt nach dem Render).
// V1 bewusst simpel: native Buttons (Tab/Enter/Fokus-Ring gratis), Tooltip
// per title + aria-label. Aktive-Turn-Hervorhebung folgt später.
// ════════════════════════════════════════════════════════════════════
import { useMemo } from 'react'
import { turnMarks, markHeight } from '../lib/turn-rail'

export function TurnRail({ entries, startIndex, onJump }) {
  const marks = useMemo(() => turnMarks(entries), [entries])
  if (!marks.length || !onJump) return null
  return (
    <nav className="turn-rail" aria-label="Conversation turns">
      {marks.map(m => (
        <button
          key={m.index}
          type="button"
          className={`turn-mark ${m.index < startIndex ? 'outside' : ''}`}
          title={m.title}
          aria-label={`Turn ${m.number}: ${m.title}${m.weight ? ` (${m.weight} tool calls)` : ''}`}
          style={{ height: markHeight(m.weight) }}
          onClick={() => onJump(m.index)}
        />
      ))}
    </nav>
  )
}
