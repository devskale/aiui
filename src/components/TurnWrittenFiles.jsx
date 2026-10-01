// ════════════════════════════════════════════════════════════════════
// TurnWrittenFiles — „Changes card": listet die Dateien, die ein Turn
// tatsächlich geschrieben/geändert hat, als klickbare Chips.
//
// Quelle sind die erfolgreichen write/edit-Tool-Calls des Turns
// (src/lib/turn-written-files.js), NICHT der Antworttext. Ein Klick öffnet
// die Datei über /api/file/raw in einem neuen Tab (Text/Bild/PDF direkt
// darstellbar); die Inline-Vorschau bleibt beim FileExplorer.
//
// Renderet nichts, wenn der Turn keine Dateien geschrieben hat.
// ════════════════════════════════════════════════════════════════════
import { File as FileIcon } from 'lucide-react'
import { apiUrl } from '../lib/api'

function fileName(p) {
  return p.split('/').pop() || p
}

function openFile(filePath) {
  // /api/file/raw liefert den Inhalt mit passendem Content-Type; in einem
  // neuen Tab öffnen, damit der Chat-Stream nicht navigiert wird.
  window.open(apiUrl(`/api/file/raw?path=${encodeURIComponent(filePath)}`), '_blank')
}

export function TurnWrittenFiles({ files }) {
  if (!files || files.length === 0) return null

  return (
    <div className="twf" aria-label="Files written this turn">
      <div className="twf-head">Files written</div>
      <div className="twf-chips">
        {files.map(({ filePath }) => (
          <button
            key={filePath}
            type="button"
            className="twf-chip"
            title={filePath}
            onClick={() => openFile(filePath)}
          >
            <FileIcon size={12} className="twf-ic" />
            <span>{fileName(filePath)}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
