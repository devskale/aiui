// ════════════════════════════════════════════════════════════════════
// model-filter — include / notInclude patterns over the model catalog
//
// Config lives in ~/.aiui-auth.json (aiui-owned like the quotas, NOT in the
// SDK's settings.json — an unknown key there could be dropped by the SDK's
// schema). Wired in server/auth.js: modelFilterFor(user):
//   { "models":     { "include": [...], "notInclude": [...] },      // deployment-wide
//     "userModels": { "<user>": { "include": [...], "notInclude": [...] } } }
// A per-User block REPLACES the deployment-wide one (same semantics as the
// credentials override).
//
// Semantics:
//   - include empty/absent → everything allowed; otherwise a model must match
//     at least one include pattern.
//   - notInclude always wins over include.
//   - A pattern is ANCHORED at the start of the full id "provider@id":
//       without "*" it is a prefix    "unii@tu@"         → every model of that provider
//       with "*" it is a glob         "unii@tu@qwen*"    → every qwen model there
//                                     "kilo@*free*"      → ids containing "free"
//                                     "opencode@*free"   → ids ending in "free"
//       an exact id matches as a prefix of itself.
//   - Fallback: a pattern may also match the bare model id ("qwen*" when ids
//     are unique across providers).
// ════════════════════════════════════════════════════════════════════

/** Normalize a config value (string | array | absent) to a list of match
 *  patterns — trimmed, empties dropped. Stars are preserved (glob syntax). */
export function patternsOf(v) {
  return (Array.isArray(v) ? v : v != null ? [v] : [])
    .map(p => String(p).trim())
    .filter(Boolean)
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

export function patternMatches(pattern, fullId, bareId) {
  if (pattern.includes('*')) {
    // anchored glob: "a*b*c" → ^a.*b.*c
    const re = new RegExp('^' + pattern.split('*').map(escapeRe).join('.*'))
    return re.test(fullId) || re.test(bareId)
  }
  return fullId.startsWith(pattern) || bareId.startsWith(pattern)
}

/** The gate for one model. filter = { include, notInclude } — raw or
 *  normalized (patternsOf is idempotent, so normalizing here is safe). */
export function modelAllowed(filter, fullId, bareId) {
  const include = patternsOf(filter?.include)
  const notInclude = patternsOf(filter?.notInclude)
  if (include.length && !include.some(p => patternMatches(p, fullId, bareId))) return false
  if (notInclude.some(p => patternMatches(p, fullId, bareId))) return false
  return true
}

/** models: [{ provider, id }, ...] → the subset the filter lets through. */
export function filterModels(models, filter) {
  return models.filter(m => modelAllowed(filter, `${m.provider}@${m.id}`, m.id))
}
