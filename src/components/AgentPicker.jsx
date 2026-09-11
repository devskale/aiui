// ════════════════════════════════════════════════════════════════════
// AgentPicker — full-screen Agent selection overlay (ADR-0004).
// Switching agents starts a new chat: the persona is bound when the
// session is built, so a rebuild is how a different Agent takes effect.
// ════════════════════════════════════════════════════════════════════
import { useEffect, useRef } from 'react'
import { useEscape } from '../hooks/useEscape'
import { Mic } from 'lucide-react'

export function AgentPicker({ activeAgent, agents, streaming, onSelect, onClose }) {
  const ref = useRef(null)
  useEffect(() => { ref.current?.focus() }, [])
  useEscape(onClose)

  return (
    <div className="model-picker-overlay" onClick={onClose}>
      <div className="model-picker" onClick={e => e.stopPropagation()}>
        <div className="mp-search">
          <input
            ref={ref}
            value=""
            readOnly
            placeholder="Choose an agent — switching starts a new chat"
          />
        </div>
        <div className="mp-list">
          {agents.map(a => (
            <button
              key={a.id}
              className={`mp-model mp-agent ${a.id === activeAgent ? 'active' : ''}`}
              disabled={streaming}
              onClick={() => onSelect(a.id)}
            >
              <span className="mp-agent-row">
                <span className="mp-agent-name">{a.name}</span>
                {a.stt && <span className="mp-agent-mic" title="Voice input"><Mic size={12} /></span>}
              </span>
              {a.description && <span className="mp-agent-desc">{a.description}</span>}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
