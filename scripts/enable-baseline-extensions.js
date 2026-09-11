#!/usr/bin/env node
// One-time enablement of the BASELINE extensions (ADR-0004) for EXISTING
// users — new users get them via default-user-settings.json. Baselines
// today: generate-image (TU Aqueduct imagegen) and pdf-tools (read_pdf
// with LlamaParse OCR fallback).
//
// Run at deploy time (deploy.sh does), before the service restart:
//     node scripts/enable-baseline-extensions.js
//
// Adds the settings-relative extension entries to every
// workspace/.agent/*/settings.json that lacks them. Idempotent; keeps any
// other extensions entries. Remove an entry from a user's settings.json
// to opt that user out (and delete this script when everyone has them).
import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const AGENT_ROOT = path.join(__dirname, '..', 'workspace', '.agent')
const ENTRIES = [
  '../../../extensions/generate-image/index.js',
  '../../../extensions/pdf-tools/index.js',
]

function log(msg) { console.log(`[baseline-ext] ${msg}`) }

if (!fs.existsSync(AGENT_ROOT)) { log('no workspace/.agent/ — nothing to do'); process.exit(0) }
let changed = 0
for (const slug of fs.readdirSync(AGENT_ROOT)) {
  const settingsPath = path.join(AGENT_ROOT, slug, 'settings.json')
  if (!fs.existsSync(settingsPath)) continue
  let settings
  try { settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8')) } catch { log(`skip ${slug} (unparseable settings.json)`); continue }
  const missing = ENTRIES.filter(e => !(Array.isArray(settings.extensions) && settings.extensions.includes(e)))
  if (!missing.length) { log(`ok ${slug} (already enabled)`); continue }
  settings.extensions = [...(settings.extensions || []), ...missing]
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2))
  log(`enabled for ${slug}`)
  changed++
}
log(`done — ${changed} user(s) updated.`)
