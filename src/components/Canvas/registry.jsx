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
// v1 eingerückt mit Share-Badge; Grafik ist Phase B.
function StructureNode({ node, depth = 0 }) {
  if (!node || typeof node !== 'object') return null
  return (
    <div className="cv-node" style={{ marginLeft: depth * 14 }}>
      <div className="cv-node-line">
        <span className="cv-node-name">{node.name || '?'}</span>
        {node.fn && <span className="cv-node-fn">{node.fn}</span>}
        {node.share && <span className="cv-node-share">{node.share}</span>}
      </div>
      {(node.children || []).slice(0, 40).map((c, i) => <StructureNode key={i} node={c} depth={depth + 1} />)}
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
