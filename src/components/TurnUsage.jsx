// ════════════════════════════════════════════════════════════════════
// TurnUsage — Per-Turn Token/Cost-Zeile am abgeschlossenen Assistant-Turn
// (Issue per-turn-usage-workdetails).
//
// Datenquelle: `entry.usage` — das SDK-Message-Objekt trägt exakte
// per-attempt Usage (Pflichtfeld, pi/ai types.ts Usage); Replay via
// fromMessage, live via den message_end-Stash im Reducer. dsh-Regel: die
// Row erscheint NUR bei vollständiger, exakter Buchhaltung — fehlt usage
// (alte Records, Widget-Entries), rendert hier schlicht nichts.
//
// Native <details> (wie GenericCard): Summary zeigt die drei Kernzahlen
// im StatsFooter-Vokabular (↑ in / ↓ out / $), der aufgeklappte Teil die
// Sekundär-Buckets (Cache, Reasoning, Total).
// ════════════════════════════════════════════════════════════════════

function fmtTokens(n) {
  if (!Number.isFinite(n) || n < 0) return '0'
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M'
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'k'
  return String(Math.round(n))
}

function fmtCost(n) {
  if (!Number.isFinite(n) || n <= 0) return null
  return '$' + n.toFixed(4)
}

export function TurnUsage({ usage }) {
  // Ohne exakte Usage keine Row — halbe Zahlen gibt es nicht (dsh-Regel).
  if (!usage || !Number.isFinite(usage.totalTokens)) return null

  const cost = fmtCost(usage.cost?.total)

  return (
    <details className="tu">
      <summary className="tu-sum" title="Token usage and cost of this turn (click for details)">
        <span className="tu-item">↑ {fmtTokens(usage.input)}</span>
        <span className="tu-item">↓ {fmtTokens(usage.output)}</span>
        {cost && <span className="tu-item">{cost}</span>}
      </summary>
      <div className="tu-detail">
        cache read {fmtTokens(usage.cacheRead)} · cache write {fmtTokens(usage.cacheWrite)}
        {Number.isFinite(usage.reasoning) && <> · reasoning {fmtTokens(usage.reasoning)} (in ↓)</>}
        <br />
        total {fmtTokens(usage.totalTokens)} tokens
        {cost && <> · {cost} at catalog price</>}
      </div>
    </details>
  )
}
