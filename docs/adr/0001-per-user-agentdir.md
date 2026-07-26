# Per-user resource universe via a scoped agentDir

Each User gets their own `agentDir` (at `workspace/.agent/<slug>/`, **outside**
the User's cwd so the sandboxed agent cannot reach its own entitlement config)
passed to `createAgentSession`, instead of sharing the global `~/.pi/agent/`.
The global pool no longer auto-grants to anyone; a User's entire resource
universe — skills, prompts, extensions, and their `settings.json` — is what's
in their scope. Credentials (`ModelRuntime`) are *hybrid* per ADR-0002: shared
by default, per-User (BYOK) when `auth.json` is present in the User's
`agentDir`.

## Context

We need per-User control over which skills/prompts/extensions are available.
The pi SDK's canonics offer two scopes: the global agent dir (`~/.pi/agent/`,
shared by all) and the project `.pi/` dir (at the agent's `cwd`, per-User
already). The canonics can *add* (plain `skills` paths) or *exclude* (`!`/`-`
patterns) from the global pool, but cannot *default-deny* the global pool —
every globally-installed resource auto-grants to every User until each
excludes it.

## Decision

Give each User their own `agentDir` so there is no shared global pool to leak
in. Default-deny falls out for free: nothing exists for a User unless it's in
their scope. The mechanism is a canonical SDK knob (`agentDir`), not a new
aiui adapter. Credentials follow ADR-0002 (hybrid): shared by default, BYOK
per-User by `auth.json` presence.

## Rejected alternatives

- **Shared global pool + per-User deny-list** (`!`/`-` in each User's
  `settings.json`): pure canonics, but default-allow — the opposite of an
  entitlement posture, and every new global skill auto-grants to all.
- **Shared global pool + per-User allow-list** via the SDK's
  `skillsOverride`/`promptsOverride`/`extensionsOverride` hooks: would give
  default-deny, but requires aiui to construct the resource loader and write a
  filter adapter — invention over the canonics, which we ruled out.

## Consequences

- The global `~/.pi/agent/{skills,prompts,extensions}/` no longer reaches any
  User. Resources must be installed into a User's scope (or referenced by path
  from their `settings.json`) to be available.
- `agentDir` holds resources only; auth/models stay on the shared
  `ModelRuntime`. Keep these concerns separate — never put API keys in a
  per-User dir.
- A User's `agentDir` and their project `.pi/` dir are two distinct scopes
  within one User's scope; both are read by the SDK for that User.
- Path references in a User's `settings.json` follow pi canonics: absolute,
  `~`-prefixed, or relative (resolved against the settings file's own dir).
  No aiui choice here — pi supports all three; the admin writes whichever fits.
- Settings (canonics-native, no invented third layer): the SDK's
  SettingsManager reads two files per User (`<agentDir>/settings.json` global +
  `<cwd>/.pi/settings.json` project, deep-merged) and exposes no defaults-
  injection option. So each User's `agentDir/settings.json` **must** carry the
  behavioral defaults (`defaultProvider`/`defaultModel`/`defaultThinkingLevel`
  + UI prefs like `theme`/`steeringMode`) — aiui seeds these from a single
  template at User creation. This is unavoidable duplication (changing a
  global default = update each User's file / re-seed), the cost of having no
  shared settings layer. *Entitlement* (`packages` + `skills`/`prompts`/
  `extensions` paths) is curated per-User, **not** auto-copied. Important: the
  ModelRuntime holds the model *catalog* (what models exist); the *default
  selection* comes from settings via the SettingsManager, not the runtime.

## Migration (breaking change)

This ADR is a breaking change: today every User sees the global resources for
free; after it, a User sees only what their `agentDir/settings.json`
references. Transition posture is **preserve-then-trim**:

The live resources split by origin (governs how they migrate):

- **Package-sourced** (today: the `git:github.com/devskale/skale-skills`
  package, surfacing fetch-url / web-search / para-memory-files skills) → stay
  as a `packages` entry in each User's `settings.json`. Canonics-native,
  managed per-User; `pi update` works. Packages are *not* migrated to `.lib/`
  (ADR-0001 keeps packages managed-per-user; demote a specific package to a
  `.lib/` path-reference only if per-User duplication ever hurts).
- **Loose files** (today: `herdr-agent-state.ts`, `pi-autoresearch.json` in
  `~/.pi/agent/extensions/`) → migrate into `workspace/.lib/extensions/`, then
  reference by path in each User's `settings.json`. `.lib/` is the home for
  genuine loose-file resources; one copy, shared.

One-time, per *existing* User: auto-write a `settings.json` that reproduces
their current entitlement — copy the shared `packages` array + add path
references to the migrated loose files. Existing Users keep what they had;
the admin trims per User over time. New Users start **empty** (default-deny) —
no auto-entitlement, granted explicitly.

The "everyone gets everything" state is a *transient migration artifact* for
existing Users, not the new default.
