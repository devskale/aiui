// ════════════════════════════════════════════════════════════════════
// JumpToLatest — floating „back to bottom" control.
//
// Muster aus chatbot-template (`MessageScrollerButton`) und dsh
// (ui-chat „Scroll ownership": der Back-to-bottom-Button sitzt AUSSERHALB
// des geclippten Transkripts und folgt nur, wenn der Reader nicht klebt).
// Erscheint nur, wenn der Nutzer hochgescrollt hat (!atTail), verschwindet
// am Ende. Bewusst ein reiner Präsentations-Baustein: Sichtbarkeit und
// Scrollziel besitzt App (dort lebt `stickToBottomRef`/`endRef`).
// ════════════════════════════════════════════════════════════════════
import { ArrowDown } from 'lucide-react'

export function JumpToLatest({ onClick }) {
  return (
    <button
      type="button"
      className="jump-latest"
      onClick={onClick}
      title="Jump to latest"
      aria-label="Jump to latest"
    >
      <ArrowDown size={16} />
    </button>
  )
}
