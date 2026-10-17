// ════════════════════════════════════════════════════════════════════
// LoginModal — username/email + passphrase gate, register & reset tabs
//
// Three modes + two deep links from auth mails:
//   /?verify=TOKEN  → auto-POST /api/auth/verify → session (auto-login)
//   /?reset=TOKEN   → new-passphrase form → /api/auth/reset → session
// The param is stripped from the URL after handling so a refresh or shared
// link never replays the token (single-use server-side anyway).
// ════════════════════════════════════════════════════════════════════
import { useState, useRef, useEffect } from 'react'
import { apiUrl } from '../lib/api'
import { useModal } from '../hooks/useModal'

async function postJson(path, body) {
  const r = await fetch(apiUrl(path), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  let j = null
  try { j = await r.json() } catch { }
  return { ok: r.ok, status: r.status, j }
}

function stripParam(key) {
  const u = new URL(window.location.href)
  if (!u.searchParams.has(key)) return
  u.searchParams.delete(key)
  window.history.replaceState({}, '', u)
}

export function LoginModal({ onSuccess }) {
  const [mode, setMode] = useState('login') // login | register | forgot | newpass
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [passphrase, setPassphrase] = useState('')
  const [inviteCode, setInviteCode] = useState('')
  const [newPass, setNewPass] = useState('')
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [busy, setBusy] = useState(false)
  const [registration, setRegistration] = useState(null)
  const [resetToken, setResetToken] = useState(null)
  const formRef = useRef(null)
  useModal(formRef, { escape: false })

  // registration config (hide the tab when closed)
  useEffect(() => {
    fetch(apiUrl('/api/auth/config')).then(r => r.json())
      .then(c => setRegistration(c.registration))
      .catch(() => setRegistration('closed'))
  }, [])

  // deep links: verify auto-runs, reset switches to the new-passphrase form
  useEffect(() => {
    const q = new URLSearchParams(window.location.search)
    const v = q.get('verify')
    const r = q.get('reset')
    if (v) {
      stripParam('verify')
      setBusy(true); setInfo('Verifying your email…')
      postJson('/api/auth/verify', { token: v }).then(({ ok, j }) => {
        if (ok) { onSuccess?.(); return }
        setBusy(false); setInfo(''); setError(j?.error || 'verification failed')
      })
    } else if (r) {
      stripParam('reset')
      setResetToken(r)
      setMode('newpass')
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps — mount-once by design

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true); setError(''); setInfo('')
    try {
      if (mode === 'login') {
        const { ok, status, j } = await postJson('/api/login', { username: username.trim(), passphrase })
        if (ok) { onSuccess?.(); return }
        setError(j?.error || `Login failed (HTTP ${status})`)
      } else if (mode === 'register') {
        const { ok, status, j } = await postJson('/api/auth/register', {
          email: email.trim(), passphrase, inviteCode: inviteCode.trim() || undefined,
        })
        if (ok) { setMode('login'); setUsername(email.trim()); setInfo(j?.message || 'Check your inbox — the verification link is valid for 30 minutes.'); setPassphrase('') }
        else setError(j?.error || `Registration failed (HTTP ${status})`)
      } else if (mode === 'forgot') {
        const { ok, status, j } = await postJson('/api/auth/reset-request', { email: email.trim() })
        if (ok) { setMode('login'); setInfo(j?.message || 'If the address is registered, a reset link is on its way.') }
        else setError(j?.error || `Request failed (HTTP ${status})`)
      } else if (mode === 'newpass') {
        const { ok, status, j } = await postJson('/api/auth/reset', { token: resetToken, passphrase: newPass })
        if (ok) { onSuccess?.(); return }
        setError(j?.error || `Reset failed (HTTP ${status})`)
      }
    } catch {
      setError('Network error — check your connection.')
    } finally {
      setBusy(false)
    }
  }

  const tabs = [
    ['login', 'Log in'],
    ...(registration && registration !== 'closed' ? [['register', 'Register']] : []),
  ]

  return (
    <div className="login-overlay">
      <form id="aiui-login-form" ref={formRef} className="login-modal" role="dialog" aria-modal="true"
        aria-label={mode === 'register' ? 'Register' : 'Log in'} onSubmit={submit}>
        <div className="login-title">πui</div>

        {tabs.length > 1 && (
          <div className="login-tabs" role="tablist">
            {tabs.map(([m, label]) => (
              <button key={m} type="button" role="tab" aria-selected={mode === m}
                className={'login-tab' + (mode === m ? ' active' : '')}
                onClick={() => { setMode(m); setError(''); setInfo('') }}>{label}</button>
            ))}
          </div>
        )}

        {mode === 'login' && (<>
          <input id="aiui-username" className="login-input" value={username}
            onChange={e => setUsername(e.target.value)} placeholder="username or email"
            autoComplete="username" autoFocus />
          <input id="aiui-passphrase" className="login-input" type="password" value={passphrase}
            onChange={e => setPassphrase(e.target.value)} placeholder="passphrase"
            autoComplete="current-password" />
        </>)}

        {mode === 'register' && (<>
          <input className="login-input" type="email" value={email}
            onChange={e => setEmail(e.target.value)} placeholder="email" autoComplete="email" autoFocus />
          <input className="login-input" type="password" value={passphrase}
            onChange={e => setPassphrase(e.target.value)} placeholder="passphrase (min 8 chars)"
            autoComplete="new-password" />
          {registration === 'invite' && (
            <input className="login-input" value={inviteCode}
              onChange={e => setInviteCode(e.target.value)} placeholder="invite code" autoComplete="off" />
          )}
        </>)}

        {mode === 'forgot' && (<>
          <input className="login-input" type="email" value={email}
            onChange={e => setEmail(e.target.value)} placeholder="your email" autoComplete="email" autoFocus />
        </>)}

        {mode === 'newpass' && (<>
          <div className="login-info">Set a new passphrase to finish the reset.</div>
          <input className="login-input" type="password" value={newPass}
            onChange={e => setNewPass(e.target.value)} placeholder="new passphrase (min 8 chars)"
            autoComplete="new-password" autoFocus />
        </>)}

        {error && <div className="login-error">{error}</div>}
        {info && <div className="login-info">{info}</div>}

        <button id="aiui-login-submit" className="login-submit" type="submit"
          disabled={busy
            || (mode === 'login' && (!username.trim() || !passphrase))
            || (mode === 'register' && (!email.trim() || passphrase.length < 8))
            || (mode === 'forgot' && !email.trim())
            || (mode === 'newpass' && newPass.length < 8)}>
          {busy ? '…' : mode === 'login' ? 'Log in' : mode === 'register' ? 'Create account' : mode === 'forgot' ? 'Send reset link' : 'Set passphrase'}
        </button>

        {mode === 'login' && (
          <button type="button" className="login-linklike" onClick={() => { setMode('forgot'); setError(''); setInfo('') }}>
            Forgot passphrase?
          </button>
        )}
        {mode === 'forgot' && (
          <button type="button" className="login-linklike" onClick={() => { setMode('login'); setError(''); setInfo('') }}>
            Back to log in
          </button>
        )}
      </form>
    </div>
  )
}
