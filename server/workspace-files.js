// ════════════════════════════════════════════════════════════════════
// workspace-files — browse + read files in a user's workspace.
//
// The security boundary is assertInside (from sandbox.js): every resolved
// path must stay inside the user's workspace cwd, so the browser can't read
// outside it — the same shape as bash-output.js (W4), scoped to the workspace
// instead of the temp dir. Browsing is done by the server process, outside
// the seatbelt, so it works whether or not the agent itself is sandboxed.
// ════════════════════════════════════════════════════════════════════
import path from 'node:path'
import fs from 'node:fs'
import { assertInside } from './sandbox.js'
import { mimeFor } from './mime.js'

const IGNORED = new Set(['node_modules', '.git', 'dist', 'uploads', 'sessions'])
const MAX_READ_BYTES = 1024 * 1024

/** Resolve a workspace-relative sub-path, enforcing it stays inside cwd. */
export function resolveWorkspacePath(cwd, sub) {
  const target = sub ? path.join(cwd, sub) : cwd
  assertInside(cwd, target) // throws if escaped (handles absolute + .. )
  return target
}

/** One level of a directory: dirs first, then files, ignoring noise. */
export function listDir(cwd, sub) {
  const dir = resolveWorkspacePath(cwd, sub)
  const out = []
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith('.') || IGNORED.has(e.name)) continue
    out.push({ name: e.name, dir: e.isDirectory() })
  }
  out.sort((a, b) => (a.dir === b.dir ? a.name.localeCompare(b.name) : a.dir ? -1 : 1))
  return out
}

/** Read a text file up to MAX_READ_BYTES. Returns { tooLarge, size } or { content, size }. */
export function readTextFile(cwd, sub) {
  const file = resolveWorkspacePath(cwd, sub)
  const stat = fs.statSync(file)
  if (!stat.isFile()) throw new Error('not a file')
  if (stat.size > MAX_READ_BYTES) return { tooLarge: true, size: stat.size }
  return { tooLarge: false, content: fs.readFileSync(file, 'utf8'), size: stat.size }
}

export { mimeFor, MAX_READ_BYTES }
