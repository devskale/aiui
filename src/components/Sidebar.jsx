// ════════════════════════════════════════════════════════════════════
// Sidebar — new chat, recent, model info, commands
// ════════════════════════════════════════════════════════════════════
import { useState, useEffect } from 'react'

export function Sidebar({ open, onToggle, model, streaming, connected }) {
  return (
    <aside className={`sidebar ${open ? '' : 'collapsed'}`}>
      <div className="sb-header">
        <div className="sb-brand">
          <span className="sb-logo">π</span>
          <span className="sb-title">πui</span>
        </div>
        <button className="sb-icon-btn" onClick={onToggle}>◀</button>
      </div>

      <nav className="sb-nav">
        <button className="sb-nav-item" onClick={() => {/* new chat */}}>
          <span>＋</span><span>New Chat</span>
        </button>
      </nav>

      <div className="sb-section">
        <span className="sb-label">Recent</span>
      </div>

      <div className="sb-content">
        {!connected && (
          <div className="connecting">
            <span className="thinking-dot" />
            <span>Connecting...</span>
          </div>
        )}
      </div>

      <div className="sb-footer">
        <div className="sb-avatar">π</div>
        <span className="sb-model-name">{model || 'loading...'}</span>
      </div>
    </aside>
  )
}
