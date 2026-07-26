# aiui-owned slim system message

aiui constructs the resource loader (`DefaultResourceLoader`) and passes a
`systemPrompt` string that **replaces** pi's default 162-line coding-agent
persona with a slim, web-chat-shaped message authored by aiui. The SDK routes
that string as `customPrompt` into `buildSystemPrompt`, which keeps the slim
persona but **still appends** skills, project context files (AGENTS.md etc.),
and `cwd` — so those load-bearing sections are preserved. `machine_context`
(CLI hostname / SSH origin / duckdns URL) is stripped for free: under the SDK
path it comes only from `APPEND_SYSTEM.md`, which aiui does not place in any
User's `agentDir`.

## Context

pi's default base system prompt (`core/system-prompt.ts`) is shaped for a
developer at a CLI terminal — "expert coding assistant operating inside pi, a
coding agent harness," plus a large pi-documentation block and machine_context.
aiui is a web-based multi-user chat UI. The CLI persona, the pi-docs block, and
machine_context are wrong-shaped for that context.

The SDK offers two related levers on `DefaultResourceLoader`:

- `systemPrompt: string` — becomes `buildSystemPrompt`'s `customPrompt`. The
  customPrompt path **replaces** the persona/tools/guidelines/docs block **but
  keeps** the appended skills, project-context, and cwd sections. This is the
  lever we use.
- `systemPromptOverride: (base) => string` — transforms the assembled base
  prompt wholesale. Heavier-handed; not needed here.

## Decision

aiui constructs `DefaultResourceLoader({ cwd, agentDir, settingsManager,
systemPrompt: SLIM_SYSTEM_PROMPT })`, reloads it, and passes it (plus the same
`settingsManager`) to `createAgentSession`, instead of letting the SDK
default-construct the loader. The slim message is a shared constant in
`server/pi-session.js`. No `APPEND_SYSTEM.md` is placed in any User's `agentDir`
— `machine_context` therefore never appears.

## Rejected alternatives

- **Strip `machine_context` only, keep pi's 162-line base persona:** achieved by
  simply not placing `APPEND_SYSTEM.md`. Purest Q3 (SDK default-constructs
  everything), but leaves aiui inheriting the persona + pi-docs block it didn't
  write, shaped for a CLI it isn't.
- **`systemPromptOverride` (full replacement):** would work, but bypasses the
  `customPrompt` path — aiui would have to re-assemble skills/context/cwd itself.
  The `systemPrompt` string gets them for free.
- **`APPEND_SYSTEM.md` with slim content:** appends *after* the base (base
  stays), and since `agentDir` is per-User the message must be copied into every
  User's dir — the same duplication problem as shared settings defaults.

## Consequences

- aiui owns resource-loader construction. This is a **canonics knob**
  (`systemPrompt`/`customPrompt`), not an invented adapter — distinct in kind
  from ADR-0001's rejected approach (rejected for requiring a *filter adapter*
  with custom allow-list logic, not for loader construction). Default-deny
  (ADR-0001) and entitlement still come from `agentDir`, which the aiui-
  constructed loader still reads.
- Skills, project context files, and cwd are **preserved** — the customPrompt
  path appends them after the slim persona. Verify this holds when upgrading the
  SDK (it's a `buildSystemPrompt` contract).
- `machine_context` is gone for all aiui Users. If host context ever matters,
  add it to `SLIM_SYSTEM_PROMPT` in **code** — one place, shared.
- The slim message is **shared** (one constant), not per-User.
- The **content** of `SLIM_SYSTEM_PROMPT` is an aiui authoring concern (impl),
  separate from this structural decision.
- Impl risk: constructing the loader means aiui must forward every required
  option (`cwd`, `agentDir`, `settingsManager`) correctly and call
  `resourceLoader.reload()` itself (the SDK only reloads a loader it constructs).
