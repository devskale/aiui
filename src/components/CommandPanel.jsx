// ════════════════════════════════════════════════════════════════════
// CommandPanel — shows skills, prompts, extensions from agent
// ════════════════════════════════════════════════════════════════════
import { useState, useEffect } from 'react'

export function CommandPanel() {
  const [commands, setCommands] = useState(null)

  useEffect(() => {
    fetch('/api/commands')
      .then(r => r.json())
      .then(setCommands)
      .catch(() => {})
  }, [])

  if (!commands) return null

  const groups = [
    { key: 'skills', label: 'Skills', icon: '⚡' },
    { key: 'prompts', label: 'Prompts', icon: '📝' },
    { key: 'extensions', label: 'Extensions', icon: '🔌' },
  ]

  return (
    <div className="cmd-panel">
      {groups.map(({ key, label, icon }) =>
        commands[key]?.length > 0 ? (
          <div key={key} className="cmd-group">
            <div className="cmd-group-title">{label}</div>
            {commands[key].map(item => (
              <button key={item.name} className="cmd-item">
                <span className="cmd-item-icon">{icon}</span>
                <span className="cmd-item-name">{item.name}</span>
              </button>
            ))}
          </div>
        ) : null
      )}
    </div>
  )
}
