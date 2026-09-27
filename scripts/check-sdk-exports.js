#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════
// check-sdk-exports — guard against pi-coding-agent upgrades breaking us
//
// Scans server/**/*.js for named imports from the SDK, then verifies every
// one of them exists in the *installed* SDK version. Catches "upgrade pulled
// a version that renamed/removed an export" before runtime does.
//
// Run: node scripts/check-sdk-exports.js   (wired into the pre-commit hook)
// Exit 0 = all imports resolve, 1 = missing export or scan failure.
// ════════════════════════════════════════════════════════════════════
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const PKG = '@earendil-works/pi-coding-agent'
const SERVER_DIR = path.join(ROOT, 'server')

// Collect named imports from all server/*.js files (the only SDK consumers).
function collectImports(dir) {
  const names = new Set()
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      for (const n of collectImports(full)) names.add(n)
    } else if (entry.name.endsWith('.js')) {
      const src = fs.readFileSync(full, 'utf8')
      const re = /import\s*\{([^}]+)\}\s*from\s*['"]@earendil-works\/pi-coding-agent['"]/g
      for (const m of src.matchAll(re)) {
        for (const raw of m[1].split(',')) {
          const name = raw.trim().split(/\s+as\s+/)[0]
          if (name) names.add(name)
        }
      }
    }
  }
  return [...names]
}

const names = collectImports(SERVER_DIR)
if (names.length === 0) {
  console.error(`check-sdk-exports: keine ${PKG}-Imports unter server/ gefunden — Scan kaputt?`)
  process.exit(1)
}

let mod
try {
  mod = await import(PKG)
} catch (e) {
  console.error(`check-sdk-exports: SDK nicht importierbar: ${e.message}`)
  process.exit(1)
}

const missing = names.filter(n => mod[n] === undefined)
console.log(`check-sdk-exports: ${names.length - missing.length}/${names.length} SDK-Imports vorhanden`)
if (missing.length) {
  console.error(`FEHLEN in installiertem ${PKG}: ${missing.join(', ')}`)
  process.exit(1)
}
console.log('OK')
