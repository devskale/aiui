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
  `{ role, text, thinkingText, toolCalls }`. Has a home module — `shared/entry.js`,
  imported by both server (replay) and client (live stream). The streaming
  phase flags (`thinking`, `thinkingDone`, `messageComplete`) are transient
  reducer state, **not** part of the Entry value — they describe how a live
  turn is being produced, not what the Entry is.

## Streaming

- **Event** — one SDK emission within a turn (`turn_start`, `message_update`,
  `tool_execution_*`, …) delivered to clients.
- **Attachment** — a file bound to a prompt. Images carry a `dataUrl`; the server
  extracts `{ type:'image', mimeType, data }` for the SDK.

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
