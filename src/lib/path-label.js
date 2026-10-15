// ════════════════════════════════════════════════════════════════════
// path-label — Pfad in „gedämpfte Verzeichnisse + prägnanter Dateiname\"\n// zerlegen (dsh PathLabel-Muster: subdued directories, primary filename,\n// volle Pfadinfo im Tooltip bleibt Aufgabe des Aufrufers).
//
// Rein: beliebiger Pfad-String → { dirs, file }. Wirft nie; ohne Trenner
// ist dirs '' und file der ganze String.
// ════════════════════════════════════════════════════════════════════

/**
 * @param {string} p Pfad (POSIX; Windows-Backslashes werden toleriert)
 * @returns {{dirs: string, file: string}} dirs endet (falls nicht leer) auf '/'
 */
export function pathParts(p) {
  const s = String(p ?? '').replace(/\\/g, '/').trim()
  if (!s) return { dirs: '', file: '' }
  if (s === '/') return { dirs: '/', file: '' }
  let i = s.lastIndexOf('/')
  if (i === -1) return { dirs: '', file: s }
  // Trailing slash: das letzte Segment ist der „Name" (Verzeichnis-Pfad)
  if (i === s.length - 1) {
    i = s.slice(0, -1).lastIndexOf('/')
    if (i === -1) return { dirs: '', file: s.slice(0, -1) }
    return { dirs: s.slice(0, i + 1), file: s.slice(i + 1, -1) }
  }
  return { dirs: s.slice(0, i + 1), file: s.slice(i + 1) }
}
