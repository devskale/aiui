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
 * Flatten the /api/models `providers` field into an array of "provider@id" strings.
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

// ── Pure list-toggle helpers (shared by the allow-list + image-capable UIs) ──
// null/empty `selected` means "all on". Toggling returns the next list, or
// null when the selection again covers every model (normalised to "all").

/** Toggle one model in a selection. Returns next list (or null = all). */
export function toggleModelInList(modelId, selected, allFlat) {
  const current = selected || allFlat
  const next = current.includes(modelId)
    ? current.filter(m => m !== modelId)
    : [...current, modelId]
  return next.length === allFlat.length ? null : next
}

/** Toggle a whole provider's models in a selection. Returns next list (or null = all). */
export function toggleProviderInList(provider, ids, selected, allFlat) {
  const current = selected || allFlat
  const full = ids.map(id => `${provider}@${id}`)
  const allOn = full.every(m => current.includes(m))
  const next = allOn
    ? current.filter(m => !full.includes(m))
    : [...new Set([...current, ...full])]
  return next.length === allFlat.length ? null : next
}

// ── selectModels: derive the client's views from the /api/models response ──
// Pure: the test surface for the fetch→flatten→filter→image math that used
// to be inlined (and duplicated) across App / ModelPicker / SettingsPanel.
//   all         every "provider@id" (the allow-list UI shows all)
//   visible     all filtered by the allow-list (App + Picker)
//   imageModels "provider@id" strings that accept images
export function selectModels(apiData, allowed) {
  const all = flattenModels(apiData?.providers)
  const visible = all.filter(m => isModelAllowed(m, allowed))
  const imageModels = Array.isArray(apiData?.imageModels) ? apiData.imageModels : []
  return { all, visible, imageModels }
}
