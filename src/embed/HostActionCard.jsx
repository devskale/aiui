// ════════════════════════════════════════════════════════════════════
// HostActionCard — die sichtbare Bestätigung einer Host-Action
// (ADR-0006 Phase 2; RiskConfirmation-Muster aus ideas.md §13:
// Warn-Icon + Beschreibung, Confirm erst nach explizitem Check).
//
// Nichts auf der Host-Seite passiert, bevor der Besucher hier bestätigt:
// das ist die Security-Eigenschaft der ganzen Feature-Zelle. Decline
// erreicht den Host nie (nur der geparkte Tool-Call löst sich auf).
// ════════════════════════════════════════════════════════════════════
import { useState } from 'react'
import { ShieldAlert } from 'lucide-react'

export function HostActionCard({ card: { id, action, description, args }, onConfirm, onDecline }) {
  const [checked, setChecked] = useState(false)
  return (
    <div className="aiw-hacard" role="alertdialog" aria-label={`Host action ${action}`}>
      <div className="aiw-hahead">
        <ShieldAlert size={16} aria-hidden />
        <span className="aiw-hatitle">Aktion auf dieser Seite</span>
      </div>
      <div className="aiw-hadesc">
        <strong>{action}</strong> — {description}
      </div>
      {args != null && <pre className="aiw-haargs">{typeof args === 'string' ? args : JSON.stringify(args)}</pre>}
      <label className="aiw-hacheck">
        <input type="checkbox" checked={checked} onChange={e => setChecked(e.target.checked)} />
        Ich möchte diese Aktion ausführen
      </label>
      <div className="aiw-harow">
        <button className="aiw-hadecline" onClick={() => onDecline(id)}>Ablehnen</button>
        <button className="aiw-haconfirm" onClick={() => onConfirm({ id, action, args })} disabled={!checked}>
          Ausführen
        </button>
      </div>
    </div>
  )
}
