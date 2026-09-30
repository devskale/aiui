# πui — Web UI for the π Coding Agent

React frontend + Express backend that wraps the **pi SDK**
(`@earendil-works/pi-coding-agent`) into a chat-style web UI with SSE
streaming. Multi-user: each logged-in user gets a scoped workspace and an
isolated session.

Review layer: `CODING_STANDARDS.md` — judgement rules a diff is reviewed
against (isolation, shape ownership, SDK boundary).

**Scope: this repo is aiui-only** (Nutzer-Entscheid 2026-09-30). Arbeiten in
`www/aiui` = nur aiui. Recherchen zu anderen Projekten (Firmenbuch/
firmenbuch_AT, EPO, Crawler, Deployments fremder Services) gehören in deren
eigenes Repo (`~/code/firmenbuch_AT`, `~/code/configs`) — nicht hier. Commit-
Messages, Doku und Code in diesem Repo behandeln ausschließlich aiui.

## Commands

```bash
pnpm dev            # server (:3107) + client (:5173, proxies /api → 3107)
pnpm dev:server     # server only (--watch auto-restart)
pnpm dev:client     # Vite dev server only
pnpm build          # production build → dist/
pnpm test           # node --test extensions/ server/ shared/ src/lib/ scripts/ (auch im pre-commit)
pnpm e2e            # Agent-E2E-Suite (scripts/e2e-cases/, eigener Server auf freiem Port)
pnpm e2e:slow       # … inkl. Slow-Cases (Tiefenrecherchen, echte Model-Calls)
pnpm run check:sdk  # SDK-Imports gegen installierte Version prüfen (pre-commit)
pnpm smoke          # Server booten + Models/Agents-Endpoints (kein Model-Call)
pnpm smoke:full     # + Bild-only-Roundtrip (echter Model-Call)
./deploy.sh         # build, rsync to lubu, restart systemd service
```

No linter. Tests are plain `node` scripts (`*.test.js`) run directly:

```bash
node shared/entry.test.js
node server/mime.test.js
node server/sandbox.test.js
node server/agents.test.js
node server/stt.test.js
node src/lib/models.test.js src/lib/compose.test.js
```

## Project Structure

```
server/
  index.js          Express API: auth, SSE, /api/prompt, /api/abort, models,
                    thinking, agents, stt, commands, sessions, uploads, files
  pi-session.js     ★ the core — per-user session lifecycle (see below)
  agents.js         ★ the Agent catalog (ADR-0004) — loads agents/<id>/agent.md
  auth.js           login: ~/.aiui-auth.json, scrypt, persistente Sessions
                    (gehasht in ~/.aiui-sessions.json — überleben Deploys)
  quota.js          per-user daily prompt cap (in-memory, UTC reset)
  event-bus.js      SSE fan-out — ONE BUS PER USER (getBus(user))
  sandbox.js        macOS seatbelt: createTools(cwd) | undefined, assertInside
  mime.js           extension → mimetype + isImage
  stt.js            STT gateway client (/api/stt → dgxp model-proxy, ADR-0004)
agents/             ★ repo-shipped Agent presets (ADR-0004):
                      <id>/agent.md (persona + frontmatter), skills/, extensions/
extensions/         baseline per-User extensions (generate-image; ADR-0004)
src/
  App.jsx           root: composes sidebar, stream, input, pickers, modals
  components/        Sidebar, InputBar, StreamEntry, ModelPicker, AgentPicker,
                    SettingsPanel, LoginModal, ThinkingPicker, ForkPicker,
                    FileExplorer, SkillsBrowser, StatsFooter, …
  hooks/
    useAgentEvents.js  ★ SSE event reducer — the chat state machine
    useAttachments.js  file upload (images as dataURL, others via /api/upload)
    useStt.js          mic → WAV → /api/stt → transcript into the input
    useModels.js       model catalog + allowed/favorites (localStorage)
    useMention.js      @-mention file autocomplete
    useSlashMenu.js    /-command menu
  lib/
    api.js          apiUrl(path) — base-path aware (/aiui/ in prod)
    models.js       allowed-models + favorites persistence (localStorage)
shared/
  entry.js          ★ the Entry value — shared by server (replay) + client (live)
workspace/          per-user sandboxes: workspace/<slug>-<hash8>/ (gitignored)
uploads/            uploaded files (gitignored)
```

★ = load-bearing; read these first.

## Architecture

### Per-user session model (`server/pi-session.js`)

Every user gets an isolated context, lazily created:

```
workspace/<slug>-<hash8>/          agent cwd + sandbox boundary
  sessions/                        that user's stored sessions
```

`<slug>` = filesystem-safe slug of the username + 8 hex of its sha256
(collision-free across `hans@skale.dev` vs `hans@other.com`). One live
session per user, held in an in-memory `contexts` Map.

**Shared vs scoped (hybrid — ADR-0001/0002/0003):**
- **Shared (global):** the non-BYOK `ModelRuntime` (API keys + model catalog),
  built from `~/.pi/agent/{auth,models}.json`. A User with their own
  `auth.json` in their `agentDir` gets a per-User BYOK runtime instead.
- **Scoped (per-user):** `cwd`, `sessionDir`, `agentDir`
  (`workspace/.agent/<slug>/`, **outside** the cwd so the sandboxed agent
  cannot reach it), `customTools` (sandbox), the live session, history.

`buildSessionOptions(user, …)` constructs a per-user `agentDir`,
`modelRuntime` (shared or BYOK), `settingsManager`, and a `resourceLoader`
carrying the active Agent's system message (ADR-0003/0004), then passes all
four to `createAgentSession`. See "Resource discovery" and "Agents" below.
When debugging stored sessions, the JSONL record shapes live in
[`docs/session-format.md`](./docs/session-format.md) — read it before
extracting assistant messages or tool results by hand.

### Agents (ADR-0004)

An Agent is a repo-shipped preset in `agents/<id>/`: `agent.md` (frontmatter
`name`/`description`/`model?`/`stt?`/`sttLanguage?`, body = system message)
plus optional `skills/` and `extensions/` dirs loaded additively. `ctx.agent`
(per-user context) is read by the `createRuntime` factory **at build time** —
switching Agents (`/api/agent`, or `agent` on `/api/session/new`) sets it and
starts a new session. Stored sessions remember their Agent in
`<sessionDir>/.aiui-agents.json` (sessionId, read from the .jsonl header →
agentId); `switchToSession` restores it, forks inherit. An Agent's optional
`model` pin applies to newly built sessions only (validated against the
user's catalog; missing → skipped). The catalog loads once at startup —
`server/agents.js`.

**STT (voice input):** Agents with `stt: true` get a mic button when the
gateway is reachable. Browser WAV → `POST /api/stt` → `server/stt.js` →
OpenAI-compatible gateway (`STT_URL`, default `http://dgxp:3001`; optional
`STT_TOKEN`; `STT_MODEL`). Reachability is probed + cached (10 min) — the
mic self-hides where the gateway is unroutable (prod today) and self-heals
when networking lands. Disable outright with `AIUI_STT=off`.

**TTS (spoken answers):** Agents with `tts: true` get a speaker toggle —
answers are read aloud client-side via browser SpeechSynthesis
(`src/hooks/useTts.js`), no backend.

**read_pdf OCR:** scanned PDFs (no text layer) go to LlamaParse cloud-OCR
automatically (`ocr: true` forces it). Key resolution: `LLAMA_CLOUD_API_KEY`
env → `credgoo llamacloud` CLI → the pdf2md venv python
(`AIUI_CREDGOO_PY` overrides). On lubu, set the env in the systemd unit
until credgoo exists there.

**Baseline extensions** (`extensions/`, e.g. `generate-image`) are per-User
file entitlement — seeded via `default-user-settings.json` (`extensions`
array, paths relative to the agentDir), backfilled for existing users by
`scripts/enable-baseline-extensions.js` (run by deploy.sh).

### Request → response flow

1. `InputBar` → `POST /api/prompt { text, attachments }`
2. `pi-session.prompt(user, text, attachments)` → SDK `session.prompt()`
3. SDK emits Events → session `.subscribe` → **`getBus(user).push`** → SSE
4. Client `useAgentEvents` reducer folds Events into `entries[]`
5. `StreamEntry` renders entries (thinking, tool calls, markdown)

### Event bus — one per user

`getBus(user)` lazily creates a bus keyed by username. A bus:
`attach(res)` / `detach(res)` / `push(type,data)` / `send(res,type,data)` /
`bind(session)`. `bind` subscribes the SDK session's Events to `push`.
Events from one user **never** fan out to another's SSE connection.

### SSE Event flow (`useAgentEvents` reducer)

```
agent_start → turn_start → message_start → [thinking_start/delta/end]*
  → [tool_call_start/end]* → message_update (text_delta) → message_end
  → [tool_execution_start/update/end]* → turn_end → agent_end → agent_settled
```

Tool calls carry across `message_start` boundaries within a turn
(`prevToolCalls` in the reducer). Non-stream events: `session_status`,
`session_history`, `session_stats`, `error`, `compaction_*`, `auto_retry_*`,
`thinking_level_changed`, `user_prompt`, `user_steer`.

### Auth (`server/auth.js`)

- **On** iff `~/.aiui-auth.json` exists: `{ users:[], passphrases:["salt:hash"],
  limits:{guest:10} }`. Absent → open (dev), `req.user = null`.
- scrypt-verify passphrase; in-memory session token (7-day cookie
  `aiui_session`); login throttled 10/min per IP.
- Config is **live-reloaded on mtime** — edit the file + restart the service.
- `requireAuth` middleware: open pass-through when unconfigured, else
  `req.user = username`.

### Quota (`server/quota.js`)

Per-user daily cap from `limits` in the auth config (`null` = unlimited).
In-memory, resets at UTC day boundary. Enforced in `/api/prompt`; over-limit
→ 429 + an error Event on that user's bus.

### Resource discovery (skills/prompts/extensions) — default-deny (ADR-0001)

`/api/commands` → `getCommands(user)` → `session.resourceLoader.getSkills()/
getPrompts()/getExtensions()`. aiui constructs the SDK's
`DefaultResourceLoader` per-user from `cwd` (= `workspace/<user>/`) +
`agentDir` (= `workspace/.agent/<user>/`, **outside** the cwd). It discovers
from:

1. **Per-user `agentDir`** `workspace/.agent/<slug>/{skills,prompts,extensions}/`
   + that dir's `settings.json` (`skills`/`prompts`/`extensions`/`packages`).
2. **Project** `workspace/<user>/.pi/{skills,prompts,extensions}/` — per-user,
   empty by default, deep-merged under the agentDir settings.

**Default-deny:** there is no shared global pool — a User sees only what their
`agentDir` references. Entitlement is admin-curated, file-based: edit the
User's `agentDir/settings.json` (`packages` for git/npm sources, path arrays
for loose files in `workspace/.lib/`). The slim system message (ADR-0003) is
passed as the loader's `systemPrompt` string, which the SDK routes as
`customPrompt` — replacing pi's CLI persona but preserving skills/context/cwd.
`/api/models` returns the per-User catalog (BYOK Users see only their own
models).

### Sandbox (`server/sandbox.js`)

macOS seatbelt confines the agent to `workspace/<user>/`. `createTools(cwd)`
returns overridden read/bash/edit/write tools (or `undefined` when
`AIUI_SANDBOX=0`, in which case the SDK uses its own built-ins). `assertInside`
is the pure path guard (tested). On lubu (Linux) confinement is bubblewrap
(`bwrap`); `AIUI_SANDBOX=0` disables. The sandbox allow-lists the agentDir
resource subdirs AND agent-carried skill dirs (`carriedResourceRoots()`),
so the agent can read a carried SKILL.md.

The per-user `agentDir` lives at `workspace/.agent/<slug>/`, **outside** the
cwd, so the sandboxed agent cannot read its own entitlement config or BYOK
keys (`auth.json`). The `~/.pi/agent` seatbelt grant was **removed**
(ADR-0002) — the agent never needs key access; the SDK reads keys server-side,
in the Node process outside the sandbox.

## API Routes

| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/api/login` | public | verify credentials, set session cookie |
| POST | `/api/logout` | public | revoke session |
| GET  | `/api/me` | public | auth state + user + quota |
| GET  | `/api/events` | req | SSE stream (per-user bus) |
| POST | `/api/prompt` | req | send prompt (quota-checked) |
| POST | `/api/abort` | req | abort current turn |
| GET  | `/api/models` | req | per-user model catalog (hybrid keys) |
| POST | `/api/model` | req | set session model |
| GET/POST | `/api/thinking-level` | req | get/set thinking level |
| GET  | `/api/commands` | req | skills/prompts/extensions (the user's ENABLED set) |
| GET  | `/api/agents` | req | Agent catalog + STT availability (ADR-0004) |
| POST | `/api/agent` | req | switch Agent (starts a new session) |
| POST | `/api/stt` | req | voice → text via the STT gateway (agent mic input) |
| GET  | `/api/skills/search` | req | browse the public skills.sh catalog (read-only; admin curates enablement) |
| GET  | `/api/files` | req | workspace file list (@-mention) |
| GET  | `/api/tree` | req | one level of a workspace dir (G5 browser) |
| GET  | `/api/file` | req | read a workspace text file (≤1MB; workspace-scoped) |
| GET  | `/api/file/raw` | req | raw bytes (images) with mime Content-Type |
| GET  | `/api/stats` | req | session stats |
| GET  | `/api/history` | req | replay entries |
| GET  | `/api/bash-output` | req | full output of a truncated bash call (temp `pi-bash-*.log`) |
| POST | `/api/session/new` | req | new chat |
| GET  | `/api/sessions` | req | list stored sessions |
| POST | `/api/session/switch` | req | switch to a stored session |
| GET  | `/api/fork-targets` | req | user messages this session can branch from |
| POST | `/api/fork` | req | branch from a message (new session file; SDK `runtime.fork`) |
| POST | `/api/compact` | req | compact context |
| POST | `/api/compact/abort` | req | abort compaction |
| POST | `/api/compaction/auto` | req | toggle auto-compaction |
| GET  | `/api/changelog` | req | CHANGELOG.md |
| POST | `/api/upload` | req | file upload (multer) |

## Tech Stack

- **Backend:** Express 5, multer, SSE (`EventSource` client-side). Node ESM.
- **Frontend:** React 19, Vite 6, react-markdown + remark-gfm, lucide-react.
- **Agent SDK:** `@earendil-works/pi-coding-agent` — `createAgentSession`,
  `ModelRuntime`, `SessionManager`.

## pi SDK Reference

The full SDK repo is cloned at `pi/` (gitignored, never commit). Source of
truth for SDK APIs. Key references under `pi/`:
- `packages/coding-agent/src/core/` — `sdk.ts` (`createAgentSession`),
  `resource-loader.ts` (skills/prompts/extensions discovery),
  `settings-manager.ts` (`settings.json` schema), `session-manager.ts`.
- `README.md`, `docs/`, `examples/`.

Consult `pi/docs/` + `pi/examples/` for SDK patterns before touching the
SDK integration.

## Deployment

Full topology (skale.dev → amd2 nginx → lubu :8001 → systemd):
see [`docs/deployment.md`](docs/deployment.md). Tested live via surf.

```bash
./deploy.sh    # vite build (VITE_BASE=/aiui/), rsync to lubu, restart service
```

- **On lubu:** `/home/woodmastr/code/webuis/aiui/`
- **URLs:** `https://skale.dev/aiui` (**primary** — same-origin reverse
  proxy on amd2 nginx, cookies first-party),
  `https://lubu.skale.dev/aiui/` (via amd1-TLS-Relay — nginx dort, seit
  2026-09-30 gehärtet: Restart=on-failure, keine statischen DDNS-Upstreams),
  `https://neusiedl.duckdns.org:8001/aiui/` (direct, valid cert),
  `http://lubuntu.local/aiui/` (LAN).
- **Service:** `~/.config/systemd/user/aiui.service` (port 8082,
  `NODE_ENV=production`, nvm node `~/.nvm/.../v24.13.0/bin/node`).
- **Nginx:** zwei Hops. amd2 (`sites-enabled/skale.dev`, mirror im configs
  repo `nginx/amd2/skale.dev`): `/aiui/` → `https://pind.mooo.com:8001`
  mit `Host: lubu.skale.dev` + resolver `valid=300s` (folgt DDNS-IP-Wechseln;
  gleiches Muster wie `/throway/`) — SSE-safe (`proxy_buffering off`,
  86400s) + `client_max_body_size 64m`. lubu (`/etc/nginx/aiui.conf`, von
  BEIDEN `:8001`-vhosts included): `/aiui/` → `127.0.0.1:8082` (SSE-Settings
  wie amd2).
- **STT (ADR-0004):** the dgxp gateway (`http://dgxp:3001`) is reachable
  from the Mac (dev) but NOT from lubu yet — the mic self-hides there until
  a route exists (reachability-probed, no config needed). When enabling:
  set `STT_TOKEN` (gateway Bearer, lives in `~/code/model-proxy/.env` on
  dgx) in the systemd unit env.
- **Auth:** `~/.aiui-auth.json` on lubu. Generate a hash:
  `node scripts/hash-passphrase.js '<pw>'`, paste `salt:hash` into `passphrases`.
  Per-User override: `credentials: { "<user>": "salt:hash" }` (replaces the
  shared list for that user). Demo account: `demo`/`demo` (quota 10/day).
- **Model filter:** in `~/.aiui-auth.json` — `models: { include: [...],
  notInclude: [...] }` deployment-wide, `userModels: { "<user>": {...} }`
  replaces it per User. Patterns anchor at the start of `provider@id`:
  no `*` = prefix (`unii@tu@`), with `*` = glob anywhere
  (`unii@tu@qwen*`, `kilo@*free*`, `opencode@*free`); `notInclude` wins.
  Enforced in `/api/models`, `setModel`, and agent model pins
  (`server/model-filter.js`).
- **rsync excludes** `workspace/`, `uploads/`, `.pi/` → user data survives deploys.
- **skale.dev entry (amd2, no Vercel):** skale.dev is served by amd2 nginx
  (certbot) — the old skalego/vercel.json redirect is gone. `/aiui` and
  `/aiui/` both work (internal 307). Change the entry in the configs repo
  (`nginx/amd2/skale.dev`) + on amd2, then `nginx -t && reload`.
  Incident + Fix-A rationale: memo `aiui-erreichbarkeit` (2026-09-30),
  configs commit `fa420da`.
- **Logs:** `journalctl --user -u aiui -f`.

## Code Style

- Functional React + hooks; `useReducer` for the chat stream, `useState` for UI.
- Single `src/index.css` for all styling — no CSS modules/frameworks.
- JSDoc-style `═══` section headers in server modules.
- Named exports (not default).
- Hooks return destructured objects.

## SDK Gotchas

These cost real debugging time. Read before touching the SDK integration.

1. **Image format is FLAT** — `{ type:'image', mimeType, data }`, not the
   nested `source:{...}` form the docs show. The provider reads `mimeType` +
   `data` directly; nested form silently sends `data:undefined`.
2. **`.pi/settings.json` uses camelCase** — `defaultProvider`/`defaultModel`,
   not `snake_case` (silently ignored → falls back to global).
3. **pnpm vs npm on lubu** — local npm vs lubu pnpm hardlinks into a
   content-addressed store. To patch the SDK on lubu:
   `find node_modules -name 'openai-completions.js' -path '*pi-ai*'`.
4. **CLI vs SDK versions differ** — `pi --version` (CLI) ≠
   `node_modules/@earendil-works/pi-coding-agent/package.json` version.
5. **SDK uses `fetch`, not `node:http`** — intercept via `globalThis.fetch`,
   loaded with `--import` before the OpenAI SDK captures the reference.
6. **Upload path needs `VITE_BASE` prefix** behind a sub-path proxy:
   `${process.env.VITE_BASE || ''}/uploads/${filename}`.
7. **SSE needs nginx** `proxy_buffering off` + `proxy_read_timeout 86400s`.

## Boundaries

- ✅ **Always:** Run `pnpm dev` to verify before committing; keep
  `useAgentEvents` reducer in sync with SDK event types.
- ⚠️ **Ask first:** New npm deps; changing the SSE protocol.
- 🚫 **Never:** Modify `node_modules/`; commit `uploads/` or `workspace/`;
  hardcode API keys; add a CSS framework.
- 🚫 **Never:** Nicht-aiui-Themen hier bearbeiten (siehe Scope oben) — kein
  Fremd-Repo-Checkout im aiui-Arbeitsverzeichnis, keine Firmenbuch-/
  Crawler-/EPO-Arbeit in aiui-Commits oder -Docs.
