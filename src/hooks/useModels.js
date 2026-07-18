// ════════════════════════════════════════════════════════════════════
// useModels — the model list's home on the client
//
// One fetch, shared by every caller via useSyncExternalStore. Exposes the
// pure views from selectModels (all / visible / imageModels) plus refresh(),
// which re-applies the current allow-list to the cached server data — no
// network, no loading flicker. Replaces the three independent /api/models
// fetches that used to live in App, ModelPicker, and SettingsPanel.
// ════════════════════════════════════════════════════════════════════
import { useSyncExternalStore, useEffect, useCallback } from 'react'
import { apiUrl } from '../lib/api'
import { selectModels, getAllowedModels } from '../lib/models'

const EMPTY = { all: [], visible: [], imageModels: [], loading: true }

let state = { ...EMPTY }
let lastData = null        // cached /api/models response
let inFlight = null        // ongoing fetch promise (dedupes concurrent callers)
const listeners = new Set()

function emit() {
  for (const l of listeners) l()
}

// Recompute the views from the cached server data + the CURRENT allow-list.
// No fetch. Called on first load completion and on refresh().
function recompute() {
  state = { ...selectModels(lastData, getAllowedModels()), loading: false }
  emit()
}

async function load() {
  if (inFlight) return inFlight
  inFlight = (async () => {
    try {
      const res = await fetch(apiUrl('/api/models'))
      lastData = await res.json()
    } catch {
      // keep any previously cached data; just drop out of loading
    }
    recompute()
    inFlight = null
  })()
  return inFlight
}

function subscribe(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function getSnapshot() {
  return state
}

/**
 * @returns {{ all: string[], visible: string[], imageModels: string[], loading: boolean, refresh: () => void }}
 * The fetch runs once (deduped); refresh() re-applies the allow-list to the
 * cached server data without refetching.
 */
export function useModels() {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot)
  // Fetch on first mount, and only if we don't already have data.
  useEffect(() => {
    if (lastData === null) load()
  }, [])
  const refresh = useCallback(() => recompute(), [])
  return { ...snapshot, refresh }
}
