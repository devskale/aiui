// ════════════════════════════════════════════════════════════════════
// LoginModal — username + passphrase gate, shown over the app shell
// ════════════════════════════════════════════════════════════════════
import { useState } from 'react'
import { apiUrl } from '../lib/api'

export function LoginModal({ onSuccess }) {
  const [username, setUsername] = useState('')
  const [passphrase, setPassphrase] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      const r = await fetch(apiUrl('/api/login'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), passphrase }),
      })
      if (r.ok) {
        onSuccess?.()
      } else if (r.status === 429) {
        setError('Too many attempts — wait a minute.')
      } else {
        setError('Invalid username or passphrase.')
      }
    } catch {
      setError('Login failed — check your connection.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="login-overlay">
      <form id="aiui-login-form" className="login-modal" onSubmit={submit}>
        <div className="login-title">πui</div>
        <input
          id="aiui-username"
          className="login-input"
          value={username}
          onChange={e => setUsername(e.target.value)}
          placeholder="username"
          autoComplete="username"
          autoFocus
        />
        <input
          id="aiui-passphrase"
          className="login-input"
          type="password"
          value={passphrase}
          onChange={e => setPassphrase(e.target.value)}
          placeholder="passphrase"
          autoComplete="current-password"
        />
        {error && <div className="login-error">{error}</div>}
        <button id="aiui-login-submit" className="login-submit" type="submit" disabled={busy || !username.trim() || !passphrase}>
          {busy ? '…' : 'Log in'}
        </button>
      </form>
    </div>
  )
}
