// API base path — resolves to '/aiui/' in production (with base), '/' in dev
const BASE = import.meta.env.BASE_URL.replace(/\/$/, '')

export function apiUrl(path) {
  return `${BASE}${path}`
}
