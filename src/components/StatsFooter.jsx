// ════════════════════════════════════════════════════════════════════
// StatsFooter — slim bar showing token usage, cost, context %, compaction
// ════════════════════════════════════════════════════════════════════
import { Archive, Loader2 } from 'lucide-react'
import { apiUrl } from '../lib/api'

function formatTokens(n) {
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M'
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'k'
  return String(n)
}

export function StatsFooter({ stats, isCompacting, autoCompactionEnabled }) {
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
  const contextPercent = contextUsage?.percent
  const contextHigh = contextPercent !== null && contextPercent > 70

  if (!parts.length && !contextUsage) return null

  const handleCompact = () => {
    fetch(apiUrl('/api/compact'), { method: 'POST' })
  }

  const handleToggleAuto = () => {
    fetch(apiUrl('/api/compaction/auto'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: !autoCompactionEnabled }),
    })
  }

  return (
    <footer className="stats-footer">
      {parts.map((p, i) => (
        <span key={i} className={`stat-item ${p.cls || ''}`} title={p.title}>
          <span className="stat-label">{p.label}</span>
          <span className="stat-value">{p.value}</span>
        </span>
      ))}

      {contextUsage && (
        <>
          <span className={`stat-item ${contextHigh ? 'warn' : ''}`} title="Context window usage">
            <span className="stat-label">ctx</span>
            <span className="stat-value">
              {contextPercent !== null ? contextPercent.toFixed(1) : '?'}%/{formatTokens(contextUsage.contextWindow)}
            </span>
          </span>

          {isCompacting ? (
            <span className="stat-item compacting" title="Compacting…">
              <Loader2 size={11} className="spin" />
              <span className="stat-value">compacting…</span>
            </span>
          ) : (
            <button
              className="compact-btn"
              onClick={handleCompact}
              title="Compact conversation (summarize old context)"
            >
              <Archive size={11} />
            </button>
          )}

          <button
            className={`auto-toggle ${autoCompactionEnabled ? 'on' : 'off'}`}
            onClick={handleToggleAuto}
            title={`Auto-compaction ${autoCompactionEnabled ? 'enabled' : 'disabled'}`}
          >
            auto
          </button>
        </>
      )}
    </footer>
  )
}
