# Agents as repo-shipped presets

An **Agent** is a named preset that swaps the session's persona and carried
capabilities: a directory under `agents/` holding an `agent.md` (frontmatter
metadata + a persona body that becomes the session's system message), plus
optional `skills/` and `extensions/` that load additively for that Agent's
sessions. The implicit `default` Agent is today's slim πui assistant
(ADR-0003) — unchanged behavior when no Agent is picked.

## Context

aiui's Users wanted specialists, not one generic assistant: an English
teacher (with voice input) and a German document/image assistant (with PDF
reading). pi canonics already offer the pieces — prompts/skills for persona
playbooks, extensions for tools — and ADR-0003 gives aiui one seam where the
system message is bound: the `createRuntime` factory's
`resourceLoaderOptions.systemPrompt`, which re-runs on every session
replacement (new/switch/fork). Prior art: the pi SDK's own
`examples/extensions/subagent` persona files (frontmatter + body) and
deepseek-harness's agent presets (`agent.cordis.yml` — persona row + tool
rows per preset directory).

## Decision

- **Agents are data, shipped in the repo**: `agents/<id>/agent.md` with
  frontmatter (`name`, `description`, `model?`, `stt?`, `sttLanguage?`) and
  the persona as the body. `server/agents.js` is the catalog: `listAgents()`
  (metadata for the UI), `getAgent(id)` (full def, unknown → default),
  `requireAgent(id)` (route validation). The SDK's `parseFrontmatter` does
  the parsing; no new format invented.
- **Binding rides the existing seam**: `ctx.agent` (per-user context) is read
  by the `createRuntime` factory at build time. Switching Agents = set
  `ctx.agent`, then rebuild (a new session). The loader gets
  `additionalSkillPaths`/`additionalExtensionPaths` for the Agent's carried
  resources.
- **Sessions remember their Agent** via a sidecar map
  (`<sessionDir>/.aiui-agents.json`, sessionId → agentId; the id is read
  from the .jsonl header, never the filename). `switchToSession` restores it
  before the factory runs; forks inherit.
- **Optional model pin**: an Agent's `model` is applied to freshly built
  sessions via validated `session.setModel` — skipped (not fatal) when the
  user's catalog (BYOK) lacks it. Resumed sessions keep their own model.
- **STT is Agent-scoped, server-proxied**: the browser mic (only when the
  active Agent sets `stt: true` and the gateway is reachable) posts WAV to
  `/api/stt`; `server/stt.js` proxies to the OpenAI-compatible gateway
  (`STT_URL`/`STT_TOKEN`/`STT_MODEL` env) so the token never reaches the
  browser. Reachability is probed (cached) so the mic self-hides where the
  gateway host is unroutable (e.g. prod without a route to the DGX) and
  self-heals when networking lands.
- **Baseline extensions are per-User file entitlement**, same stance as the
  seeded `fetch-url`/`web-search` skills: `generate-image`
  (`extensions/generate-image/`) is seeded via `default-user-settings.json`
  (`extensions: ["../../../extensions/generate-image/index.js"]`, relative
  paths resolve from the agentDir) and backfilled for existing Users by
  `scripts/enable-imagegen.js` at deploy time.

## Rejected alternatives

- **Pure Resources, no core seam** (persona only as a prompt/skill the user
  invokes with `/english-teacher`): works today with zero code, but the
  persona isn't session-persistent — every message needs the command, and
  nothing stops the generic persona from bleeding through. Wrong shape for
  "an agent that is specifically good at something".
- **`before_agent_start` extension rewriting the system prompt per turn**
  (the SDK's pirate.ts pattern): no factory changes, but Agent state would
  live inside an extension and need file persistence to survive session
  switches; the UI (picker, session_status) would still need server routes.
  STT needs a server route regardless, so the thin core seam pays for itself.
- **Per-user personas via `agentDir` files**: makes specialists an
  admin-per-user chore and can't ship with the product.
- **dsh-style subagent orchestration**: powerful but far beyond the need.

## Consequences

- **Entitlement stance**: Agent-carried skills/extensions are
  deployment-curated product presets (repo content, like the seeded baseline
  skills) — they bypass per-User default-deny *by design*, scoped to the
  sessions of that Agent. Per-User entitlement (ADR-0001) is untouched for
  everything else. If an Agent should ever be restricted per-User, that is
  a route-level gate, not a loader change.
- Carried extensions run in-process (outside the seatbelt sandbox); the
  pdf-tools `read_pdf` tool therefore enforces its own cwd confinement, and
  generate-image resolves API keys server-side only.
- Agent catalog edits need a service restart (loaded once at startup).
- The sidecar is best-effort: a lost entry falls back to the default Agent —
  a persona mismatch, not a failure.
- The Agents system prompt inherits ADR-0003's contract: skills, project
  context, and cwd are appended after the persona body.
