# πui — Coding Standards

The **review layer**: what a reviewer checks a diff against. Implementation
guidance (commands, structure, architecture walkthrough) lives in `AGENTS.md`;
vocabulary in `CONTEXT.md`; recorded decisions in `docs/adr/`. This file holds
only judgement calls — patterns a linter could never substitute for. Anything
mechanical belongs in a check, not here (see the bottom section).

## 1. Per-user isolation is the invariant

Every user-scoped resource stays user-scoped: `cwd`, `sessionDir`, `agentDir`,
the live session, history. `agentDir` sits **outside** the sandboxed cwd so a
sandboxed agent cannot reach it — a diff that moves a scoped resource into
shared state, or lets one user's path reach another's workspace, is a blocker
regardless of intent.

Path safety goes through the seam: user-influenced paths are resolved with
`resolveWorkspacePath` / `assertInside` (`server/workspace-files.js`,
`server/sandbox.js`), never hand-concatenated. Review every diff that touches
file access against this.

## 2. Shape ownership — one shape, one home module

A value shape that crosses the server/client boundary has exactly one home
module. `shared/entry.js` owns the Entry shape; server replay and client fold
both import it. A shape re-derived or copied in a second place (replay
re-parsing what `fromMessage` already owns, a component re-declaring the
shape) is a finding.

Streaming phase flags (`thinking`, `thinkingDone`, `messageComplete`) are
transient reducer state in `useAgentEvents` — never part of an Entry value. A
phase flag appearing inside a persisted shape is a finding.

## 3. SDK boundary — aiui is the stable shell

`@earendil-works/pi-coding-agent` is the moving part. On every SDK upgrade the
reviewer checks the pi changelog's breaking changes against the surface aiui
actually imports (`createAgentSessionRuntime`/`Services`/`FromServices`,
`ModelRuntime`, `SessionManager`, `create*Tool`, `parseFrontmatter`) — the
check is the diff's changed SDK calls, not the version number.

Semver gotcha: caret ranges on `0.x` pull **patches only**. Every SDK update
is a deliberate `package.json` bump + lockfile change; a bare `pnpm install`
never crosses a pi release.

Where a call's correctness depends on SDK behavior the file can't show, the
contract gets a comment at the call site (model: the `setRebindSession`
re-subscribe contract in `pi-session.js`). An undocumented SDK-dependent
assumption is a finding.

## 4. Vocabulary

Code, comments, and reviews use the load-bearing nouns from `CONTEXT.md`
(Session, Turn, Entry, Event, Attachment, Broadcaster). A new load-bearing
noun introduced by a diff gets added to `CONTEXT.md` in the same diff — a
reviewer who learns a term from the code should find it in the glossary.

## 5. Comments carry why, not what

Comments hold intent, contracts, and reasons (the ★ load-bearing files set the
bar). A comment restating the next line of code is a cut, not a nitpick.

## 6. Tests track behavior, colocated

`node:test` + `node:assert/strict`, colocated `*.test.js`, run via
`node --test <dir>` (pure functions: entry fold, mime, model filter, path
validation). A diff adding a branch or shape without touching the neighboring
test is a finding. Server wiring (session lifecycle, SSE flow) has no harness
— it is smoke-tested by hand at deploy time; a reviewer does not demand a test
framework for it, but may demand a manual smoke step in the PR description.

## 7. Language

Code, comments, docs, and commit messages are English. User-facing persona
content (`agents/*/agent.md`) may be German.

---

## Mechanical patterns → checks

Enforced by the pre-commit hook (`.husky/pre-commit`, Husky):

- `pnpm run check:sdk` — the SDK imports listed in §3 must exist in the
  installed SDK version (`scripts/check-sdk-exports.js` extracts them from
  `server/` dynamically)
- `pnpm test` — the full `node --test server/ src/ shared/` suite

Wired but manual (boots a server, so not commit-time):

- `pnpm smoke` — boot + `/api/models` + `/api/agents` (no model call)
- `pnpm smoke:full` — adds the image-only prompt round trip (real model
  call); run after dependency changes and before deploys

Still open (deliberate stance for now): no linter — ESM-only/no-TS syntax is
not mechanically checked.
