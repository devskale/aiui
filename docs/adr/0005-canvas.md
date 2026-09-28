# Canvas — an extensible research artifact panel

The **Canvas** is a collapsible right-hand panel that materializes while an
Agent researches: profile cards, graphs, metric tables, a progress checklist,
honest gaps. It is not parsed from the chat stream — it **is a workspace
file the agent maintains** (`canvas.json`), rendered live by the client.

## Context

The firmenindex Agent runs multi-minute research turns. The chat stream shows
raw tool calls; value lands in one big report at the end. Users want to watch
the research *emerge*. Constraints that shape the design:

- The SSE protocol is a guarded boundary ("ask first" to change) — the canvas
  must ride on existing events (`tool_execution_end`) + existing endpoints
  (`/api/file`).
- Shape ownership (CODING_STANDARDS): the client must not guess shapes out of
  arbitrary tool outputs. Whatever the canvas consumes needs an owned,
  documented contract.
- Card types will grow (profile → graph → metrics → who knows). New types must
  not require a client deploy to be *usable* — only to be *pretty*.
- aiui core stays agent-agnostic: nothing in `server/` may learn about
  firmenindex or any specific card type.

## Decision

### 1. The canvas is a file the agent owns

The Agent persona commits (in `agent.md`) to maintaining a `canvas.json` in
its report bundle, rewritten after every research block via `write`/`edit`.
The client detects `tool_execution_end` on a matching path and re-fetches
through `/api/file`. Server involvement: zero.

### 2. Minimal, versioned core — everything optional

```json
{
  "canvas": 1,
  "title": "…", "subtitle": "…",
  "progress": [{ "label": "…", "state": "done|running|pending|degraded", "note": "…" }],
  "cards":   [{ "type": "…", "title": "…", "data": {…}, "source": "rohdaten/x.json" }],
  "gaps":    ["…"],
  "next":    ["→ …"],
  "report":  "report.md"
}
```

Only `canvas` is required. Unknown or higher major version → the panel shows
a notice + raw JSON instead of failing. Additive fields are ignored by older
clients (forward tolerance).

### 3. Cards are self-describing; the client is a registry

- Client keeps a **card-type registry**: `type → renderer component`, a plain
  map — adding a renderer is a one-line registration.
- Cards render **in array order** — the agent (not the client) decides
  composition, grouping, and narrative order.
- Every card may carry `source` (a bundle file or URL) → rendered as a
  provenance link. Traceability is a contract, not a courtesy.

### 4. Generic fallback renderers are the extensibility mechanism

An **unknown card type must still render usefully** — this is what makes the
contract deploy-free extensible:

- object → key/value table (nested objects/arrays → collapsible)
- array of homogeneous objects → auto table
- string → markdown
- anything else → collapsible pretty JSON

A persona can invent `{"type":"timeline","data":…}` today; the panel shows an
honest table until a dedicated renderer ships. Rich rendering is a client
*upgrade*, never a client *requirement*.

### 5. Agent-gated, agent-generic

The panel activates for any Agent whose `agent.md` declares the canvas
commitment (naming its bundle path). firmenindex is the first consumer, not a
special case. No agent declaration → no panel, exactly today's UI.

## Consequences

- New card types, progress states, and sections cost persona edits only.
- The canvas survives turns and sessions as a plain file (browsable in the
  file explorer, @-mentionable, shareable via throway with the bundle).
- Client work concentrates in one component tree (`ResearchCanvas` + registry
  + generic renderers) — no reducer, SSE, or server changes.
- Risk: agents writing malformed canvas files. Mitigation: tolerant parse,
  per-card error boundaries (one bad card never blanks the panel), and the
  raw-JSON fallback.
