// ════════════════════════════════════════════════════════════════════
// ShortcutHelp — "?" öffnet die Tastatur-Übersicht (Ledger-Item 8;
// dsh ui-shortcuts / pi-web shortcuts pattern). Statischer Content,
// Standard-Modal-Pfad (useModal: Trap, Esc, Fokus-Rückkehr).
// ════════════════════════════════════════════════════════════════════
import { useRef } from 'react'
import { useModal } from '../hooks/useModal'
import { Keyboard } from 'lucide-react'

const SECTIONS = [
  {
    head: 'Global',
    rows: [
      ['Ctrl/Cmd + /  or  ?', 'Toggle this help'],
      ['Ctrl/Cmd + N', 'New chat'],
      ['Ctrl/Cmd + K', 'Focus the composer'],
      ['Esc', 'Close the topmost overlay — else abort the running agent'],
    ],
  },
  {
    head: 'Composer',
    rows: [
      ['Enter', 'Send'],
      ['Shift + Enter', 'New line'],
      ['/', 'Commands menu'],
      ['@', 'File mention'],
    ],
  },
  {
    head: 'Chat & dialogs',
    rows: [
      ['Tab / Shift + Tab', 'Cycle focus — stays inside an open dialog'],
      ['Esc', 'Close dialog / dismiss a toast (topmost first)'],
      ['Click', 'Turn marks on the right edge jump between turns — height = tool count'],
    ],
  },
]

// keys-String → Keycap-Gruppen: 'Tab / Shift + Tab' → [['Tab'],['Shift','Tab']]
function keyChips(keys) {
  return keys.split(' / ').map(alt => alt.split(' + ').filter(Boolean))
}

export function ShortcutHelp({ onClose }) {
  const panelRef = useRef(null)
  useModal(panelRef, { onClose })

  return (
    <div className="overlay" onClick={onClose}>
      <div className="sc-panel" ref={panelRef} role="dialog" aria-modal="true" aria-label="Keyboard shortcuts" onClick={e => e.stopPropagation()}>
        <header className="sp-header">
          <h2><Keyboard size={15} style={{ verticalAlign: '-2px' }} /> Keyboard shortcuts</h2>
          <button className="sp-close" onClick={onClose} aria-label="Close">✕</button>
        </header>
        <div className="sc-body">
          {SECTIONS.map(s => (
            <section key={s.head} className="sc-section">
              <div className="sc-head">{s.head}</div>
              {s.rows.map(([keys, desc]) => (
                <div key={keys + desc} className="sc-row">
                  <span className="sc-keys">
                    {keyChips(keys).map((group, gi) => (
                      <span key={gi} className="sc-alt">
                        {gi > 0 && <span className="sc-plus">/</span>}
                        {group.map((k, i) => (
                          <span key={i} className="sc-chip-group">
                            {i > 0 && <span className="sc-plus">+</span>}
                            <kbd className="sc-kbd">{k}</kbd>
                          </span>
                        ))}
                      </span>
                    ))}
                  </span>
                  <span className="sc-desc">{desc}</span>
                </div>
              ))}
            </section>
          ))}
        </div>
      </div>
    </div>
  )
}
