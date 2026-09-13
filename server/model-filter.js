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
//   - A pattern is an ANCHORED PREFIX on the full id "provider@id"; a trailing
//     "*" is allowed and purely cosmetic. All three forms therefore work:
//       "unii@tu@qwen-3.6-35b-vllm"   exact model
//       "unii@tu@"                     every model of that provider
//       "unii@tu@qwen*"                every qwen model at that provider
//   - Fallback: a pattern may also match the bare model id ("qwen*" when ids
//     are unique across providers).
// ════════════════════════════════════════════════════════════════════

/** Normalize a config value (string | array | absent) to a list of match
 *  prefixes — trailing "*" stripped, empties dropped. */
export function patternsOf(v) {
  return (Array.isArray(v) ? v : v != null ? [v] : [])
    .map(p => String(p).trim().replace(/\*+$/, ''))
    .filter(Boolean)
}

export function patternMatches(prefix, fullId, bareId) {
  return fullId.startsWith(prefix) || bareId.startsWith(prefix)
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
