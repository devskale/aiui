#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════
// provision-widget-user — legt einen Widget-User + Embed-Key an (ADR-0006).
//
//   node scripts/provision-widget-user.js <name> [optionen]
//     --limit N        Tages-Quota des Widget-Users (default 50)
//     --domain d       erlaubte Origin (mehrfach; default localhost:5173)
//     --agent id       Agent-Preset (ADR-0004), default '' (= Default-Agent)
//
// Schreibt atomar in die Auth-Config (AIUI_AUTH_FILE, default ~/.aiui-auth.json):
//   limits["widget:<name>"]  = N            (Budget — Keys sind Gates)
//   widgetKeys["wk_<name>_<rand>"] = { user, domains, agent, revoked: false }
//
// Bewusst NICHT angerührt: `users` — Widget-User sind nicht passwort-
// loginbar (kein Eintrag → verifyCredentials schlägt fehl). Workspace/
// agentDir entstehen lazy beim ersten Prompt (ADR-0001).
// ════════════════════════════════════════════════════════════════════
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'

const args = process.argv.slice(2)
const name = args[0]
if (!name || name.startsWith('--')) {
  console.error('Usage: node scripts/provision-widget-user.js <name> [--limit N] [--domain d]... [--agent id]')
  process.exit(1)
}
if (!/^[\w.-]+$/.test(name)) {
  console.error(`invalid name: ${name} (a-zA-Z0-9._- only)`)
  process.exit(1)
}

const opts = { limit: 50, domains: ['localhost:5173'], agent: '' }
for (let i = 1; i < args.length; i++) {
  if (args[i] === '--limit') opts.limit = Number(args[++i])
  else if (args[i] === '--domain') opts.domains.push(args[++i])
  else if (args[i] === '--agent') opts.agent = args[++i]
  else { console.error(`unknown option: ${args[i]}`); process.exit(1) }
}
// --domain ersetzt den Default, statt ihn zu ergänzen (explizit > bequem)
if (args.includes('--domain')) opts.domains = args.filter((a, i) => args[i - 1] === '--domain')

const FILE = process.env.AIUI_AUTH_FILE || path.join(os.homedir(), '.aiui-auth.json')
let config = {}
try { config = JSON.parse(fs.readFileSync(FILE, 'utf-8')) } catch { /* neu anlegen */ }

const user = `widget:${name}`
const key = `wk_${name}_${crypto.randomBytes(8).toString('hex')}`
config.limits = { ...(config.limits || {}), [user]: opts.limit }
config.widgetKeys = {
  ...(config.widgetKeys || {}),
  [key]: { user, domains: opts.domains, agent: opts.agent, revoked: false },
}

const tmp = FILE + '.tmp'
fs.writeFileSync(tmp, JSON.stringify(config, null, 2) + '\n')
fs.renameSync(tmp, FILE)

console.log(`Widget user provisioned: ${user} (limit ${opts.limit}/day)`)
console.log(`Embed key:               ${key}`)
console.log(`Domains:                 ${opts.domains.join(', ')}${opts.agent ? `  |  agent: ${opts.agent}` : ''}`)
console.log('\nHost snippet:')
console.log(`  <script src="https://<aiui-host>/embed.js" data-key="${key}"></script>`)
