# Canvas — Implementation Design (firmenindex first)

Implementation design for ADR-0005 (the decision record — read that first).
This doc specifies *how* the canvas ships: data flow, components, the
agent-side commitment, and a fail-early test plan. Scope of phase A: the
panel live-updates during a firmenindex research turn and restores after
reload/session-switch. Graphics polish is phase B.

## 1. Data flow (zero server involvement beyond existing endpoints)

```
agent writes reports/fi-…/canvas.json  (full rewrite, one write per block)
        │ tool_execution_end (write/edit, args.file_path)
        ▼
useAgentEvents → entries/current .toolCalls      (existing reducer, untouched)
        │ useCanvas effect: done write matching the agent's canvas glob
        ▼
GET /api/file?path=…  (existing endpoint, JSON response)
        │ parseCanvas(): tolerant validate + normalize (pure, unit-tested)
        ▼
ResearchCanvas panel: header · progress · cards (registry) · gaps · next
```

The SSE protocol stays untouched (ADR: guarded boundary). The canvas rides
`tool_execution_end` + `/api/file` — both already exist.

## 2. Discovery & gating

- **Frontmatter** (`agents/firmenindex/agent.md`):
  `canvas: reports/**/canvas.json`
- **Passthrough** (`server/agents.js`): parse `canvas` like `stt`/`tts`
  (`String(frontmatter.canvas || null)`), include in `/api/agents` list.
  Three lines — metadata only, the data path stays server-free.
- **Gating** (client): the panel exists only while the session's agent
  declares `canvas`. No declaration → exactly today's UI.
- **Restore after reload / session switch**: replayed sessions already
  produce `toolCalls: [{ name, args, status }]` (`shared/entry.js`), so the
  same useCanvas effect picks the **last** completed canvas write out of the
  replayed entries and fetches once. No new endpoint, no stored side-state.

## 3. Client components

```
src/hooks/useCanvas.js        — effect: watch entries/current toolCalls →
                                 fetch on new matching write; generation
                                 counter (last fetch wins); keep-last-good
                                 on error; exposes { canvas, stale }
src/lib/canvas-parse.js       — pure: version check, defaults, length caps
src/lib/canvas-glob.js        — pure: `reports/**/canvas.json` matcher
src/components/Canvas/
  ResearchCanvas.jsx          — panel shell (right-hand, collapsible,
                                 auto-materializes on first data,
                                 localStorage collapse state)
  ProgressList.jsx            — numbered subtask rows: done/running/pending/
                                 degraded (labels mirror the chat plan ①②③)
  GapsList.jsx                — „nicht öffentlich" vs „nicht recherchiert"
                                 as distinct badges (the agent's honesty
                                 vocabulary, rendered)
  NextChips.jsx               — reuses <FollowUps> (v1 chips) → click sends
  registry.js                 — { profile, structure } + fallbacks
  GenericCard.jsx             — ADR fallbacks: object→kv table, homogeneous
                                 array→table, string→markdown, else pretty
                                 JSON; per-card ErrorBoundary
```

Panel shell: 400px right column, `border-left`, slides in on first canvas
appearance, `PanelRight`-icon toggle in the topbar (visible only when the
agent declares canvas). Below 1100px viewport: full-width overlay.

### v1 card types (firmenindex)

```jsonc
// profile — one per company, as findings land
{ "type": "profile", "title": "STRABAG SE", "source": "rohdaten/merged-102717t.json",
  "data": { "FN": "102717t", "Sitz": "Wien", "Rechtsform": "SE",
            "Grundkapital": "…", "Konzern-Ebene": 1 } }

// structure — the Geflecht, grows as the network query lands
{ "type": "structure", "title": "Konzernstruktur (Auszug)",
  "data": { "name": "STRABAG SE", "fn": "102717t",
            "children": [ { "name": "STRABAG AG", "fn": "…", "share": "100 %",
                            "children": [] } ] } }
```

`structure` v1 renders as an indented tree with share badges + FN in mono —
graphics (the visualize-style trees) are phase B. Everything else the agent
emits renders via the generic fallbacks, which is the ADR's deploy-free
extensibility: a `metrics` or `timeline` card works on day one without a
client change.

## 4. Agent-side commitment (agent.md, draft wording)

Add to the Reports section of `agents/firmenindex/agent.md`:

> **Canvas live halten** (das Rechts-Panel der Web-UI liest diese Datei):
> Lege direkt nach dem Rechercheplan das Bundle-Verzeichnis an und schreibe
> ein initiales `canvas.json` (progress: alle Aufgaben `pending`, die erste
> `running`, `title`/`subtitle` gesetzt). **Nach jedem Rechercheblock**
> (Teilaufgabe fertig, Karten-Stück gelandet): `canvas.json` **komplett neu
> schreiben** — nie Teil-JSONs anhängen. Regeln: `canvas` bleibt `1`;
> `progress`-Labels sind exakt die nummerierten Teilaufgaben aus dem Chat-
> Plan; `gaps` tragen „nicht öffentlich" vs „nicht recherchiert";
> `next` enthält dieselben Fragen wie der Chat-Abschnitt **Mögliche
> Vertiefungen** (beide Stellen sind klickbar); `report` erst im Abschluss;
> Datei unter ~100 KB; Karten referenzieren `rohdaten/…` als `source`.

## 5. Fail-early test plan

1. **Unit (immediately, no agent)**: `canvas-glob` (match/no-match/`**`
   depth), `canvas-parse` (defaults, caps, wrong major → `unsupported`+raw,
   garbage → null). Pure `node --test` files, like `followUps.test.js`.
2. **Dev smoke (cheap mini-turn)**: hand-write
   `workspace/<user>/reports/fi-test-x/canvas.json`, ask the agent one tiny
   thing („setze ② in canvas.json auf done") — the panel must update within
   a second. No API-heavy research needed to prove the pipeline.
3. **E2E**: extend `scripts/e2e-cases/firmenindex.json` (netzwerk-strabag)
   with `toolSubstr: "canvas.json"` — pins the commitment end-to-end.

## 6. Effort & order

- **Phase A (~½ day)**: passthrough + useCanvas + ResearchCanvas shell +
  ProgressList/GapsList/NextChips + generic fallbacks + profile/structure
  v1 + CSS + agent.md commitment + unit tests + dev smoke.
- **Phase B (polish, later)**: structure graphics, metric formatting,
  card animations, mobile overlay refinements.

## 7. Open questions

- Auto-open on first appearance (planned) vs. only a topbar badge — try
  auto-open, it is the point of the panel; collapse is remembered.
- Several bundles in one session (re-research): last write wins — the panel
  always shows the newest canvas.json. Acceptable; revisit if confusing.
- Chat tail „Mögliche Vertiefungen" AND `canvas.next` both render the same
  clickable questions. Intentional (same component, two surfaces); if it
  feels redundant, drop the chat-tail section in a later prompt iteration.
