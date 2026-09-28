#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════
// sandbox-smoke — verifiziert das Agent-Bash-Environment *durch den
// echten Sandbox-Hook* (seatbelt auf macOS, bwrap auf Linux):
//   node -v · python3 -V · which node
//
// Fängt die Bug-Klasse „Runtime im Sandbox-FS unsichtbar" (2026-09-28:
// node hinter bwrap, obwohl der Service-PATH ihn nannte).
//
// Aufruf:
//   lokal:            node scripts/sandbox-smoke.mjs [workspaceDir]
//   auf lubu:         ssh lubu 'cd ~/code/webuis/aiui && node scripts/sandbox-smoke.mjs'
// Sandbox aus (AIUI_SANDBOX=0) → Meldung + Exit 0 (nichts zu prüfen).
// ════════════════════════════════════════════════════════════════════
import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import { createTools } from '../server/sandbox.js'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const ws = path.resolve(root, process.argv[2] || 'workspace/_local')
fs.mkdirSync(ws, { recursive: true })

const tools = createTools(ws) ?? []
const bash = tools.find((t) => /bash/i.test(t.name || ''))
if (!bash) {
  console.log('sandbox-smoke: kein bash-Tool (Sandbox aus? AIUI_SANDBOX=0) — nichts zu prüfen')
  process.exit(0)
}

const r = await bash.execute('sandbox-smoke-1', { command: 'node -v && python3 -V && which node' })
const text = (r.content || []).map((c) => c.text || '').join('\n').trim()
console.log(text)
const ok = /v\d+\.\d+/.test(text) && /Python \d/.test(text)
console.log(ok ? 'sandbox-smoke: OK' : 'sandbox-smoke: FAIL — siehe Output oben')
process.exit(ok ? 0 : 1)
