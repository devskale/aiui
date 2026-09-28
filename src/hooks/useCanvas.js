// ════════════════════════════════════════════════════════════════════
// useCanvas — ADR-0005 client side: beobachtet die Tool-Calls der
// Entries (live + Replay) auf *abgeschlossene* write/edit-Calls, deren
// Pfad die Canvas-Deklaration des Agents matchet, und fetcht die Datei
// nach jedem neuen Treffer über /api/file neu.
//
// SSE-Protokoll unberührt; Server-Beteiligung = der bestehende Endpoint.
// Replay-Restore gratis: gespeicherte Sessions liefern toolCalls mit
// Args, derselbe Effect findet den letzten Canvas-Write wieder.
//
// Robustheit: Generations-Zähler (letzter Fetch gewinnt), Fehler lassen
// den letzten guten Stand stehen, trefferlos → canvas bleibt null
// (Panel materialisiert sich nicht — exakt das heutige UI).
// ════════════════════════════════════════════════════════════════════
import { useEffect, useRef, useState } from 'react'
import { apiUrl } from '../lib/api'
import { canvasPathFromToolCall } from '../lib/canvas-glob'
import { parseCanvas } from '../lib/canvas-parse'

// Tool-Args der Write/Edit-Tools: Pfad-Extraktion wie StreamEntry.
// (Effekt-Extraktion inkl. bash-Redirects: canvasPathFromToolCall)

/**
 * @param {{ glob: string|null, entries: Array, current: object|null }} props
 *   `glob` = Frontmatter-Deklaration des Session-Agents (null → Panel aus).
 * @returns {{ canvas: object|null, path: string|null, writes: number }}
 */
export function useCanvas({ glob, entries, current }) {
  const [state, setState] = useState({ canvas: null, path: null, writes: 0 })
  const genRef = useRef(0)
  const lastKeyRef = useRef(null)

  useEffect(() => {
    if (!glob) return
    // Frischheits-Schlüssel: Pfad + Anzahl abgeschlossener Treffer — der
    // Agent schreibt dieselbe Datei je Rechercheblock NEU, der Pfad allein
    // wäre also kein Veränderungssignal.
    let path = null
    let writes = 0
    for (const e of [...(entries || []), current].filter(Boolean)) {
      for (const tc of e.toolCalls || []) {
        if (tc.status !== 'done' && tc.status !== 'error') continue
        const p = canvasPathFromToolCall(glob, tc)
        if (p) { path = p; writes++ }
      }
    }
    const key = `${path}#${writes}`
    if (key === lastKeyRef.current) return
    lastKeyRef.current = key

    const gen = ++genRef.current
    ;(async () => {
      try {
        const r = await fetch(apiUrl(`/api/file?path=${encodeURIComponent(path)}`))
        if (!r.ok) return
        const j = await r.json()
        if (gen !== genRef.current || j?.tooLarge) return
        const parsed = parseCanvas(j.content || '')
        if (!parsed) return
        setState({ canvas: parsed, path, writes })
      } catch { /* letzter guter Stand bleibt stehen */ }
    })()
  }, [glob, entries, current])

  return state
}
