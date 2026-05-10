import { useState } from 'react'
import { Icons } from '../lib/icons'

// ════════════════════════════════════════════════════════════════════
// SETTINGS MODAL
// ════════════════════════════════════════════════════════════════════
export function SettingsModal({ accounts, account, onClose, onSave }) {
  const [name, setName] = useState(account?.name || '')
  const [baseUrl, setBaseUrl] = useState(account?.baseUrl || '')
  const [apiKey, setApiKey] = useState(account?.apiKey || '')
  const [modelsStr, setModelsStr] = useState((account?.models || []).join('\n'))

  const handleSave = () => {
    const models = modelsStr.split('\n').map(s => s.trim()).filter(Boolean)
    const updated = accounts.map(a => ({ ...a }))
    if (updated[0]) Object.assign(updated[0], { name, baseUrl, apiKey, models })
    onSave(updated)
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-head">
          <h2>Settings</h2>
          <button className="sb-icon-btn" onClick={onClose}><Icons.close /></button>
        </div>
        <div className="modal-body">
          <h3 className="sec-label">Provider</h3>
          <div className="acc-card active">
            <div className="acc-edit">
              <input value={name} onChange={e => setName(e.target.value)} placeholder="Name" />
              <input value={baseUrl} onChange={e => setBaseUrl(e.target.value)} placeholder="Base URL" />
              <input value={apiKey} type="password" onChange={e => setApiKey(e.target.value)} placeholder="API Key" />
            </div>
          </div>
          <h3 className="sec-label">Models (one per line)</h3>
          <textarea className="models-textarea" value={modelsStr}
            onChange={e => setModelsStr(e.target.value)} rows={4}
            placeholder={'tu@qwen-3.6-35b\ntu@qwen-3.5-397b'} />
        </div>
        <div className="modal-foot">
          <button className="btn btn-outline" onClick={async (e) => {
            const b = e.target
            b.textContent = 'Testing...'
            try {
              const r = await fetch('/api/e2e')
              const d = await r.json()
              alert('E2E ' + d.status + ' | DB:' + d.db + ' | Files:' + d.files_dir + ' | LLM:' + d.llm)
            } catch (e) { alert('E2E failed: ' + e.message) }
            finally { b.textContent = 'Run E2E Test' }
          }}>Run E2E Test</button>
          <button className="btn btn-primary" onClick={handleSave}>Save & Close</button>
        </div>
      </div>
    </div>
  )
}
