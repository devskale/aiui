// ════════════════════════════════════════════════════════════════════
// turn-written-files — extrahiert die Dateien, die ein Assistant-Turn
// tatsächlich geschrieben/geändert hat („Changes card").
//
// Quelle sind die `write`/`edit`-Tool-Calls des Turns, NICHT der Antworttext:
// ein Pfad, den der Agent nur in Prosa erwähnt, ist kein Beweis, dass eine
// Datei angefasst wurde — der Tool-Call ist die Aufzeichnung dessen, was
// passiert ist (pi-web-Lektion).
//
// Rein: `toolCalls[]` → `[{ filePath }]`, wirft nie, dedupliziert und
// behält die Reihenfolge des ersten Auftretens. Nur erfolgreiche Calls
// (`status === 'done'`) zählen; abgebrochene/fehlgeschlagene Calls haben
// nichts geschrieben.
// ════════════════════════════════════════════════════════════════════

// Tool-Namen, die eine Datei auf den Datenträger schreiben oder ändern.
// (aiui nutzt die SDK-Factories createWriteTool/createEditTool; der
// Antworttext wird nie gescannt.)
const FILE_WRITING_RE = /^(write|edit|patch|apply|apply_patch|create|update)$/i

// Zieht den Pfad aus den Tool-Args. Die SDK-Tools nehmen `path` (write/edit);
// wir tolerieren die üblichen Varianten, damit der Parser über SDK-Upgrades
// stabil bleibt.
function toolPath(args) {
  if (!args) return ''
  if (typeof args !== 'object') return ''
  return args.file_path || args.filePath || args.path || args.filename || ''
}

function isFileWritingTool(name) {
  return FILE_WRITING_RE.test(String(name || ''))
}

/**
 * Extrahiert die unterschiedlichen Dateien, die ein Turn geschrieben hat.
 *
 * @param {Array<{name?: string, args?: any, status?: string}>} toolCalls
 * @returns {Array<{filePath: string}>} deduplizierte Pfade in erster-Reihenfolge
 */
export function extractTurnWrittenFiles(toolCalls) {
  if (!Array.isArray(toolCalls)) return []

  const seen = new Set()
  const written = []

  for (const tc of toolCalls) {
    if (!tc || tc.status !== 'done') continue
    if (!isFileWritingTool(tc.name)) continue

    const rawPath = toolPath(tc.args)
    if (!rawPath) continue

    // Pfad normalisieren: führende ./ entfernen, doppelte Slashes, Leerraum.
    const filePath = String(rawPath).trim().replace(/^\.\//, '').replace(/\/+/g, '/')
    if (!filePath) continue

    if (seen.has(filePath)) continue
    seen.add(filePath)
    written.push({ filePath })
  }

  return written
}
