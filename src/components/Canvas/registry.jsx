// ════════════════════════════════════════════════════════════════════
// Card registry (ADR-0005 §3): type → Renderer. Neue Renderer = eine
// Zeile Registrierung; unbekannte Typen fallen auf GenericCard — eine
// Karte zu erfinden kostet heute nur eine Persona-Änderung, hübsch
// rendern darf später kommen.
// ════════════════════════════════════════════════════════════════════
import { KvTable } from './GenericCard.jsx'

// profile: eine Firma — Titel + kv-Daten (FN, Sitz, Rechtsform, …)
function ProfileCard({ card }) {
  return <KvTable data={card.data && typeof card.data === 'object' ? card.data : { wert: card.data }} />
}

// structure: Beteiligungs-Baum { name, fn?, share?, children[] } —
// geschachtelter Baum mit Konnektor-Linien (CSS, Phase B); Share-Badge + FN.
function StructureNode({ node }) {
  if (!node || typeof node !== 'object') return null
  const children = (node.children || []).slice(0, 40)
  return (
    <div className="cv-node">
      <div className="cv-node-line">
        <span className="cv-node-name">{node.name || '?'}</span>
        {node.fn && <span className="cv-node-fn">{node.fn}</span>}
        {node.share && <span className="cv-node-share">{node.share}</span>}
      </div>
      {children.length > 0 && (
        <div className="cv-tree-children">
          {children.map((c, i) => <StructureNode key={i} node={c} />)}
        </div>
      )}
    </div>
  )
}
function StructureCard({ card }) {
  return (
    <div className="cv-structure">
      <StructureNode node={card.data} />
    </div>
  )
}

export const CARD_REGISTRY = {
  profile: ProfileCard,
  structure: StructureCard,
}
