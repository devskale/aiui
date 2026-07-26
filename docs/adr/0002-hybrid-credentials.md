# Hybrid credentials: shared ModelRuntime by default, BYOK per User

Credentials (API keys + model catalog) are *hybrid*. By default every User runs
on one shared global `ModelRuntime` (built from `~/.pi/agent/auth.json` +
`models.json`). A User gets their own keys the moment an `auth.json` is placed
in their `agentDir` (`workspace/.agent/<slug>/auth.json`): aiui then builds a
per-User `ModelRuntime` from that file instead of the shared one. BYOK is opt-in
per User, by file presence.

## Context

ADR-0001 gave each User their own `agentDir`. The SDK canonics already read
`<agentDir>/auth.json` + `<agentDir>/models.json` for a per-agentDir runtime —
so per-User keys is the canonics default, not invention. aiui had been
overriding this by explicitly passing a shared `modelRuntime` to every
`createAgentSession`. Some Users may need individual API keys (e.g. their own
provider accounts); others should keep riding the shared fronted credentials.

## Decision

Build the `ModelRuntime` per-User, choosing by file presence (the same idiom
`auth.js` uses for the auth config):

- No `auth.json` in the User's `agentDir` → use the shared global `ModelRuntime`.
- `auth.json` present → build a per-User `ModelRuntime` from the User's
  `agentDir` (`auth.json` + optional `models.json`).

Pass that `modelRuntime` to `createAgentSession`. The model catalog follows the
keys: a BYOK User sees only their own models in the picker.

## Rejected alternatives

- **Shared only** (today): can't support Users with individual keys.
- **Per-User only** (full BYOK pivot): forces every User to bring keys; breaks
  the existing fronted/passphrase-login Users.

## Consequences

- `getAvailableModels()`, `/api/models`, and `/api/model` become per-User: a
  BYOK User's catalog comes from their `models.json`, not the global one.
- The shared `ModelRuntime` must be created lazily and may coexist with
  per-User runtimes — keep them in separate variables, never a single global
  mutated per request.
- `auth.json` in a User's `agentDir` is sensitive: it lives outside the cwd
  (per ADR-0001's `workspace/.agent/<slug>/`), so the sandboxed agent cannot
  read it. Keep it that way — never place keys inside a User's cwd.
- The sandbox profile's `~/.pi/agent` grant (which let every agent read the
  shared `auth.json`) must be **removed**. The agent's tools never legitimately
  read keys/models — the SDK reads those server-side, in the Node process,
  outside the sandbox. Keeping the grant would defeat BYOK isolation (every
  agent, including BYOK Users', could still read the shared keys). This is a
  strict security improvement that ADR-0001 + this ADR make necessary.
- Quota is unaffected by BYOK. The per-User daily prompt cap (`limits` map)
  protects the host's compute/storage/bandwidth, not API cost — a BYOK User
  still burdens the host per prompt. Quota stays per-User for everyone; the
  admin exempts a specific User via the existing `limits` map (`null`). No
  BYOK-aware quota logic.
