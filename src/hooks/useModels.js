// ════════════════════════════════════════════════════════════════════
// useModels — the model list's home on the client
//
// One fetch, shared by every caller via useSyncExternalStore. Exposes the
// pure views from selectModels (all / visible / imageModels) plus refresh(),
// which re-applies the current allow-list to the cached server data — no
// network, no loading flicker. Replaces the three independent /api/models
// fetches that used to live in App, ModelPicker, and SettingsPanel.
//
// W7 — stale-while-revalidate persistence: the catalog is mirrored to
// localStorage keyed by user, so a page reload renders instantly from cache
// and refreshes in the background. Keyed per-user because BYOK users have
// their own catalogs (ADR-0002).
// ════════════════════════════════════════════════════════════════════
import { useSyncExternalStore, useEffect, useCallback } from 'react'
import { apiUrl } from '../lib/api'
import { selectModels, getAllowedModels, getFavModels } from '../lib/models'

const EMPTY = { all: [], visible: [], imageModels: [], loading: true }
const CACHE_PREFIX = 'aiui:models:'

let state = { ...EMPTY }
let lastData = null        // cached /api/models response (in-memory)
let loadedUser = undefined // which user lastData belongs to
let inFlight = null        // ongoing fetch promise (dedupes concurrent callers)
const listeners = new Set()

function emit() {
  for (const l of listeners) l()
}

// Recompute the views from the cached server data + the CURRENT allow-list.
// No fetch. Called on load completion and on refresh().
function recompute() {
  state = { ...selectModels(lastData, getAllowedModels(), getFavModels()), loading: false }
  emit()
}

function cacheKey(user) {
  return CACHE_PREFIX + (user || '_anon')
}
function readCache(user) {
  try { return JSON.parse(localStorage.getItem(cacheKey(user))) } catch { return null }
}
function writeCache(user, data) {
  try { localStorage.setItem(cacheKey(user), JSON.stringify(data)) } catch { /* quota / private mode */ }
}

async function load(user) {
  if (inFlight) return inFlight
  inFlight = (async () => {
    try {
      const res = await fetch(apiUrl('/api/models'))
      lastData = await res.json()
      loadedUser = user
      writeCache(user, lastData)
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
 * Fetch runs once per user (deduped); switching users seeds from that user's
 * localStorage cache (instant) then refreshes in the background. Gated on
 * `enabled` (= authed) so the login screen doesn't fire /api/models pre-auth.
 */
export function useModels(enabled = true, user) {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot)
  useEffect(() => {
    if (!enabled) return
    if (user !== undefined) {
      // Owning caller (App): manage this user's cache + revalidation.
      if (user !== loadedUser) {
        const cached = readCache(user)
        inFlight = null // any pending fetch was for the previous user
        if (cached) {
          lastData = cached
          recompute()
        } else {
          lastData = null
          state = { ...EMPTY }
          emit()
        }
        load(user)
      } else if (lastData === null) {
        load(user)
      }
    } else if (lastData === null && !inFlight) {
      // Reader-only caller (ModelPicker/SettingsPanel): fetch once if nobody has yet.
      load(loadedUser)
    }
  }, [enabled, user])
  const refresh = useCallback(() => recompute(), [])
  return { ...snapshot, refresh }
}
