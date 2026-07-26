// ════════════════════════════════════════════════════════════════════
// skills-catalog — read-only search of the public skills.sh catalog.
//
// Discovery only (W6): lets a user see what skills exist so they can ask the
// admin to enable one. aiui's entitlement is default-deny + admin-curated
// (ADR-0001), so this deliberately does NOT install — that would make
// entitlement self-service and change the posture. Enabling stays out of band
// (the admin edits the user's agentDir/settings.json or runs `skills add`).
// ════════════════════════════════════════════════════════════════════
const SEARCH_API = process.env.SKILLS_API_URL || 'https://skills.sh'
const TIMEOUT_MS = 8000

/**
 * Search the public skills.sh catalog. Returns [{ package, name, installs, url }].
 * Never throws on network failure — returns { error } so the caller can show
 * "enabled skills only" gracefully when the catalog is unreachable.
 */
export async function searchCatalog(query, limit = 30) {
  const q = (query || '').trim()
  if (!q) return { results: [] }
  const url = `${SEARCH_API}/api/search?q=${encodeURIComponent(q)}&limit=${limit}`
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(url, { signal: ctrl.signal })
    if (!res.ok) return { error: `catalog HTTP ${res.status}` }
    const data = await res.json()
    const results = (data.skills || []).map(s => ({
      package: `${s.source || s.id}@${s.name}`,
      name: s.name,
      installs: s.installs || 0,
      url: s.id ? `${SEARCH_API}/${s.id}` : '',
    }))
    return { results }
  } catch (e) {
    return { error: e.name === 'AbortError' ? 'catalog timed out' : 'catalog unreachable' }
  } finally {
    clearTimeout(timer)
  }
}
