// ════════════════════════════════════════════════════════════════════
// EmptyState — welcome screen. With more than one Agent available it
// doubles as the agent chooser (ADR-0004).
// ════════════════════════════════════════════════════════════════════
import { Mic } from 'lucide-react'

export function EmptyState({ agents = [], activeAgent = 'default', onPickAgent }) {
  const chooser = agents.length > 1 && onPickAgent
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
    </div>
  )
}
