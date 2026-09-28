// ════════════════════════════════════════════════════════════════════
// Card registry (ADR-0005 §3): type → Renderer. Neue Renderer = eine
// Zeile Registrierung; unbekannte Typen fallen auf GenericCard — eine
// Karte zu erfinden kostet heute nur eine Persona-Änderung, hübsch
// rendern darf später kommen.
// ════════════════════════════════════════════════════════════════════
import { KvTable } from './GenericCard.jsx'

// chart: Zahlen-Reihe als SVG-Balkendiagramm
// data: { unit?: "EUR Mio", bars: [{ label, value }, …] }
function ChartCard({ card }) {
  const d = card.data && typeof card.data === 'object' ? card.data : {}
  const bars = (Array.isArray(d.bars) ? d.bars : [])
    .filter((b) => b && Number.isFinite(Number(b.value)))
    .slice(0, 24)
    .map((b) => ({ label: String(b.label ?? '').slice(0, 12), value: Number(b.value) }))
  if (!bars.length) return <KvTable data={d} />
  const max = Math.max(...bars.map((b) => Math.abs(b.value)), 1e-9)
  const fmt = (v) => Math.abs(v) >= 1e9 ? (v / 1e9).toFixed(1) + ' Mrd'
    : Math.abs(v) >= 1e6 ? (v / 1e6).toFixed(1) + ' Mio'
    : Math.abs(v) >= 1e4 ? (v / 1e3).toFixed(0) + ' k'
    : String(Math.round(v * 100) / 100)
  const W = 100 / bars.length
  return (
    <div className="cv-chart">
      {d.unit && <div className="cv-chart-unit">{String(d.unit).slice(0, 40)}</div>}
      <div className="cv-chart-bars">
        {bars.map((b, i) => (
          <div key={i} className="cv-chart-col" style={{ width: `calc(${W}% - 4px)` }} title={`${b.label}: ${fmt(b.value)}${d.unit ? ' ' + d.unit : ''}`}>
            <span className="cv-chart-val">{fmt(b.value)}</span>
            <div className="cv-chart-bar" style={{ height: `${Math.max(2, Math.abs(b.value) / max * 72)}px`, opacity: b.value < 0 ? 0.45 : 1 }} />
            <span className="cv-chart-label">{b.label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

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
  chart: ChartCard,
}
