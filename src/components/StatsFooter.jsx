// ════════════════════════════════════════════════════════════════════
// StatsFooter — slim bar showing token usage, cost, and context %
// ════════════════════════════════════════════════════════════════════

function formatTokens(n) {
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M'
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'k'
  return String(n)
}

export function StatsFooter({ stats }) {
  if (!stats) return null

  const { tokens, cost, contextUsage } = stats
  const parts = []

  // Token counts (only show if the model reports usage)
  if (tokens?.total > 0) {
    parts.push({ label: '↑', value: formatTokens(tokens.input), title: 'Input tokens' })
    parts.push({ label: '↓', value: formatTokens(tokens.output), title: 'Output tokens' })
    if (tokens.cacheRead > 0) parts.push({ label: 'cache', value: formatTokens(tokens.cacheRead), title: 'Cache read' })
  }

  // Cost
  if (cost > 0) parts.push({ label: '$', value: cost.toFixed(3), title: 'Total cost' })

  // Context usage (always available when a model is set)
  if (contextUsage) {
    const { percent, contextWindow } = contextUsage
    const pct = percent !== null ? percent.toFixed(1) : '?'
    const cls = percent === null ? '' : percent > 90 ? 'danger' : percent > 70 ? 'warn' : ''
    parts.push({
      label: 'ctx',
      value: `${pct}%/${formatTokens(contextWindow)}`,
      title: 'Context window usage',
      cls,
    })
  }

  if (!parts.length) return null

  return (
    <footer className="stats-footer">
      {parts.map((p, i) => (
        <span key={i} className={`stat-item ${p.cls || ''}`} title={p.title}>
          <span className="stat-label">{p.label}</span>
          <span className="stat-value">{p.value}</span>
        </span>
      ))}
    </footer>
  )
}
