// ════════════════════════════════════════════════════════════════════
// Sandbox — the macOS seatbelt confinement layer for the agent's tools
//
// One home for everything confinement: the seatbelt profile, the bash spawn
// hook, the path-validated fs operations, and assembly of the overridden
// tools. createTools(cwd) returns the 4 sandboxed tool overrides when the
// seatbelt is available and enabled, or undefined when confinement is off —
// in which case the SDK falls back to its own built-in tools. That is the
// better "off" state: what varies across the boundary is *whether tools are
// overridden at all*, not *which adapter fills the slot*, so there is one
// real adapter (seatbelt) + an off-switch, not a no-op passthrough adapter.
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

const AVAILABLE = fs.existsSync('/usr/bin/sandbox-exec')
const PROFILE_NAME = '.sandbox.sb'

// ── Pure path guard (exported for direct testing) ──
// Throws if `target` resolves outside `base`. Used by every confined fs op.
export function assertInside(base, target) {
  const rel = path.relative(base, path.resolve(target))
  if (rel === '..' || rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new Error(`Sandbox: path outside workspace denied: ${target}`)
  }
}

function shellQuote(s) {
  return "'" + String(s).replace(/'/g, "'\\''") + "'"
}

function buildProfile(cwd) {
  const home = os.homedir()
  return `(version 1)
(allow default)
;; stat/traverse anywhere (no content revealed) so tools resolve paths
(allow file-read-metadata)
;; ── Confine HOME content; reopen only the data dir + dev toolchain/caches ──
(deny file-read* file-write* (subpath "${home}"))
(allow file-read* file-write*
  (subpath "${cwd}")                              ; the DATA directory
  (subpath "${home}/.pi/agent")                   ; auth/models/rg
  (subpath "${home}/.local")                      ; fnm / pnpm store
  (subpath "${home}/Library/pnpm")                ; pnpm
  (subpath "${home}/Library/Caches")
  (subpath "${home}/.cache") (subpath "${home}/.npm"))
;; system temp
(allow file-read* file-write*
  (subpath "/tmp") (subpath "/private/tmp")
  (subpath "/var/folders") (subpath "/private/var/folders"))
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

// image-mime-by-extension (used by the sandboxed read tool's detectImageMimeType).
// Delegates to the shared mime table — no local copy to drift.
async function detectImageMimeByExt(absolutePath) {
  return mimeFor(path.extname(absolutePath))
}

function logStatus(on, detail) {
  console.log(on
    ? `πui sandbox ON (macOS seatbelt) — agent confined to ${detail}`
    : `πui sandbox OFF (${detail})`)
}

// Build the sandboxed tool overrides for a workspace cwd. Returns the 4 tools
// when confinement is on, or undefined when off. Side effects on enable:
// writes the seatbelt profile, gives the workspace its own git repo, logs
// status. The file/git init is guarded so repeated calls don't re-init.
let initialized = false
export function createTools(cwd) {
  if (process.env.AIUI_SANDBOX === '0') {
    logStatus(false, 'disabled by AIUI_SANDBOX=0')
    return undefined
  }
  if (!AVAILABLE) {
    logStatus(false, 'sandbox-exec not found — unsandboxed; macOS required for confinement')
    return undefined
  }

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

  logStatus(true, cwd)
  return [
    createBashTool(cwd, { spawnHook: spawnHook(profilePath) }),
    createReadTool(cwd, { operations: {
      readFile: async (p) => { assertInside(cwd, p); return fsReadFile(p) },
      access: async (p) => { assertInside(cwd, p); return fsAccess(p, fsConstants.R_OK) },
      detectImageMimeType: detectImageMimeByExt,
    } }),
    createWriteTool(cwd, { operations: {
      writeFile: async (p, c) => { assertInside(cwd, p); return fsWriteFile(p, c, 'utf-8') },
      mkdir: async (d) => { assertInside(cwd, d); return fsMkdir(d, { recursive: true }) },
    } }),
    createEditTool(cwd, { operations: {
      readFile: async (p) => { assertInside(cwd, p); return fsReadFile(p) },
      writeFile: async (p, c) => { assertInside(cwd, p); return fsWriteFile(p, c, 'utf-8') },
      access: async (p) => { assertInside(cwd, p); return fsAccess(p, fsConstants.R_OK | fsConstants.W_OK) },
    } }),
  ]
}
