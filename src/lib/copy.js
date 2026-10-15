// ════════════════════════════════════════════════════════════════════
// copy — zentrale UI-Chrome-Strings (Issue ui-language-unification).
//
// Entscheidung 2026-10-15 (Nutzer): UI-Chrome = ENGLISCH. Diese Map ist
// die einzige Quelle der ehemals deutschen Strings — ein späteres
// i18n-Ticket tauscht nur diese Map, nicht die Komponenten.
//
// Bewusste Ausnahmen (KEIN UI-Chrome, bleiben wie sie sind):
//   - Agent-Protokolle: followUps.js parst deutsche Headings aus dem
//     Agent-Output (Datenvertrag, nicht Copy). Der FollowUps-Chip-Head
//     „Mögliche Vertiefungen" spiegelt die Agent-Sektion — bleibt DE.
//   - Agent-Text-Klassifizierung: GapsList-Regexes matchen deutsche
//     Agent-Texte („nicht öffentlich") — Labels sind EN, Regexes bleiben.
//   - Widget (src/embed/): deutschsprachiges Produkt (Firmenindex),
//     eigenes Surface — außerhalb dieses Tickets.
// ════════════════════════════════════════════════════════════════════

export const copy = {
  // App — Topbar / Lazy-Render
  canvasClose: 'Close research panel',
  canvasOpen: 'Open research panel',
  showOlder: (n) => `⟨ Show ${n} older ⟩`,
  showOlderAll: (n) => `⟨ Show ${n} older (all) ⟩`,

  // EmptyState
  examples: 'Examples',

  // ResearchCanvas
  progress: 'Progress',
  gaps: 'Gaps',
  cards: 'Cards',
  gapBadge: { nonpublic: 'not public', notsearched: 'not searched' },
  sourceRef: (s) => `Source: ${s}`,
  closePanel: 'Close panel',
  canvasUnsupported: 'Unsupported canvas version — raw data:',
  canvasParseError: 'Canvas file could not be parsed — raw data:',

  // GenericCard / registry (Graph-End-Gründe: Keys = Agent-Enums, Werte = UI)
  entriesCount: (n) => `${n} ${n === 1 ? 'entry' : 'entries'}`,
  graphEnd: {
    person: 'natural person',
    firma_ohne_fn: 'not traceable',
    zyklus: 'cycle',
    tiefe_erreicht: 'depth limit',
    keine_kante_erfasst: 'end of edges',
  },
}
