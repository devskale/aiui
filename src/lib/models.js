// ════════════════════════════════════════════════════════════════════
// models.js — allowed-models persistence (localStorage)
// ════════════════════════════════════════════════════════════════════

const KEY = 'piui:allowedModels'

/** Get the allow-list. Returns null = all models allowed (default). */
export function getAllowedModels() {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

/** Set the allow-list. Pass null to reset to "all allowed". */
export function setAllowedModels(models) {
  if (models === null) {
    localStorage.removeItem(KEY)
  } else {
    localStorage.setItem(KEY, JSON.stringify(models))
  }
}

/** Returns true if a given "provider@id" model should be visible. */
export function isModelAllowed(modelId, allowed) {
  if (!allowed || allowed.length === 0) return true // null/empty = all
  return allowed.includes(modelId)
}

/**
 * Flatten the /api/models response into an array of "provider@id" strings.
 * Handles both array and { provider: [ids] } shapes.
 */
export function flattenModels(data) {
  const flat = []
  if (Array.isArray(data)) {
    data.forEach(m => {
      const id = typeof m === 'string' ? m : (m.id || m.name)
      if (id) flat.push(id)
    })
  } else if (typeof data === 'object' && data) {
    for (const [provider, list] of Object.entries(data)) {
      if (Array.isArray(list)) {
        list.forEach(m => {
          const id = typeof m === 'string' ? m : (m.id || m.name)
          if (id) flat.push(`${provider}@${id}`)
        })
      }
    }
  }
  return flat
}

/** Group flat "provider@id" strings into { provider: [ids] }. */
export function groupModels(flat) {
  const grouped = {}
  for (const entry of flat) {
    const idx = entry.indexOf('@')
    if (idx < 0) {
      // No provider prefix — put under 'other'
      ;(grouped['other'] ||= []).push(entry)
    } else {
      const provider = entry.slice(0, idx)
      const id = entry.slice(idx + 1)
      ;(grouped[provider] ||= []).push(id)
    }
  }
  return grouped
}
