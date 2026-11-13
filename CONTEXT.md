# πui — domain glossary

Load-bearing nouns for πui. Architecture reviews and new code should use these
terms; sharpen them here when they get fuzzy. (Architecture vocabulary — module,
interface, depth, seam, adapter, leverage, locality — is separate from this list.)

## Conversation

- **Session** — a pi SDK agent session; the unit of conversation state. Created,
  resumed, or switched; exactly one is live at a time. Owns `messages`, model,
  thinking level, and stats.
- **Turn** — one agent invocation within a session
  (`agent_start` → … → `agent_settled`). May span multiple assistant messages and
  tool executions.
- **Entry** — one chat row in the UI: a user message, an assistant turn
  (text + tool calls + thinking), or an error. Stable value shape:
  `{ role, text, thinkingText, toolCalls }` plus optional, role-dependent
  fields — `images`/`attachments` on user rows, `usage` on assistant rows
  (absent key = not present, never null). Has a home module — `shared/entry.js`,
  imported by both server (replay) and client (live stream). The streaming
  phase flags (`thinking`, `thinkingDone`, `messageComplete`) are transient
  reducer state, **not** part of the Entry value — they describe how a live
  turn is being produced, not what the Entry is.
- **Ask card** — the UI form of a parked `ask` tool call: 1–4 questions,
  each with optional fixed choices as buttons. The run pauses until
  `POST /api/ask/answer` resolves it (timeout/abort resolve with a stated
  default instead of hanging). Main app only — widget embeds render no
  cards. Home module `server/ask.js`; UI `src/components/AskCard.jsx`.
- **Canvas** — the live research panel (ADR-0005): the agent writes
  `reports/…/canvas.json` with its write tool; a done write matching the
  canvas glob triggers a `/api/file` fetch and `ResearchCanvas` re-renders
  (`useCanvas`). Zero SSE protocol changes — it rides existing events.

## Streaming

- **Event** — one SDK emission within a turn (`turn_start`, `message_update`,
  `tool_execution_*`, …) delivered to clients.
- **Attachment** — a file bound to a prompt. Images carry a `dataUrl`; the server
  extracts `{ type:'image', mimeType, data }` for the SDK.

## Library & vision

- **Bibliothek** — the per-User document library: the workspace's uploads
  *are* the library (`GET /api/library` lists them). A `#dokname` token in a
  prompt pulls the document's content into the context — text inline
  (capped), PDFs via the fresh OCR cache or the text layer, images as
  vision content. Home module `server/library.js`.
- **Vision bridge** — the path that keeps image mentions working on
  text-only models (`server/vision-bridge.js`): a vision-capable model
  describes the image one-shot over the existing `ModelRuntime`, the
  description rides along as text evidence, and the raw image drops out.
  Cached per file as `<name>.vision.md`; bridge model via
  `AIUI_VISION_MODEL` (else the first catalog image model ≠ current).

- **Broadcaster** *(legacy)* — the ad-hoc `broadcast` + `setEventBroadcaster`
  callback wiring that fanned Events out to SSE clients. Superseded by the
  **Event bus**.
- **Event bus** — the SSE fan-out sink: delivers Events to all connected clients.
  One module (`server/event-bus.js`), transport-aware, session-ignorant.
  Replaces the Broadcaster. Narrow interface (`attach` / `detach` / `push` /
  `send` / `bind`) over a rich implementation (formatting, keepalive,
  dead-subscriber cleanup). The session lifecycle module binds itself to it
  directly on creation/switch.

## Confinement

- **Sandbox** — the macOS seatbelt confinement layer scoping the agent's file
  access to the user's workspace (`workspace/<user>/`; `AIUI_SANDBOX=0` to
  disable). Has a home module —
  `server/sandbox.js`, with a small interface: `createTools(cwd)` returns the
  overridden tools (or `undefined` when off, in which case the SDK falls back
  to its own built-in tools — the better "off" state, not a no-op passthrough
  adapter) and `assertInside(base, target)` is the pure path guard. One real
  adapter (seatbelt) + an off-switch; what varies across the boundary is
  *whether tools are overridden*, not *which adapter fills the slot*.

## Resources

- **Resource** — a loadable capability the agent can use. Three kinds:
  **Skill** (task-specific instructions; injected into the system prompt and
  registered as `/skill:name` commands), **Prompt** (a reusable prompt
  template), **Extension** (code registering tools, commands, and flags).
  Discovered by the SDK's resource loader from two scopes per User: their
  **`agentDir`** (per-User, at `workspace/.agent/<slug>/` per ADR-0001 — *not*
  the global `~/.pi/agent/`, which no longer reaches any User) and the
  **project `.pi/` dir** at the agent's `cwd` (`workspace/<slug>/.pi/`). The
  project scope is gated on *project trust* — the SDK reads
  `<cwd>/.pi/settings.json` + `<cwd>/.pi/{skills,prompts,extensions}/` only
  when trusted; aiui constructs the loader with the project trusted, so each
  User's scoped dir is a live, trusted project scope. Per ADR-0003 aiui
  constructs the resource loader itself (to pass the slim `systemPrompt`
  string, which the SDK routes as `customPrompt`); this is a canonics knob,
  **not** a filter adapter — default-deny + entitlement still come entirely
  from `agentDir`. (Not to be confused with "module", the architecture term.)

- **Resource universe** *(planned)* — the complete set of Resources
  available to one User: everything the SDK's loader discovers from that
  User's `agentDir` + project `.pi/` dir. Under ADR-0001 each User gets their
  own `agentDir` (at `workspace/.agent/<slug>/`, **outside** the User's cwd so
  the sandboxed agent cannot reach its own entitlement config), so there is no
  shared global pool — a User's universe is exactly what's in their scope.
  _Avoid_: "scope" (collides with the SDK's own user/project scope
  distinction), "pool".

## Users

- **User** — a logged-in identity (username + passphrase, configured in
  `~/.aiui-auth.json`). Each User gets a **scoped workspace** at
  `workspace/<user>/`: the agent's `cwd`, its session store, and the sandbox
  boundary. One live Session per User. Under ADR-0002 credentials are
  *hybrid*: shared by default (one global `ModelRuntime`), but a User with
  their own `auth.json` in their `agentDir` gets a per-User `ModelRuntime`
  reading their keys — BYOK opt-in per User. The working dir + history are
  always per-User.

- **Quota** — a per-User daily prompt cap (`limits` in the auth config, e.g.
  `guest: 10`). `null` = unlimited. Enforced in `/api/prompt`; over-limit → a
  429 + an error Event on that User's bus.
- **Model filter** — the include/notInclude prefix rules narrowing a User's
  model catalog: `userModels[<user>]` in the auth config replaces the
  deployment-wide `models` block for that User (`modelFilterFor`,
  live-reloaded). A BYOK User's catalog follows their own keys regardless.

## Embed widget

- **Widget key** — the public per-site embed credential (`wk_…`, entry in
  the auth config's `widgetKeys`): scoped, revocable, domain-bound
  (ADR-0006). One key = one **Widget-User** — an entity of its own, never
  mapped onto a real User; Agent and budget come from the key, Entitlement
  is default-deny like everyone else's.
- **Widget token** — the short-lived (1 h) HMAC token minted by
  `POST /api/widget/session` (rate-limited, domain-checked). Authenticates
  the token-guarded widget endpoints; deliberately not a session cookie.
- **Visitor** — one visitor instance of a Widget-User: scope key
  `widget:<name>/<visitor>` (`scopedUser`). Shares the Widget-User's
  agentDir, budget, and model; gets its own runtime, bus key, and workspace
  subdir (`visitors/<instance>`). Capped concurrent instances per key,
  idle-TTL disposal (ADR-0006 D2).
- **Page context** — the host-page facts the widget ships into the prompt as
  a DATA block (never host-JS trust): composable, replay-safe. The
  host-bridge (`el.open/close/send`, `ai-chat:reply/settled` events) is the
  narrow host-side API around it.

### Registration & accounts

- **Registered user** — a self-service account created by email signup, stored
  in `~/.aiui-users.json` (sibling of the auth config; home module
  `server/email-auth.js`). Identified by the **normalized email** (whole
  address lowercased — no provider munging), with `status` pending → active.
  A *second* credential source **beside** the auth config (verifyCredentials
  unions both): a registration can never lock out a config-defined account.
  Default Quota is low (5/day) until an admin raises it.
- **Registration mode** — `REGISTRATION_MODE=invite|open|closed` (default
  `invite`); invite codes come from the auth file's `inviteCodes` + env
  `AIUI_INVITE_CODES` (env wins).
- **Verify/Reset token** — the single-use link token of a registration or
  passphrase-reset mail: 32 random bytes, stored sha256-only, 30-min TTL
  (`TOKEN_TTL_MS`). Minting invalidates every still-pending token of the same
  purpose — only the freshest mail's link ever works. Consumed via
  `server/email-auth.js`; auto-login on success.
- **Mail budget** — the in-process outbound-mail caps (`MAIL_DAILY_MAX`,
  `MAIL_PER_MINUTE`, 0 = kill-switch) plus the shared 60s per-address mail
  cooldown. Unconfigured SMTP → dry-run (no network). Home module
  `server/mailer.js`.
- **Day-cap** — the global limit on NEW accounts per UTC day
  (`REGISTER_DAILY_MAX`, default 20, 0 = registration kill-switch). Derived
  from the users store's `created` timestamps — restart-safe, counts only new
  accounts (pending re-registers burn nothing).

- **Entitlement** *(planned)* — the set of Resources a User is permitted to use;
  the Resource-universe boundary. Under ADR-0001 an Entitlement is expressed
  purely in pi canonics, via two mechanisms in the User's `agentDir/settings.json`:
  the `packages` array (managed git/npm sources, installed per-User) and
  `skills`/`prompts`/`extensions` path arrays (loose files in the shared
  Resource library). There is no aiui allow-list code — the SDK's own loader
  reads that dir, and what's listed *is* the Entitlement. Admin-curated,
  file-based, like auth/Quota. _Avoid_: "permissions", "ACL", "allow-list"
  (those imply aiui-side enforcement code we deliberately don't have).

- **Resource library** *(planned)* — the canonical store for **loose-file**
  Resources, shared across all Users: `workspace/.lib/{skills,prompts,extensions}/`.
  One copy of each loose Resource; a User's Entitlement references paths into it
  via their `agentDir/settings.json`. Updating a file once updates it for every
  entitled User. *Package-sourced* Resources (git/npm sources) do **not** live
  here — per ADR-0001 they stay managed-per-User via the `packages` array
  (canonics re-clones per User); demote a specific package to a `.lib/` path
  reference only if per-User duplication ever hurts. Distinct from a User's
  `agentDir` (which holds only that User's `settings.json` + Credentials) and
  from `~/.pi/agent/` (the legacy shared pool, no longer read under ADR-0001).

- **Credentials** *(planned)* — the API keys + model catalog a User runs
  with. *Hybrid* (ADR-0002): a shared global `ModelRuntime` by default, but a
  User with `auth.json` (and optionally `models.json`) in their `agentDir` gets
  a per-User `ModelRuntime` built from those files — BYOK, opt-in per User by
  file presence. The model catalog follows the keys: a BYOK User sees only
  their own models. _Avoid_: "API keys" as a noun (say Credentials).

## Agents

- **Kollektion** — the bundle of files a User attaches to ONE message
  (photos and/or PDFs), treated by the Deutsch-Assistent as a single
  ordered work: queryable as a whole, cited per item ("(Foto 2)",
  "(PDF S. 3)"), optionally persisted as a markdown Auswertung in the
  User's workspace. Named Kollektionen keep the User-given name. Lives in
  the `dokumente` skill's workflow, not in aiui state — a Kollektion is a
  conversational unit, not a stored object. _Avoid_: "Bundle", "Set",
  "Dokument" (that's one item of it).
- **Agent** — a named preset that swaps the session's persona and carried
  capabilities (ADR-0004): a repo directory `agents/<id>/` holding
  `agent.md` (frontmatter: name/description/model?/stt?; body = the
  session's system message) plus optional `skills/` + `extensions/` that
  load additively for that Agent's sessions. The implicit **default Agent**
  is the slim πui assistant (ADR-0003). Bound at session build via
  `ctx.agent` → the `createRuntime` factory's `resourceLoaderOptions`;
  switching Agents therefore starts a new session. Each session remembers
  its Agent in the sidecar `.aiui-agents.json` (its home is
  `server/agents.js`). Agent-carried Resources are deployment-curated
  product presets — outside per-User Entitlement by design; per-User
  default-deny is untouched. _Avoid_: "persona" (that's the prompt body),
  "mode", "bot".
- **Baseline extension** — a capability every User gets by file entitlement
  (seeded via `default-user-settings.json`, backfilled by
  `scripts/enable-baseline-extensions.js`): `generate-image` today. Same stance as the
  seeded `fetch-url`/`web-search` skills; opt-out is deleting the settings
  entry. _Avoid_: calling these "Agent tools" (they are per-User, not
  per-Agent).

## System prompt

- **System message** — the base system prompt sent to the model at the start
  of every turn. Per ADR-0003 aiui owns it: a slim, web-chat-shaped message
  authored in aiui code, passed as the resource loader's `systemPrompt` string
  (a canonics knob), which the SDK routes as `customPrompt` into
  `buildSystemPrompt`. That path **replaces** pi's default 162-line CLI-oriented
  persona **but preserves** the appended skills, project-context, and cwd
  sections. `machine_context` (CLI hostname / SSH origin / duckdns URL) is
  stripped for free — under the SDK path it came only from `APPEND_SYSTEM.md`,
  which aiui does not place. Shared (one constant in code, not per-User files).
  _Avoid_: "system prompt" when you mean the slim aiui message specifically
  (say System message); "persona".
- **Event bus** *(updated)* — now **one bus per User** (`getBus(user)`), so an
  Event from one User's Session never fans out to another's SSE connection.
