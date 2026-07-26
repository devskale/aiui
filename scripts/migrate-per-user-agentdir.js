#!/usr/bin/env node
// One-time migration to the per-user agentDir architecture (ADR-0001/0002/0003).
//
// Run BEFORE restarting the server with the new code:
//     node scripts/migrate-per-user-agentdir.js
// Ordering matters: if the new code serves traffic first, ctxFor() seeds each
// existing User's agentDir/settings.json with defaults-only (no entitlement),
// and this script then skips them (settings.json already exists) — they'd lose
// their resources. Running this first pre-creates the agentDirs so ctxFor()
// finds them and does not re-seed.
//
// Posture: **preserve-then-trim**. Each *existing* User's agentDir/settings.json
// is seeded with what they had under the shared global pool — behavioral
// defaults (model/UI prefs) + entitlement (packages + loose-file paths) — so no
// existing User loses capabilities on deploy. New Users start empty (handled at
// runtime by ctxFor, which seeds only behavioral defaults → default-deny).
//
// What this does:
//   1. Copies loose (non-symlink) Resources from ~/.pi/agent/{extensions,skills,prompts}/
//      into workspace/.lib/ (the shared Resource library). Package-sourced
//      Resources (git/npm) are NOT copied — they stay managed per-User via the
//      `packages` array.
//   2. Reads the shared ~/.pi/agent/settings.json for behavioral defaults + packages.
//   3. For each existing User (every workspace/<slug>/ dir), writes
//      workspace/.agent/<slug>/settings.json = defaults + packages + path refs
//      to the migrated loose files.
//
// Idempotent: skips a User whose agentDir/settings.json already exists.
import path from 'node:path'
import fs from 'node:fs'
import os from 'node:os'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = path.join(__dirname, '..')
const WORKSPACE_ROOT = path.join(PROJECT_ROOT, 'workspace')
const LIB_ROOT = path.join(WORKSPACE_ROOT, '.lib')
const AGENT_ROOT = path.join(WORKSPACE_ROOT, '.agent')
const SHARED_AGENT = path.join(os.homedir(), '.pi', 'agent')

function log(msg) { console.log(`[migrate] ${msg}`) }

// ── 1. Copy loose (non-symlink) Resources into .lib/ ──
function migrateLooseFiles() {
  const kinds = ['extensions', 'skills', 'prompts']
  const migrated = {} // kind → [absPath, ...]
  for (const kind of kinds) {
    const src = path.join(SHARED_AGENT, kind)
    const dst = path.join(LIB_ROOT, kind)
    migrated[kind] = []
    if (!fs.existsSync(src)) continue
    fs.mkdirSync(dst, { recursive: true })
    for (const name of fs.readdirSync(src)) {
      const p = path.join(src, name)
      // Skip symlinks — those point into a git/npm package install and stay
      // managed per-User via the `packages` array (ADR-0001).
      if (fs.lstatSync(p).isSymbolicLink()) { log(`skip symlink (package-sourced): ${kind}/${name}`); continue }
      const dest = path.join(dst, name)
      fs.copyFileSync(p, dest)
      migrated[kind].push(dest)
      log(`copied loose ${kind}/${name} → .lib/${kind}/`)
    }
  }
  return migrated
}

// ── 2. Read shared settings for behavioral defaults + packages ──
function readSharedSettings() {
  const p = path.join(SHARED_AGENT, 'settings.json')
  if (!fs.existsSync(p)) { log(`no shared settings.json at ${p} — using bare defaults`); return {} }
  return JSON.parse(fs.readFileSync(p, 'utf8'))
}

// ── 3. Seed each existing User's agentDir/settings.json ──
function seedExistingUsers(sharedSettings, migrated) {
  if (!fs.existsSync(WORKSPACE_ROOT)) { log('no workspace/ — nothing to migrate'); return 0 }
  const slugs = fs.readdirSync(WORKSPACE_ROOT)
    .filter(d => fs.statSync(path.join(WORKSPACE_ROOT, d)).isDirectory())
    .filter(d => d !== '.agent' && d !== '.lib')
  let count = 0
  for (const slug of slugs) {
    const agentDir = path.join(AGENT_ROOT, slug)
    const settingsPath = path.join(agentDir, 'settings.json')
    if (fs.existsSync(settingsPath)) { log(`skip ${slug} (already has settings.json)`); continue }
    fs.mkdirSync(agentDir, { recursive: true })

    // Behavioral defaultss (model/UI prefs) — preserved verbatim.
    const out = {}
    for (const k of ['defaultProvider', 'defaultModel', 'defaultThinkingLevel', 'theme', 'steeringMode', 'doubleEscapeAction', 'followUpMode', 'compaction']) {
      if (k in sharedSettings) out[k] = sharedSettings[k]
    }
    // Entitlement: managed packages (git/npm) — preserved verbatim.
    if (Array.isArray(sharedSettings.packages)) out.packages = sharedSettings.packages
    // Entitlement: loose-file path references into .lib/.
    for (const kind of ['extensions', 'skills', 'prompts']) {
      if (migrated[kind].length) {
        const key = kind // extensions/skills/prompts
        out[key] = migrated[kind]
      }
    }
    fs.writeFileSync(settingsPath, JSON.stringify(out, null, 2))
    log(`seeded ${slug}/settings.json (${Object.keys(out).length} keys)`)
    count++
  }
  return count
}

// ── main ──
log(`PROJECT_ROOT=${PROJECT_ROOT}`)
log(`SHARED_AGENT=${SHARED_AGENT}`)
if (!fs.existsSync(SHARED_AGENT)) { log('shared ~/.pi/agent/ not found — nothing to migrate from'); process.exit(0) }
const migrated = migrateLooseFiles()
const sharedSettings = readSharedSettings()
const n = seedExistingUsers(sharedSettings, migrated)
log(`done — seeded ${n} existing user(s). New users start empty (default-deny).`)
