# πui

A web UI for the [π coding agent](https://github.com/earendil-works/pi-coding-agent).
React frontend + Express backend, SSE-streamed chat, multi-user with per-user
scoped workspaces and isolated sessions.

```
pnpm install
pnpm dev      # server :3001 + client :5173 (proxies /api → 3001)
```

Open http://localhost:5173. Auth is **off** by default (open in dev); turn it
on by creating `~/.aiui-auth.json` (see below).

## What it does

Wraps the pi SDK (`@earendil-works/pi-coding-agent`) into a chat interface:
streaming responses, tool calls, thinking blocks, file attachments, model
picker, thinking-level control, session history, and compaction. Each logged-in
user gets an isolated agent workspace and session; credentials are hybrid
(shared keys by default, or per-user BYOK keys).

## Architecture in one paragraph

`InputBar` → `POST /api/prompt` → `pi-session.prompt()` → SDK `session.prompt()`
→ SDK emits Events → `getBus(user).push()` → SSE → `useAgentEvents` reducer →
`StreamEntry`. One SSE bus per user; one live session per user; hybrid
`ModelRuntime` (shared keys by default, per-user BYOK when a user has their own
`auth.json`). Per-user `agentDir` gives default-deny resource entitlement.
See [`AGENTS.md`](./AGENTS.md) for the full map.

## Key files

- `server/pi-session.js` — per-user session lifecycle (the core).
- `server/index.js` — Express API + SSE.
- `server/auth.js` — login (`~/.aiui-auth.json`), `server/quota.js` — daily caps.
- `src/hooks/useAgentEvents.js` — SSE event reducer (chat state machine).
- `shared/entry.js` — the Entry value, shared by server replay + client stream.

## Auth (optional)

Create `~/.aiui-auth.json`:

```json
{
  "users": ["alice", "guest"],
  "passphrases": ["salt:hash"],
  "limits": { "guest": 10 }
}
```

Generate a hash: `node scripts/hash-passphrase.js '<passphrase>'` → paste the
`salt:hash` into `passphrases`. `limits` is optional (`null`/absent = unlimited).
Edit the file live + `systemctl --user restart aiui`.

## Deploy

```bash
./deploy.sh    # build, rsync to lubu, restart systemd service
```

Targets `lubu:/home/woodmastr/code/webuis/aiui/` behind nginx at `/aiui/`,
reached via `skale.dev/aiui` (Vercel redirect). Excludes `workspace/` +
`uploads/` so user data survives deploys. Full topology + gotchas:
[`docs/deployment.md`](docs/deployment.md).

## Docs

- [`AGENTS.md`](./AGENTS.md) — architecture, API routes, resource discovery,
  deployment, SDK gotchas. **Read this first when working on the code.**
- [`CONTEXT.md`](./CONTEXT.md) — domain glossary (Session, Turn, Entry, Event,
  User, Quota, Sandbox, Event bus).
- [`CHANGELOG.md`](./CHANGELOG.md) — release notes.
- [`REFERENCES.md`](./REFERENCES.md) — projects and templates that inspired πui.
