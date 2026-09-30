// ════════════════════════════════════════════════════════════════════
// EmptyState — welcome screen. With more than one Agent available it
// doubles as the agent chooser (ADR-0004). Agents may carry `examples`
// (starter prompts from their frontmatter): the active agent's examples
// render as clickable chips that prefill the input — quick onboarding,
// one click from "what can this do?" to a running research.
// ════════════════════════════════════════════════════════════════════
import { Mic, Sparkles } from 'lucide-react'

export function EmptyState({ agents = [], activeAgent = 'default', onPickAgent, onPickExample }) {
  const chooser = agents.length > 1 && onPickAgent
  const current = agents.find(a => a.id === activeAgent) || agents[0]
  const examples = (current?.examples || []).slice(0, 4)
  return (
    <div className="empty-state">
      <div className="empty-logo">π</div>
      <div className="empty-title">Welcome to πui</div>
      <div className="empty-sub">
        {chooser ? 'Pick an agent, or just start typing.' : 'A clean interface for the pi agent. Upload images and files, ask questions, build things.'}
      </div>
      {chooser && (
        <div className="agent-cards">
          {agents.map(a => (
            <button key={a.id} className={`agent-card ${a.id === activeAgent ? 'active' : ''}`} onClick={() => onPickAgent(a.id)}>
              <span className="agent-card-name">
                {a.id === 'default' ? 'π' : a.name.slice(0, 1)}
                {a.stt && <Mic size={12} className="agent-card-mic" />}
              </span>
              <span className="agent-card-title">{a.name}</span>
              {a.description && <span className="agent-card-desc">{a.description}</span>}
            </button>
          ))}
        </div>
      )}
      {examples.length > 0 && onPickExample && (
        <div className="empty-examples">
          <div className="empty-examples-head">
            <Sparkles size={12} /> Beispiele
          </div>
          <div className="empty-examples-list">
            {examples.map((ex, i) => (
              <button key={i} className="example-chip" onClick={() => onPickExample(ex)} title={ex}>
                {ex.length > 72 ? ex.slice(0, 72) + '…' : ex}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
