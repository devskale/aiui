# Research — pi-durable als Persistenz-/Runtime-Basis für πui

**Status:** research, 2026-11-03 · **Anlass:** compare-pi-pocket-Verdict —
„the fastest way to neutralize pocket's biggest structural advantage is
adopting `pi-durable` for checkpointed runs" (runs survive server restarts).
**Quellen:** `inspirations/pi-pocket/src/server/app.ts` (Harness-Setup),
`docs/architecture.md` (durable truth), npm-README `@earendil-works/pi-durable`
1.5.0 (pocket pinnt 1.4.0), eighände API-Studie, kein Prototyp.

## TL;DR

**Nicht adoptieren — und den ursprünglichen „schnellster Weg"-Schluss
korrigieren.** pi-durable ist kein Persistenz-Add-on für pi-coding-agent
Sessions, sondern ein **alternativer Agent-Harness** (pi-ai + chord,
eigenes Tool-/Extension-/Entry-Modell). Adoption = Austausch der gesamten
Session-Schicht, nicht „Dranschrauben". Zwei SDK-Spins der letzten Wochen
haben den Abstand ohnehin kleiner gemacht: Limit-Gate-Verhalten
(Retry/`willRetry`) und der Cache-Warmer sind jetzt im coding-agent SDK
selbst. Empfehlung: **beobachten mit klaren Re-Trigger-N**, kein Bau.

---

## 1. Was pi-durable tatsächlich ist

- **Eigener Harness** (`Harness.open(storage, { models, registry }, context)`):
  Conversations als unveränderliche Entry-Transcripts, Model-Turns, Tool-Calls
  und eigene State-Dokumente werden **committed, bevor sie sichtbar** werden.
  Prozess stirbt mid-turn → Reopen nimmt die Arbeit wieder auf; ein
  abgebrochener Model-Request zählt als fehlgeschlagener Versuch und wird
  retried.
- **Eigene Tools** (`defineTool`, pi-schema, `CodingTools` read/write/edit/
  bash), eigener Extension-Mechanismus (`registry.install`), eigenes
  Code-Mode-Sandboxing, eigener Task-Graph (`sleepUntil`-Checkpoints für
  Schedules/Watches/Webhooks), Subagents, Forks, Usage/Cost-Buchhaltung,
  Compaction — das komplette pocket-Backend.
- **Experimental:** „The API changes without notice between releases" —
  pocket pinnt exakte Versionen (1.4.0; 1.5.0 aktuell, Schema-Migration 2).

## 2. Was Adoption für πui bedeutet (Ports, nicht Konfiguration)

| πui-Baustein | Heute (pi-coding-agent) | Unter pi-durable |
|---|---|---|
| Session-Runtime | `createAgentSessionRuntime` (SDK) | **Ersetzen** durch `Harness` — der SDK-Session-Layer wäre tot Code |
| Sandbox | `Sandbox.createTools` (seatbelt/bwrap, `assertInside`) | Port in durable-Tools / `ExecutionEnv` (NodeExecutionEnv ist **unsandboxed**) — Confinement müsste neu gebaut werden, dem Kernstück des Moats |
| Resources/Entitlement | SDK-Resource-Loader, agentDir + project trust (ADR-0001, default-deny) | **Existiert nicht** in durable — Skills/Prompts/Extensions-Entitlement komplett neu |
| Credentials/BYOK | hybrid `ModelRuntime` (ADR-0002) | durable nimmt `models` (pi-ai `createModels`) — Hybrid-BYOK als Adapter neu bauen |
| Agents (ADR-0004) | agent.md-Presets, agentDir-gebunden | durable hat per-Conversation-Agent (model/system prompt) — Port möglich, Catalog-Logik neu |
| Widget/Embed (ADR-0006) | Visitor-Contexts auf derselben Runtime | dieselbe Portierung, zweite Front |
| Client-Vertrag | SDK-Events → `agent-events-reducer` → Entry-Shape | durable `ConversationView`/`EntryRecord` → **Projection-Layer** nötig (genau das ist pockets `projection.ts` — groß) |
| Tests/Smoke | 310 Tests + Live-Smokes auf SDK-Verträgen | Großteil der Runtime-Verträge neu |

**Aufwand: Re-Architektur (Wochen, nicht Tage), mit Risikospitze genau am
Moat** (Sandbox + Entitlement sind die Teile, die durable schlicht nicht hat).

## 3. Was der Austausch bringen würde

- Runs überleben Deploys/Crashes wirklich (Checkpoint vor Sichtbarkeit,
  replay-safe Tools, `sleepUntil`-Tasks) — pockets größter struktureller
  Vorsprung, ehrlich.
- Damit unterwegs: dureable Task-Graph als Fundament für Schedules/Watches/
  Background-Tasks, falls πui diese Richtung je fährt.
- Documents-in-same-commit als Antwort auf das UI/Store-Auseinanderlaufen-
  Problem.

## 4. Was ihn heute kleiner macht (SDK-Spins 2026-10/11)

1. **Limit-Gate-Verhalten ist im coding-agent SDK**: Retry-Budget aus
   settings, `agent_end.willRetry`, Backoff bis 60 s — πui zeigt es live an
   (limitWait). pockets „wait out subscription limits" bleibt weiter reichweite
   (Stunden, kanarien-Muster), aber die harte Kante ist gepolstert.
2. **Cache-Keeper ist SDK-eingebaut** (`cache-warmer.js`) — πui pinnt
   `cacheWarming: "streaming"`.
3. Restart-Loss ist πuis realer Schaden **begrenzt**: Deploys sind die
   wichtigsten Restarts; ein verlorener Turn kostet einen Re-Prompt, keine
   Arbeit (Sandbox-Workspace + Sessions sind persistent; nur der laufende
   Turn stirbt).

## 5. Empfehlung + Re-Trigger

**Entscheidung (provisorisch, hier dokumentiert): bei pi-coding-agent
bleiben. pi-durable beobachten.** Re-Trigger, jeder für sich:

1. **SDK-Konvergenz:** earendil-works bringt durable Resume/Checkpointing in
   den coding-agent (gleiches Haus — plausibel; releases beobachten). →
   dann Adoptionskosten Richtung null.
2. **Produktwandel:** πui will lange autonome Runs (Stunden, Schedules,
   Background-Tasks) zum Kernversprechen machen — dann zahlt der Port.
3. **Restart-Schmerz real:** Deploys/Crashes werfen nachweislich Arbeit weg
   (User-Beschwerden, verlorene Research-Turns > 10 min). → erst Messen
   (Deploy-Zeitpunkt vs. Turn-Dauer), dann leiden.
4. **durable stabilisiert** (kein „API changes without notice", Schema
   hält über Releases) und hat Sandbox/Entitlement-Hooks.

Zwischenstand dokumentiert in `inspirations/compare-pi-pocket.md` bleibt
gültig; die dortige „schnellste Neutralisierung"-Empfehlung ist durch diese
Studie ersetzt (Adoptionskosten falsch eingeschätzt: Add-on vs. Harness).

## 6. Kleiner Sofort-Nutzen ohne Adoption

- **Restart-Kontext sichtbar machen:** der Client kennt heute keinen
  Unterschied zwischen „Turn gestorben (Restart)" und „Turn nie gestartet".
  Ein `session_status`-Flag `lastTurnInterrupted` (aus dem Session-File
  ableitbar) wäre ein S-M-UX-Gewinn — nicht in dieser Studie gebaut,
  als Idee notiert.
- Queued-Prompt-Persistenz (Restart verliert geparkte Steers) — ebenfalls
  S-M, gleiche Familie.
