// ════════════════════════════════════════════════════════════════════
// canvas-glob — matcht Tool-Write-Pfade gegen die Canvas-Deklaration
// eines Agents (Frontmatter `canvas:`, z. B. `reports/**/canvas.json`).
//
// Unterstützt `**` (beliebige Verzeichnistiefe) und `*` (ein Segment-
// teil). Tool-Args tragen teils absolute Pfade (workspace/<user>/…), der
// Glob ist cwd-relativ — deshalb matcht der Matcher gegen JEDEN Pfad-
// Suffix (Start an jedem Segment). Rein, ohne fs.
//
// Achtung in Blockkommentaren: das Glob-Beispiel enthält `**` gefolgt
// von `/`, was den Kommentar vorzeitig schließt — Beispiele hier nur in
// Zeilenkommentaren schreiben.
// ════════════════════════════════════════════════════════════════════

function segToRe(seg) {
  return new RegExp('^' + seg.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*') + '$')
}

function matchFrom(gSegs, pSegs, gi, pi) {
  if (gi === gSegs.length) return pi === pSegs.length
  const g = gSegs[gi]
  if (g === '**') {
    for (let k = pi; k <= pSegs.length; k++) {
      if (matchFrom(gSegs, pSegs, gi + 1, k)) return true
    }
    return false
  }
  if (pi >= pSegs.length) return false
  return segToRe(g).test(pSegs[pi]) && matchFrom(gSegs, pSegs, gi + 1, pi + 1)
}

/** Matcht `path` gegen `glob` — true, wenn irgendein Suffix des Pfades
 *  dem Glob entspricht. Zeilenkommentar-Beispiel siehe Testdatei. */
export function matchesCanvasGlob(glob, path) {
  if (!glob || !path || typeof glob !== 'string' || typeof path !== 'string') return false
  const gSegs = glob.split('/').filter((s) => s !== '')
  const pSegs = path.split('/').filter((s) => s !== '')
  for (let start = 0; start <= pSegs.length; start++) {
    if (matchFrom(gSegs, pSegs, 0, start)) return true
  }
  return false
}
