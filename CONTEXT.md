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
  access to the workspace (`AIUI_SANDBOX=0` to disable). Has a home module —
  `server/sandbox.js`, with a small interface: `createTools(cwd)` returns the
  overridden tools (or `undefined` when off, in which case the SDK falls back
  to its own built-in tools — the better "off" state, not a no-op passthrough
  adapter) and `assertInside(base, target)` is the pure path guard. One real
  adapter (seatbelt) + an off-switch; what varies across the boundary is
  *whether tools are overridden*, not *which adapter fills the slot*.
