// ════════════════════════════════════════════════════════════════════
// quota — per-user daily query counter
//
// Distinct from auth ("how much you can do" vs "who you are"). In-memory,
// keyed by UTC date → resets at the day boundary. consumeQuota() increments
// iff allowed; peekQuota() is read-only (for /api/me). limit null = unlimited.
// ════════════════════════════════════════════════════════════════════

const today = () => new Date().toISOString().slice(0, 10) // UTC YYYY-MM-DD
const counts = new Map() // user → { date, used }

function entry(user) {
  const d = today()
  let e = counts.get(user)
  if (!e || e.date !== d) { e = { date: d, used: 0 }; counts.set(user, e) }
  return e
}

/** Increment the user's daily count iff under the limit. limit null = no cap. */
export function consumeQuota(user, limit) {
  if (user === null || limit === null || limit === undefined) return { allowed: true, used: 0, limit: null }
  const e = entry(user)
  if (e.used >= limit) return { allowed: false, used: e.used, limit }
  e.used += 1
  return { allowed: true, used: e.used, limit }
}

/** Read-only peek (for /api/me). Resets with the day. */
export function peekQuota(user, limit) {
  if (user === null || limit === null || limit === undefined) return { used: 0, limit: null }
  const e = counts.get(user)
  return { used: e && e.date === today() ? e.used : 0, limit }
}
