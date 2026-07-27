// ════════════════════════════════════════════════════════════════════
// Sandbox — cross-platform confinement layer for the agent's tools.
//
// One home for everything confinement: the path-validated fs operations
// (assertInside/assertReadable — pure JS, every platform), and TWO bash
// backends chosen by what's installed — macOS seatbelt (sandbox-exec) and
// Linux bubblewrap (bwrap). createTools(cwd) returns the guarded tool
// overrides: the read/write/edit tools are ALWAYS path-guarded (so even
// without a bash backend the structured file tools stay confined); bash gets
// the platform spawnHook. When AIUI_SANDBOX=0 it returns undefined and the
// SDK falls back to its own unconfined tools. (Pi runs unconfined by default;
// confinement is the integrator's job — "undefaulting" pi = pass customTools.)
//
// Interface:
//   createTools(cwd)            → tool[] | undefined  (called once at load)
//   assertInside(base, target)  → throws if `target` escapes `base` (pure, tested)
// ════════════════════════════════════════════════════════════════════
import { createBashTool, createReadTool, createWriteTool, createEditTool } from '@earendil-works/pi-coding-agent'
import path from 'node:path'
import fs from 'node:fs'
import { readFile as fsReadFile, writeFile as fsWriteFile, mkdir as fsMkdir, access as fsAccess } from 'node:fs/promises'
import { constants as fsConstants } from 'node:fs'
import { execSync } from 'node:child_process'
import os from 'node:os'
import { mimeFor } from './mime.js'

const SEATBELT = fs.existsSync('/usr/bin/sandbox-exec')
const BWRAP = fs.existsSync('/usr/bin/bwrap') || fs.existsSync('/usr/local/bin/bwrap')
const PROFILE_NAME = '.sandbox.sb'

// ── Pure path guard (exported for direct testing) ──
// Throws if `target` resolves outside `base`. Used by every confined fs op.
export function assertInside(base, target) {
  const rel = path.relative(base, path.resolve(target))
  if (rel === '..' || rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new Error(`Sandbox: path outside workspace denied: ${target}`)
  }
}

// System temp roots the bash seatbelt already permits (see buildProfile). The
// read/edit tools honour these too, so the agent can read back scratch files it
// wrote via bash (e.g. a converted/resized image) — otherwise it could write to
// /tmp but not read it, an inconsistency that derailed image viewing.
const TMP_ROOTS = ['/tmp', '/private/tmp', '/var/folders', '/private/var/folders']

// The agent's own resource dirs (skills/prompts/extensions from packages or
// loose files) live OUTSIDE the cwd, under <workspace>/.agent/<slug>/. The
// agent must READ these (e.g. a skill's SKILL.md) to actually use a skill —
// but the sensitive top-level files in the agentDir (auth.json, settings.json,
// models.json) stay protected, so only the resource subdirs are allow-listed.
const AGENT_RESOURCE_SUBS = ['git', 'skills', 'prompts', 'extensions', 'packages']
function agentResourceRoots(cwd) {
  const slug = path.basename(cwd)
  return AGENT_RESOURCE_SUBS.map(sub => path.join(path.dirname(cwd), '.agent', slug, sub))
}

// Read guard: cwd ∪ system temp ∪ the agent's own resource dirs. Throws
// otherwise (assertInside). Used by the read/edit tools.
export function assertReadable(base, target) {
  const resolved = path.resolve(target)
  for (const root of [...TMP_ROOTS, ...agentResourceRoots(base)]) {
    const rel = path.relative(root, resolved)
    if (!rel.startsWith('..') && !path.isAbsolute(rel)) return // inside an allow-listed root
  }
  assertInside(base, target)
}

function shellQuote(s) {
  return "'" + String(s).replace(/'/g, "'\\''") + "'"
}

function buildProfile(cwd) {
  const home = os.homedir()
  const agentRoot = path.join(path.dirname(cwd), '.agent') // per-user skills/prompts/extensions
  return `(version 1)
(allow default)
;; stat/traverse anywhere (no content revealed) so tools resolve paths
(allow file-read-metadata)
;; ── Confine HOME content; reopen only the data dir + dev toolchain/caches ──
(deny file-read* file-write* (subpath "${home}"))
(allow file-read* file-write*
  (subpath "${cwd}")                              ; the DATA directory
  (subpath "${home}/.local")                      ; fnm / pnpm store
  (subpath "${home}/Library/pnpm")                ; pnpm
  (subpath "${home}/Library/Caches")
  (subpath "${home}/.cache") (subpath "${home}/.npm"))
;; system temp
(allow file-read* file-write*
  (subpath "/tmp") (subpath "/private/tmp")
  (subpath "/var/folders") (subpath "/private/var/folders"))
;; ── Agent/skill infrastructure ──
;; Skills (web-search, fetch-url, …) are Python launchers living under the
;; agent dir, symlinked from ~/.local/bin. They need to be read + executed,
;; plus network access and the credgoo key store (~/.config/api_keys). Without
;; these the seatbelt blocks them with 'Operation not permitted'. The rest of
;; HOME stays denied (other projects, ~/.ssh, …).
(allow file-read* process-exec
  (subpath "${agentRoot}")
  (subpath "${home}/.pi/agent")
  (subpath "${home}/.local/bin"))
(allow file-read* (subpath "${home}/.config/api_keys"))
(allow network*)
`
}

function spawnHook(profilePath) {
  return ({ command, cwd: workdir, env }) => ({
    command: `sandbox-exec -f ${shellQuote(profilePath)} /bin/bash -c ${shellQuote(command)}`,
    cwd: workdir,
    env: {
      ...env,
      // keep git from reading the user's global config under HOME (denied)
      GIT_CONFIG_GLOBAL: '/dev/null',
      GIT_CONFIG_SYSTEM: '/dev/null',
    },
  })
}

// ── Linux bubblewrap spawnHook ──
// Namespace confinement: bind ONLY what the agent needs (workspace rw, system
// ro, the skill toolchain ro) and leave the rest invisible. Hides other users'
// workspaces, the aiui codebase, ~/.aiui-auth.json (passphrases), ~/.ssh, etc.
// The credgoo key store (~/.config/api_keys) is bound ro because the skills
// need it — the agent could still read those keys, but they're the keys to its
// own tools, not user secrets. Paths are bound at their REAL locations (with
// --dir for ancestors) so siblings under the same parent stay hidden.
function bwrapSpawnHook(cwd) {
  const home = os.homedir()
  const wsParent = path.dirname(cwd) // .../workspace
  const agentRoot = path.join(wsParent, '.agent', path.basename(cwd))
  const args = [
    '--unshare-pid', '--die-with-parent', '--new-session',
    '--ro-bind', '/usr', '/usr',
    '--symlink', 'usr/bin', '/bin', '--symlink', 'usr/sbin', '/sbin',
    '--symlink', 'usr/lib', '/lib', '--symlink', 'usr/lib64', '/lib64',
    '--ro-bind', '/etc', '/etc', '--dev', '/dev', '--proc', '/proc',
    '--tmpfs', '/tmp', '--ro-bind', '/run', '/run',
    '--dir', home,
  ]
  const ro = (p) => { if (fs.existsSync(p)) args.push('--ro-bind', p, p) }
  ro(path.join(home, '.local'))              // uv, credgoo, skill launchers
  if (fs.existsSync(path.join(home, '.config'))) {
    args.push('--dir', path.join(home, '.config'))
    ro(path.join(home, '.config', 'api_keys')) // credgoo key store (skills)
  }
  ro(path.join(home, '.cache'))
  ro(path.join(home, '.pi', 'agent'))         // host skill scripts (launcher targets)
  args.push('--dir', wsParent, '--bind', cwd, cwd) // workspace rw (siblings hidden)
  ro(agentRoot)                               // this user's cloned skills
  const prefix = 'bwrap ' + args.map(shellQuote).join(' ') + ' /bin/bash -c'
  return ({ command, cwd: workdir, env }) => ({
    command: `${prefix} ${shellQuote(command)}`,
    cwd: workdir,
    env: { ...env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null' },
  })
}

// image-mime-by-extension (used by the sandboxed read tool's detectImageMimeType).
// Delegates to the shared mime table — no local copy to drift.
async function detectImageMimeByExt(absolutePath) {
  return mimeFor(path.extname(absolutePath))
}

function logStatus(on, detail) {
  console.log(on
    ? `πui sandbox ON — agent confined to ${detail}`
    : `πui sandbox OFF (${detail})`)
}

// Build the sandboxed tool overrides for a workspace cwd. Returns the 4 tools
// when confinement is on, or undefined when off. Side effects on enable:
// writes the seatbelt profile, gives the workspace its own git repo, logs
// status. The file/git init is guarded so repeated calls don't re-init.
let initialized = false

// The path-guarded read/write/edit tools. Pure JS — work on EVERY platform.
// bash confinement is platform-specific (seatbelt on macOS, bubblewrap on
// Linux); these file guards apply regardless, so even if bash confinement is
// unavailable the structured file tools stay confined to cwd + agent resources.
function guardedFileTools(cwd) {
  return [
    createReadTool(cwd, { operations: {
      readFile: async (p) => { assertReadable(cwd, p); return fsReadFile(p) },
      access: async (p) => { assertReadable(cwd, p); return fsAccess(p, fsConstants.R_OK) },
      detectImageMimeType: detectImageMimeByExt,
    } }),
    createWriteTool(cwd, { operations: {
      writeFile: async (p, c) => { assertInside(cwd, p); return fsWriteFile(p, c, 'utf-8') },
      mkdir: async (d) => { assertInside(cwd, d); return fsMkdir(d, { recursive: true }) },
    } }),
    createEditTool(cwd, { operations: {
      readFile: async (p) => { assertReadable(cwd, p); return fsReadFile(p) },
      writeFile: async (p, c) => { assertInside(cwd, p); return fsWriteFile(p, c, 'utf-8') },
      access: async (p) => { assertReadable(cwd, p); return fsAccess(p, fsConstants.R_OK | fsConstants.W_OK) },
    } }),
  ]
}

export function createTools(cwd) {
  if (process.env.AIUI_SANDBOX === '0') {
    logStatus(false, 'disabled by AIUI_SANDBOX=0')
    return undefined
  }

  // macOS: seatbelt profile + bash spawnHook.
  if (SEATBELT) {
    const profilePath = path.join(cwd, PROFILE_NAME)
    if (!initialized) {
      fs.writeFileSync(profilePath, buildProfile(cwd))
      // give the workspace its own git repo so git stays inside the sandbox
      if (!fs.existsSync(path.join(cwd, '.git'))) {
        try {
          execSync('git init -q', { cwd, env: { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null' } })
        } catch {}
      }
      initialized = true
    }
    logStatus(true, `${cwd} (macOS seatbelt)`)
    return [createBashTool(cwd, { spawnHook: spawnHook(profilePath) }), ...guardedFileTools(cwd)]
  }

  // Linux: bubblewrap bash spawnHook (namespace confinement).
  if (BWRAP) {
    logStatus(true, `${cwd} (Linux bubblewrap)`)
    return [createBashTool(cwd, { spawnHook: bwrapSpawnHook(cwd) }), ...guardedFileTools(cwd)]
  }

  // Neither confinement backend present — file tools stay guarded, but bash
  // is unsandboxed (falls back to the SDK default). Loud warning on purpose.
  logStatus(false, 'no seatbelt/bwrap found — file tools guarded, bash UNSANDBOXED')
  return guardedFileTools(cwd)
}
