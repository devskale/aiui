// ─── API Client ────────────────────────────────────────────
const API = '/api'

export const DEFAULT_ACCOUNTS = [
  {
    id: 'default',
    name: 'Default',
    baseUrl: 'https://amd1.mooo.com:8123/v1',
    apiKey: 'test23@test34',
    models: ['tu@qwen-3.6-35b', 'tu@qwen-3.5-397b'],
  },
]

export async function apiGet(path) {
  const r = await fetch(`${API}${path}`)
  return r.json()
}

export async function apiPost(path, body) {
  const r = await fetch(`${API}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return r.json()
}

export async function apiPut(path, body) {
  const r = await fetch(`${API}${path}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return r.json()
}

export async function apiDel(path) {
  const r = await fetch(`${API}${path}`, { method: 'DELETE' })
  return r.json()
}

// ─── localStorage helpers ─────────────────────────────────
export function lsGet(k) {
  try { return JSON.parse(localStorage.getItem(k)) } catch { return null }
}
export function lsSet(k, v) {
  localStorage.setItem(k, JSON.stringify(v))
}
