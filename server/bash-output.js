// ════════════════════════════════════════════════════════════════════
// bash-output — read the full output of a truncated bash tool call.
//
// When the SDK's bash tool output exceeds the line/byte cap it spills the
// full output to a temp file (pi-bash-*.log) and embeds the path in the
// truncated text the client already shows ("Full output: /tmp/pi-bash-…").
// This module reads those temp files back — but ONLY pi-bash logs inside the
// system temp dir, so the endpoint can't be turned into an arbitrary file
// reader. Mirrors pi-web's bash-output.ts (O_NOFOLLOW, regular-file only,
// 5 MiB cap).
// ════════════════════════════════════════════════════════════════════
import { constants } from 'node:fs'
import { lstat, open } from 'node:fs/promises'
import { basename, dirname, resolve } from 'node:path'
import os from 'node:os'

const MAX_BASH_OUTPUT_BYTES = 5 * 1024 * 1024
const TEMP_ROOT = resolve(os.tmpdir())

/**
 * Resolve + validate a pi-bash temp path. Returns the absolute path if it is a
 * plausible pi-bash log inside the system temp dir, else null. This is the
 * security boundary for the /api/bash-output endpoint.
 */
export function resolveBashOutputPath(filePath) {
  if (typeof filePath !== 'string' || !filePath) return null
  const resolved = resolve(filePath)
  if (dirname(resolved) !== TEMP_ROOT) return null
  if (!/^pi-bash-[A-Za-z0-9_-]+\.log$/.test(basename(resolved))) return null
  return resolved
}

/**
 * Read up to maxBytes of a validated pi-bash log. No symlink follow
 * (O_NOFOLLOW), regular files only. Returns { tooLarge, size } or
 * { tooLarge:false, content, size }.
 */
export async function readBashOutput(filePath, maxBytes = MAX_BASH_OUTPUT_BYTES) {
  const info = await lstat(filePath)
  if (!info.isFile()) throw new Error('not a regular file')
  const noFollow = typeof constants.O_NOFOLLOW === 'number' ? constants.O_NOFOLLOW : 0
  const handle = await open(filePath, constants.O_RDONLY | noFollow)
  try {
    const stat = await handle.stat()
    if (!stat.isFile()) throw new Error('not a regular file')
    if (stat.size > maxBytes) return { tooLarge: true, size: stat.size }
    const buf = Buffer.alloc(stat.size)
    let n = 0
    while (n < buf.length) {
      const r = await handle.read(buf, n, buf.length - n, n)
      if (r.bytesRead === 0) break
      n += r.bytesRead
    }
    return { tooLarge: false, content: buf.subarray(0, n).toString('utf8'), size: n }
  } finally {
    await handle.close()
  }
}

export { MAX_BASH_OUTPUT_BYTES }
