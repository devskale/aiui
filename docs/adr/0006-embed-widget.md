# Embed Widget — aiui als Chat-Widget für fremde Seiten

aiui wird einbettbar: Eine Zeile auf einer fremden Website (`<script …>` oder
`<ai-chat key="…">`) bringt einen vollwertigen, gestreamten Chat mit einem
scoped Agent — ohne Login für den Besucher, ohne dass ein Secret oder
uneingeschränkter Zugriff die aiui-Instanz verlässt. Dieses ADR ist der
Bauplan (Issue `embed-widget-konzept`); Umsetzung in Folge-Issues (Phase 1–2).

## Context

- **Kein** der pi-Web-UI-Referenz-Repos ist ein Embed-Widget — alle sind
  eigenständige Apps. Der eigentliche Embed-Punkt ist das **Pi-SDK in-process**
  (nutzt aiui schon); was fehlt, ist die **Host-Bridge nach außen** plus ein
  Key-Modell (Recherche 2026-10-01, `ideas.md` §Embeddability).
- aiui bringt bereits mit: per-User `agentDir` (ADR-0001), Seatbelt-Sandbox,
  Quota (`server/quota.js`), Event bus (SSE), Session-Lifecycle
  (`server/pi-session.js`), Agents-as-Presets (ADR-0004).
- Grenzbedingungen: Credentials bleiben file-basiert (ADR-0002-Haltung); das
  SSE-Protokoll ist „ask first"; aiui core bleibt agent-agnostic.

## Zielbild & Varianten

```html
<script src="https://<aiui-host>/embed.js" data-key="wk_demo_abc123"></script>
<!-- oder -->
<ai-chat key="wk_demo_abc123" variant="modal" agent="deutsch-assistent"></ai-chat>
```

**Eine Komponente, drei Varianten** (`variant`-Attribut, default `corner`):

| Variante | Verhalten | Einsatz |
|---|---|---|
| `corner` | Launcher-Bubble unten rechts → Slide-Panel | Standard-Embed |
| `modal` | `el.open()` → zentriertes Overlay + Backdrop | Host-Navbar-Button („Chat with our agent") |
| `inline` | direkt im Seitenfluss, kein Launcher | Kontakt-/Support-Sektion |

Modal-spezifisch (Pflicht im Shadow-Root): **Focus-Trap, Esc-to-close,
`aria-modal`, `dismissOnBackdrop` konfigurierbar.** Transport, Token-Kette und
Panel-Inhalt sind in allen Varianten identisch — nur das Layout-Target
wechselt; der Aufwand einer Variante ist damit minimal.

## Decision 1: Security — die 3-Schichten-Kette (nicht verhandelbar)

1. **Public Embed Key** (`~/.aiui-auth.json` → `widgetKeys`): scoped auf
   genau einen Widget-User + Agent-Preset, `domains`-Restriction
   (Origin/Referer-Check beim Mint), `revoked` sofortwirksam.
2. **Session-Mint** `POST /api/widget/session { key }`: validiert Key +
   Domain + Quota; mintet **kurzlebiges HMAC-Token** über
   `{ user, key, exp }` (exp ≈ 1 h); **Rate-Limit pro Key pro Minute** —
   sonst verschiebt ein Key-Leak das Problem nur eine Ebene tiefer.
3. **Token-authentifizierte Widget-Endpoints** (`/api/widget/stream`,
   `/api/widget/prompt`): Server liest den User **ausschließlich aus dem
   signed Claim** — nie aus Header/Param, die der Browser setzen könnte.
   Alles andere bleibt Cookie-Session; zwei getrennte Middleware-Pfade.

## Decision 2: Visitor-scoped Runtimes (Kernbefund dieses Konzepts)

**Problem:** Der Event bus ist per User gekeyed und **session-ignorant**
(`getBus(user)`, eine Fan-out-Liste pro User), und der Session-Lifecycle
hält **genau eine** Live-Session pro User (`ctxFor(user).runtime`). Teilen
sich alle Besucher eines Keys einen Widget-User, sieht Besucher A den Stream
von Besucher B — und Besucher B's Prompt würde A's Session umschalten.

**Entscheidung — pi-feats-„Application Routing"-Muster** (Identity-Key →
isolierte Session), auf aiui übertragen:

- **Identität = Key → Widget-User** (geteilt): `agentDir` (Settings, Agent-
  Preset, Entitlement — read), **Quota-Budget**, Modell.
- **Runtime-Instanz = Besucher** (isoliert): eigene Session-Lifecycle, eigener
  Bus-Key `widget:demo/<visitorId>`, eigener Workspace-Subdir
  `workspace/widget-demo/visitors/<visitorId>/` (auch Dateien sind
  besuchergetrennt).

Konkret: `ctxFor(user)` bekommt einen Scope — `ctxFor('widget:demo',
{ instance: visitorId })`. Der Widget-User existiert einmal; die Instanz
entscheidet über runtime/bus/cwd. Implementierung als Erweiterung des
Context-Keying, nicht als Fork der Session-Logik.

**Begrenzung:** Cap an **gleichzeitigen Visitor-Instanzen pro Key**
(Phase 1: 3; weitere Besucher bekommen eine ehrliche „busy"-Antwort statt
Queueing) und **Visitor-TTL** (idle ~2 h → dispose; Visitor-Dirs älter als
X Tage aufräumen). Damit bleibt Phase 1 klein, ohne eine Architektur zu
bauen, die Serialisierung (besucher B wartet auf A) später wieder zerlegen
müsste — Serialisierung wäre für öffentliche Seiten von Tag  an kaputt.

## Decision 3: Widget-User — Entität, Quota, Sandbox

- **Ein Key = ein eigener Widget-User** (`widget:<name>`), kein Mapping auf
  echte Users. Default-deny-Entitlement wie jeder User (ADR-0001); Agent
  kommt aus dem Key (ADR-0004-Preset).
- **Quota-Entscheidung (offene Frage 1):** Budget liegt **auf dem
  Widget-User** (`limits`-Eintrag, bestehende `userLimit()`-Infrastruktur).
  Keys sind Gates, User sind Budgets — mehrere Keys eines Kunden können so
  einen gemeinsamen Haushalt teilen, ohne neue Quota-Logik. Default klein.
- **Sandbox-Entscheidung (offene Frage 2):** normale Sandbox-Grenze
  (Schreiben erlaubt) — aber nur in den **per-visitor-Workspace-Subdir**.
  `readonly` als Key-Flag folgt in Phase 2+, wenn ein Anwendungsfall es
  verlangt.

## Decision 4: Client — Custom Element, ChatTransport, Config als Daten

```
src/embed/
  embed.js       // Entry: Attribute/data-* lesen, Token minten, Element registrieren
  ai-chat.ts     // Custom Element, closed Shadow DOM, Launcher/Panel/Modal/Inline
  transport.ts   // ChatTransport-Interface: Token, SSE, prompt — die EINE Naht zum Server
  theme.ts       // CSS-Custom-Properties aus Key-Config → passt sich der Host-Seite an
```

- **ChatTransport-Seam:** bestehende UI-Bausteine (StreamEntry, ToolCards,
  MetricsBar) werden **wiederverwendet, nicht geforkt** — sie reden nur mit
  dem Transport.
- **Config als Daten** (aus der `/api/widget/session`-Response):
  `{ agent, variant, theme: { accent }, greeting, launcherLabel }` — ein
  neuer Kunde ist ein JSON-Block + Key, keine Code-Änderung.
- **CSP/Origin-Entscheidung (offene Frage 3):** `embed.js` von **gleicher
  Origin** wie aiui (kein CDN-Deploy). Origin-Check beim Mint; Smoke-Test,
  dass Origin/Referer die bestehende Proxy-Kette (amd2→lubu) unversehrt
  passiert; CORS-Header nur auf `/api/widget/*`.
- **Scope im UI:** Widget-Clients bekommen bewusst nur Chat (Entries,
  Tool-Calls, Metrics-Bar). Kein File-Browser, keine Settings, keine
  Session-Liste — die Widget-Fläche wird nicht zur zweiten App.

## Decision 5: SOTA-Anspruch — Context & Agency, nicht Chat-in-einer-Box

Chat-Widget-Einbettung als Kategorie ist Commodity (Dutzend SaaS-Produkte,
Open-Source-Starter, dokumentierte Best Practice). Was aiuis Widget vom
Markt abhebt — und damit den SOTA-Anspruch konkret einlöst — sind drei
Dinge, die ab Tag 1 architektonisch vorbereitet sind:

1. **Page-Context ab Tag 1 (Phase 1):** Der Transport schickt mit jedem
   Prompt einen `pageContext`-Block `{ url, title, referrer, selection?,
   locale }`. Der Agent antwortet kontextbezogen („was steht auf dieser
   Seite über X?“) statt kontextlos. — **Injection-Grenze:** Page-Content
   ist **Daten, nie Instruktion**: als eigener, klar abgegrenzter Block im
   Prompt gelabelt; Agent-Scope ist ohnehin sandbox + quota-gebunden.
2. **Host-Bridge ab Tag 1 (Phase 1):** `<ai-chat>` ist nicht nur ein Chat
   im Kasten, sondern steuerbar: `el.send(text)`, `el.open()/close()`,
   Events (`ai-chat:reply`, `ai-chat:settled`) — der Host kann den Agenten
   in seine eigene UX einbauen. Genau die Naht dafür ist der
   **ChatTransport** (Deshalb Interface, kein direktes fetch im UI).
3. **Host-Actions (Phase 2):** Der Key kann **vom Host freigegebene
   Aktionen** deklarieren (`hostActions: [{ name, description }]`), die der
   Agent aufrufen darf — Agent wirkt auf der Host-Seite, nicht nur im
   Panel. **Security-Story zwingend** (Muster: RiskConfirmation aus
   ideas.md §13): pro Key allowlistet, jede Ausführung **sichtbar
   bestätigt** im Widget, Host-JS bekommt nie blanket trust.

Dazu: **Embed-Endpoints als dokumentiertes Mini-Protokoll.**
`/api/widget/session|stream|prompt` + Token-Kette werden als versioniertes,
   protokollartiges Interface dokumentiert („Embed-Protocol v1“) — ein Host
   (oder ein anderes Frontend) kann sie konsumieren, ohne unser Bundle.
   UHP-ähnlich im Geist, ohne früh auf einen externen Standard festzulegen;
   wenn UHP/MCP-Embedding Reife gewinnt, ist der Schritt dorthin kein Umbau,
   sondern ein Mapping.

Bewusst **kein** SOTA-Jagdsprung: Voice und Analytics bleiben Phase 3;
Multi-Runtime bleibt Non-goal. Die drei Punkte oben sind die
Kosten-Nutzen-Spitze.

## Decision 6: Abrechnung (offene Frage 4)

Analytics (Tokens/Costs pro Key für den Host-Owner) bleibt **Phase 3**. Ab
Tag 1 schreibt der Mint-/Prompt-Pfad aber eine **strukturierte Log-Line mit
Key** (Bestandteil von Decision 1/2-Umsetzung, kein Feature) — die
Datenbasis existiert dann, ohne dass man sie nachrüsten muss.

## Phasing (Folge-Issues)

| Phase | Issue | Inhalt |
|---|---|---|
| 1 | `embed-keys-session-endpoint` | `widgetKeys` in auth.json, Provision-Skript, `POST /api/widget/session` (Domain-Check, Rate-Limit, HMAC-Token) — pure, unit-getestete Funktionen wie `auth.js` |
| 1 | `embed-visitor-runtime` | `ctxFor`-Scope (instance), Bus-Key, Workspace-Subdir, Instanz-Cap + TTL, `/api/widget/stream` + `/api/widget/prompt` (Token-Middleware) |
| 1 | `embed-widget-client` | `src/embed/` (Vite-lib-Build), Custom Element, `corner`-Variante, **Page-Context + Host-Bridge (el.send, Events)**, Demo-Host-Seite |
| 2 | `embed-variants-persistenz` | `modal` + `inline` (Focus-Trap/Esc/aria), Theme-/Launcher-Config, Session-Persistenz pro Besucher (localStorage-visitorId), `/embed`-iframe-Fallback, `readonly`-Flag, **Host-Actions (allowlist + Confirm)** |
| 3 | (bei Bedarf) | Analytics pro Key, Voice, mehrere Agents pro Key, Protokoll-Mapping (UHP/MCP) |

## Non-goals (bewusst nicht)

- Kein Multi-Runtime (Widget spricht nur aiui).
- Keine Web-Credential-Verwaltung — Keys/Config bleiben file-basiert
  (default-deny, ADR-0002-Haltung).
- Kein volles aiui-UI im Widget — Teilmenge Chat (Decision 4).

## Consequences

- Server bekommt eine **zweite Auth-Parallelwelt** (Token statt Cookie) —
  zwei klar getrennte Middleware-Pfade, getrennt testbar.
- `ctxFor`-Keying wird um einen Instanz-Scope erweitert — berührt
  `pi-session.js`, aber additiv; bestehende User-Pfade unverändert.
- Event-bus-Implementierung (`getBus`) bleibt unangetastet; nur der Key
  wird feiner (`user` → `user/instance`).
- Öffentliche Angriffsfläche wächst um Mint + Widget-Endpoints — durch
  Domain-Check, Mint-Rate-Limit, Instanz-Cap und Quota begrenzt; E2E-Fall
  „Key revoked → nächste Request abgelehnt" ist Pflicht in Phase 1.
