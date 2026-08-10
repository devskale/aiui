// ════════════════════════════════════════════════════════════════════
// shared-settings — deployment-wide behavioral settings for aiui agents
//
// aiui's agents get their retry behavior (and any other top-level behavioral
// keys) from a single shared source of truth rather than each user's seeded
// copy drifting. The default source is the skaleshare pi.configs settings file
// (the same one the CLI uses), so aiui's web agents retry like the CLI does.
//
// Source (AIUI_SHARED_SETTINGS, default ~/code/skaleshare/pi.configs/settings.json):
//   { "retry": { "maxRetries": 8, "baseDelayMs": 2000,
//                "provider": { "maxRetries": 5, "maxRetryDelayMs": 120000 } } }
//
// Only the keys listed in SHARED_KEYS are pulled; everything else in the
// source (auth, voice, packages, prompts, …) is intentionally NOT inherited —
// those stay per-User / admin-curated (ADR-0001 default-deny).
// ════════════════════════════════════════════════════════════════════
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const SHARED_FILE =
  process.env.AIUI_SHARED_SETTINGS ||
  path.join(os.homedir(), 'code', 'skaleshare', 'pi.configs', 'settings.json')

// Top-level keys inherited from the shared source. `retry` is the behavioral
// knob aiui explicitly wants; add others here deliberately.
const SHARED_KEYS = ['retry']

// Cache + mtime check so edits to the shared file are picked up live (same
// pattern as server/auth.js).
let cache = null
let cacheMtime = -1

/** The inherited behavioral block (e.g. { retry: {...} }), or {} if unavailable. */
export function sharedBehavioralSettings() {
  try {
    const st = fs.statSync(SHARED_FILE)
    if (st.mtimeMs !== cacheMtime) {
      const raw = JSON.parse(fs.readFileSync(SHARED_FILE, 'utf-8'))
      const picked = {}
      for (const k of SHARED_KEYS) {
        if (raw[k] !== undefined) picked[k] = raw[k]
      }
      cache = picked
      cacheMtime = st.mtimeMs
    }
    return cache
  } catch {
    cache = {}
    cacheMtime = -1
    return cache
  }
}

/** The shared `retry` block, or undefined if the source doesn't define one. */
export function sharedRetrySettings() {
  return sharedBehavioralSettings().retry
}
