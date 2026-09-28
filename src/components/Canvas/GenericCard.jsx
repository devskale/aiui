// ════════════════════════════════════════════════════════════════════
// GenericCard — die generischen Fallback-Renderer (ADR-0005 §4): eine
// unbekannte Karte muss trotzdem nützlich rendern — genau das macht
// den Vertrag deploy-frei erweiterbar.
//   object          → key/value-Tabelle (verschachtelt → <details>)
//   homogen. Array  → Tabelle
//   string          → Markdown
//   sonst           → pretty JSON
// Plus ErrorBoundary pro Karte: eine kaputte Karte leert nie das Panel.
// ════════════════════════════════════════════════════════════════════
import { Component } from 'react'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

// ── ErrorBoundary: eine Karte, die wirft, wird zur Fehlerkarte ──
export class CardBoundary extends Component {
  constructor(props) { super(props); this.state = { err: null } }
  static getDerivedStateFromError(err) { return { err } }
  render() {
    if (this.state.err) {
      return <div className="cv-card cv-card--error">Karte konnte nicht gerendert werden: {String(this.state.err).slice(0, 120)}</div>
    }
    return this.props.children
  }
}

const isHomogeneousObjects = (v) =>
  Array.isArray(v) && v.length > 0 && v.every((x) => x && typeof x === 'object' && !Array.isArray(x))

const FN_RE = /^\d{5,6}[a-z]$/
const FN_VIEW = (fn) => `https://skale.dev/firmenindex/?fn=${fn}`

function Value({ v }) {
  if (v == null) return <span className="cv-muted">—</span>
  if (typeof v === 'boolean') return <span>{v ? 'ja' : 'nein'}</span>
  if (typeof v === 'number') return <span className="cv-num">{v}</span>
  if (typeof v === 'string') {
    // FN-Werte verlinken auf die interaktive Firmenindex-Ansicht (Zeitreise,
    // Eigentümer-Graph, Urkunden) — Visualisierung gratis statt Selbstbau.
    if (FN_RE.test(v)) return <a className="cv-fn-link" href={FN_VIEW(v)} target="_blank" rel="noopener noreferrer">{v} ↗</a>
    // Zahlen-/Geld-/Prozentwerte tabellarisch: sortierbarer Blick in kv-Tabellen
    return /^[\s\d.,]+(?:\s?(?:%|EUR|Mrd\.|Mio\.|Mio|TS?D?\$?|[kKmM]?\$|€))?\s*$/.test(v) && /\d/.test(v)
      ? <span className="cv-num">{v}</span>
      : <span>{v}</span>
  }
  if (Array.isArray(v)) {
    if (v.every((x) => typeof x !== 'object')) return <span>{v.join(', ')}</span>
    return <details className="cv-details"><summary>{v.length} Einträge</summary><KvTable data={Object.fromEntries(v.map((x, i) => [i + 1, x]))} /></details>
  }
  return <details className="cv-details"><summary>Objekt</summary><KvTable data={v} /></details>
}

export function KvTable({ data }) {
  const rows = Object.entries(data || {}).slice(0, 60)
  return (
    <table className="cv-kv">
      <tbody>
        {rows.map(([k, v]) => (
          <tr key={k}><td className="cv-kv-key">{k}</td><td><Value v={v} /></td></tr>
        ))}
      </tbody>
    </table>
  )
}

function ArrayTable({ data }) {
  const cols = [...new Set(data.flatMap((o) => Object.keys(o)))].slice(0, 8)
  return (
    <table className="cv-table">
      <thead><tr>{cols.map((c) => <th key={c}>{c}</th>)}</tr></thead>
      <tbody>
        {data.slice(0, 50).map((o, i) => (
          <tr key={i}>{cols.map((c) => <td key={c}><Value v={o[c]} /></td>)}</tr>
        ))}
      </tbody>
    </table>
  )
}

/** Der Fallback-Renderer: schaltet allein auf die Datenform. */
export function GenericCard({ data }) {
  if (typeof data === 'string') {
    return <div className="cv-md"><Markdown remarkPlugins={[remarkGfm]}>{data}</Markdown></div>
  }
  if (isHomogeneousObjects(data)) return <ArrayTable data={data} />
  if (data && typeof data === 'object') return <KvTable data={data} />
  return <pre className="cv-json">{JSON.stringify(data, null, 2)}</pre>
}
