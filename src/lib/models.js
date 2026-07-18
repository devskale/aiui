// ════════════════════════════════════════════════════════════════════
// models.js — allowed-models persistence (localStorage)
// ════════════════════════════════════════════════════════════════════

const KEY = 'piui:allowedModels'

/** Max models rendered as DOM nodes at once (picker list, settings search).
 *  The catalog can hold 1000+; capping bounds the DOM so opens stay fast. */
export const MODEL_RENDER_CAP = 60

const FAV_KEY = 'piui:favModels'

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

// ── Favorite models (preferred in the picker; first fav = default model) ──
// A plain list (empty = no favorites). Independent of the allow-list.

/** Get the favorites list. Returns [] when unset. */
export function getFavModels() {
  try {
    const raw = localStorage.getItem(FAV_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

/** Set the favorites list. Pass [] to clear. */
export function setFavModels(list) {
  if (!list || list.length === 0) localStorage.removeItem(FAV_KEY)
  else localStorage.setItem(FAV_KEY, JSON.stringify(list))
}

/** Toggle a model in the favorites list. Returns the next list. */
export function toggleFav(modelId, favs) {
  const list = Array.isArray(favs) ? favs : []
  return list.includes(modelId) ? list.filter(m => m !== modelId) : [...list, modelId]
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
// Pure: the test surface for the fetch→flatten→filter math that used to be
// inlined (and duplicated) across App / ModelPicker / SettingsPanel.
//   all         every "provider@id" (the allow-list UI shows all)
//   visible     all filtered by the allow-list (App + Picker)
//   imageModels "provider@id" strings that accept images
//   favModels   favorites that still exist in the catalog (Picker/App)
export function selectModels(apiData, allowed, favModels = []) {
  const all = flattenModels(apiData?.providers)
  const visible = all.filter(m => isModelAllowed(m, allowed))
  const imageModels = Array.isArray(apiData?.imageModels) ? apiData.imageModels : []
  const favs = Array.isArray(favModels) ? favModels.filter(m => all.includes(m)) : []
  return { all, visible, imageModels, favModels: favs }
}

/** Stable-sort `models` so favorites come first (keeping relative order). */
export function withFavsFirst(models, favs = []) {
  const favSet = new Set(favs)
  return [...models].sort((a, b) => (favSet.has(a) ? 0 : 1) - (favSet.has(b) ? 0 : 1))
}
