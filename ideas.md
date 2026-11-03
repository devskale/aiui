# Ideas from reference repos

Analysis of the reference repos cloned into `inspirations/`, mapped against
what aiui (`piui`) already has. Plus findings from the broader coding-agent
UI landscape (GitHub, web). This is an open ledger — no prioritization or
effort estimates; use this as a menu of possibilities.

## Reference repos

- `inspirations/chatbot-template` — shadcn-ui/chatbot-template (Next.js + AI SDK UI shell)
- `inspirations/pi-web` — agegr/pi-web (Next.js browser UI for pi; closest analog to aiui)
- `inspirations/pi-gui` — minghinmatthewlam/pi-gui (Electron Codex-style desktop app for pi)
- `inspirations/deepseek-harness` — deepseek-ai/deepseek-harness (plugin-driven agent harness)

## Broader landscape (2026-09)

- **agegr/pi-web** (6.3k⭐) — pi's official web UI: session workspace, git worktrees, web config, i18n.
- **agent-of-empires/aoe** — TUI + web + CLI + HTTP API; multi-agent parallel runs in tmux, worktrees, Docker/Podman/Apple Containers sandboxing, diff review, mobile-responsive web dashboard.
- **kierbica/universal-agent-ui** — provider-agnostic frontend: Claude Code, OpenCode, others via adapter pattern; dynamic theming per provider, cost tracking, settings modal.
- **liuhuanxi-oss/claude-code-web-ui** — Vue 3 + Koa: streaming chat, multi-session, cost/usage analytics, file browser, web terminal (node-pty), cron scheduled jobs, model selector.
- **CUI / kanna / claude-run** — multiple Claude Code web UIs with session history, streaming, tool visibility.
- **opencode/web** — official OpenCode web UI; spawned forks: mobile clients (Android/iOS), Obsidian sidebar embed, VSCode extension.
- **HarnessRouter** — unified API for multiple agent harnesses (Codex, Claude Code, Hermes, PI, DSH) via Unified Harness Protocol (UHP).
- **omp-deck** — omp (oh-my-pi) cockpit: multi-session chat, kanban board, cron routines, inbox, Telegram bridge, plugin marketplace.

---

aiui's existing primitives: `shared/entry.js` (Entry value, server+client),
`server/event-bus.js` (one SSE bus per user), `server/pi-session.js` (per-user
session lifecycle), `server/quota.js` (daily cap), `src/hooks/useAgentEvents.js`
(SSE reducer), `src/hooks/useMention.js` (@-mention), `useSlashMenu.js`
(/-menu), `src/index.css` (single CSS file, no framework — a hard boundary).

---

## Delta-Review 2026-09-28 (repos re-pulled: pi-web 0.9.3, pi-gui 1.0.1, dsh 0.2.0-rc.1)

Since the Sep-14 ledger, aiui shipped 0.3.1–0.4.0 (FileExplorer G5, model filter,
last-used model, read_pdf cache, Agents, E2E suite, share/report bundles,
Canvas ADR-0005, Firmenindex-Agent, global Esc abort). Already covered → dropped
from the menu. New/risen candidates from the re-pulled repos:

- **Scroll-to-latest button** (pi-web #845) — floating button above the composer
  when the viewport is detached from the live tail. Counterpart to our smart
  autoscroll. **S — trivial, do first.**
- **Changes card per turn** (pi-gui #178) — at the end of each turn that edited
  files: file count, per-file + total line counts, first 5 files + Show more;
  clicking a row opens the diff. The matured version of "files-written chips".
  Perfect fit for Firmenindex report bundles (index.html, rohdaten/, zip).
  **S–M — top pick.**
- **Browser notifications on turn finish** — long research turns (E2E: 375s+)
  make this genuinely useful now, not just polish. **S.**
- **Chat minimap + per-turn tool-call count badge** (pi-web #939) — navigating
  long research sessions; a 1-line answer and a 45-tool deep-research turn
  become distinguishable at a glance. **M — more valuable since 0.4.0.**
- **Queued messages while streaming** (pi-web ChatInput) + **draft persistence**
  (pi-web `draft-store.ts`) — during multi-minute research turns users want to
  pre-type. Still unimplemented in aiui. **S–M.**
- **Remember open session per browser tab** (pi-web #887) — nice for parallel
  workflows across tabs. **S–M.**
- **Models panel refresh button + minimal-edit enable switches** (pi-web #938,
  #930; subagents individually switchable #934) — direction for our
  SettingsPanel/model-filter UX. **S.**
- **Auth hardening to port** (pi-web 0.9.2/0.9.3): Basic-Auth attempt
  throttling, reject login redirects resolving to another origin, keep secrets
  out of agent/terminal shells. aiui is publicly exposed (nginx/duckdns) —
  **audit against these. S.**
- **Streaming/session robustness checklist** (pi-web): first-streamed-chunk
  duplication (#835), Strict-Mode event-stream reopen (#933), session-list
  scroll perf (#940) — check whether aiui has the same classes of bug; our new
  E2E suite is the right place to pin them.
- **Turn duration ("Worked for")** (pi-gui #177) + **usage ring** (pi-gui #182) —
  StatsFooter already covers tokens/cost/context; only polish if desired.
- **dsh 0.2 web UI**: plugin manager + task-manager "process rows" — maps to
  our Resource-universe admin UX and to Canvas cards for the Firmenindex
  subtask list (ADR-0005). Strategic, **L**, decide deliberately.
- **Scheduled tasks** (pi-gui cron, matured in 1.0) — still open from §9;
  multi-user quota questions first. **L.**
- Not adopted: pi-gui theme presets (single-CSS-file is a hard boundary),
  worktree sidebar folders (sandbox isolates; workspaces aren't git repos),
  dsh telemetry/session-log upload.
- chatbot-template: only 3 minor commits (cn alias, merge adjacent text parts,
  deps) — nothing new to take.

---

## Delta-Review 2026-10-01 (re-pulled after SDK 0.99.2 upgrade)

Re-pulled pi-web / pi-gui / dsh / chatbot-template after the aiui SDK bump
0.87.1 → 0.99.2. Two findings were **already covered** by aiui (no action), two
were real gaps and got fixed in this pass.

### Already covered — no action

- **Change thinking level while streaming** (pi-web #851) — pi-web disabled the
  reasoning control for the whole run, assuming the level can't change mid-turn.
  aiui's `ThinkingPicker` is gated only on `sessionAlive` (true while a session
  exists), never on `streaming`, and the SDK re-reads `agent.state.thinkingLevel`
  before each request (agent-session.ts:771/779/895). So aiui already lets you
  change the level mid-run; the POST `/api/thinking-level` path has no streaming
  guard. Nothing to do.
- **Configurable send key** (pi-web #1001, Enter vs Ctrl+Enter) — aiui
  hardcodes Enter-to-send with Shift+Enter for newline. Nice-to-have polish,
  not a bug; left open.
- **Enable all/Disable all for Skills** (pi-web #1020) — conflicts with aiui's
  default-deny + admin-curated entitlement (ADR-0001). Intentionally not a fit.

### Fixed this pass (real gaps)

- **Keep typed line breaks in user messages** (pi-web #1015) — Chrome renders a
  lone `\r` as a space even under `white-space: pre-wrap`, merging pasted text
  into one paragraph. aiui's `.entry-user-bubble` uses `pre-wrap` but never
  normalized line endings. **Fix:** normalize `\r\n`/`\r` → `\n` in InputBar
  `handleSend`. (Committed 3c77c6b.)
- **Mobile composer above the iOS keyboard** (pi-web #992) — `.app` used
  `height: 100vh`, which ignores the on-screen keyboard. **Fix:** `100svh`
  fallback + `100dvh`. (Committed 3c77c6b.)

### Noted, not adopted

- **pi-gui extension cards/views** (#220/224/212/214) — extension-display UI;
  maps to aiui's extension surface, low priority.
- **pi-gui "Add to Chat" transcript annotation** (#209) — select transcript text
  and send it as notes with the next message. Niche, not urgent.
- **dsh 0.2.0-rc.2** — plugin manager + task-manager rows; already noted as
  strategic/L in the ledger. No new action.
- **chatbot-template** — only dep bumps + `cn` alias. Nothing new.

---

---

## Delta-Review 2026-10-01 (new repos: pi-web-ui-official, pi-web-jmfederico, pi-feats, pi-web-ui-valtterimelkko)

Re-pulled after the best-of ranking (`inspirations/bestof.md`). The four newly
cloned repos open new feature surfaces that the original four didn't cover —
especially **multi-user/persistence**, **sandbox/guardrails**, and **subagent
orchestration**. Grouped by πui-relevance; **bold** = strong fit.

### Already covered — no action

- **Multi-conversation-per-project** (pi-web-ui-official) — each conversation
  gets its own agent runtime and keeps streaming in the background. aiui
  already runs one live session per user (the sandbox isolates per-user).
  Multiple parallel runtimes is a bigger architectural change; noted, not adopted.
- **Subagent templates** (pi-web-ui-official `subagent-templates.ts`) — a role
  system prompt + skills whitelist + optional model. aiui has agents but no
  subagent template registry; overlaps with the Resource-universe entitlement
  model (ADR-0001). **L — deliberate decision, not a quick win.**
- **Model test runner** (pi-web-ui-official) — run a test prompt against a new
  model before selecting. Already noted in §5 (M). No change.

### Strong fits (πui-specific)

- **Steer / follow-up queueing** (pi-web-ui-official ChatInput `queuedMessages`,
  jmfederico `steer`) — send a follow-up while the agent is replying; it's
  queued and injected when the current turn's tool calls settle. aiui disables
  the input while streaming. This is the highest-value UX gap for long turns.
  **S–M — top pick.**
- **Compaction, visible** (pi-web-ui-official) — compacted context shows as a
  card ("compacted from N tokens") + a live banner counting up with the trigger
  (manual/threshold/overflow). aiui has `compaction_*` events; a structured
  card + trigger banner is a clean win. **M.**
- **Vision bridge** (pi-web-ui-official `vision-bridge.ts`) — when the model is
  text-only, images are transcribed into text evidence by an auto-discovered
  vision model. aiui attaches images as dataUrl; a text-only model currently
  can't see them. **M — real gap.**
- **In-app package manager** (pi-web-ui-official plugins, jmfederico;
  PiDeck) — install/update extensions, skills, themes from the UI without
  leaving it. aiui manages resources via config; a UI layer maps to the
  Resource universe. **L — strategic.**
- **Subagent runtime** (pi-web-ui-official `subagent-*`) — spawn independent
  background conversations for parallel exploration/implementation/review,
  collect via `subagent_wait_all`. Already noted in §8; the official impl is
  the reference to mine. **M–L.**
- **Goal-conversation mode** (pi-web-ui-official `goal-*`) — turn goal review
  into a conversation: an execution chat does the work, the current chat acts
  as reviewer. Maps to aiui's goal/review ambitions. **L — deliberate.**
- **Model management UI** (pi-web-ui-official `model-admin.ts`, jmfederico) —
  provider login, API keys, models, model tests, reasoning level from the UI.
  aiui keeps credentials file-based (default-deny); a read-only model/status
  surface is safe, full credential editing is not. **M (read-only) / L (write).**
- **Usage/token/cost meter** (pi-web-ui-official, vagusPI) — live token + cost
  stats per session. aiui's StatsFooter covers tokens/cost/context; a per-turn
  usage meter is polish. **S.**

### Sandbox / confinement (pi-feats — the layer everyone else is missing)

- **Nono policy sandbox** (pi-feats) — constrain a named profile's process,
  filesystem, network, credentials via a Nono policy. aiui's Sandbox is
  macOS seatbelt (server/sandbox.js). pi-feats is the closest prior art for
  **policy-controlled** confinement beyond a single seatbelt profile. **L —
  study, don't port.**
- **Isolated profiles** (pi-feats) — per-profile settings, credentials, model
  state, sessions, `SOUL.md`, skills under `~/.pi/agent/profiles/<profile>/`.
  Maps to aiui's per-User `agentDir` (ADR-0001). Confirms the per-profile
  isolation posture. **Posture, not code.**
- **Guardrails** (pi-feats) — ordered policy instructions at input/tool/output
  lifecycle stages. aiui has no guardrail layer; this is the model for one.
  **M–L.**
- **Context memory** (pi-feats) — bounded persistent operational + personal
  context loaded at session start. aiui's per-User workspace is the analog;
  a bounded memory file is a small extension. **S–M.**
- **Pi Console WebUI** (pi-feats) — authenticated browser ops cockpit for
  API server, profiles, applications, skills, pulses, logs, terminal. This is
  the closest thing to a multi-user admin surface — **the reference for πui's
  admin/ops story. L — strategic.**
- **Pulse / scheduled prompts** (pi-feats) — cron/one-shot/heartbeat bound to a
  profile + session. Already noted in §9; pi-feats is the pi-native impl. **L.**
- **Application routing** (pi-feats) — accept external payloads, route into pi
  sessions, return integration-specific responses; identity-key mapping for
  multi-user. **Directly relevant to πui's multi-user + widget ambitions. L —
  study for the widget-embed idea (§Eigene Ideen).**

### Multi-runtime (valtterimelkko — only if it becomes a goal)

- **Multi-runtime adapter** (valtterimelkko) — Pi + Claude Code + OpenCode +
  Antigravity in one UI. Only relevant if πui ever drives non-pi agents.
  **Defer.**

### Multi-user / persistence (jmfederico — the sibling in the target direction)

- **Persistent server-side workspaces** (jmfederico) — sessions keep running
  in real workspaces after the browser leaves; `sessiond` daemon; remote
  machines. aiui runs one session per user in-process; a daemon/remote layer
  is a bigger architecture step. **L — strategic, matches πui's direction.**
- **Remote machines** (jmfederico) — one PI WEB instance proxies projects,
  files, git, sessions, terminals from trusted remote machines. aiui is
  single-host. **Defer (L).**
- **Supervise multiple sessions in parallel** (jmfederico) — switch between
  laptop/phone/tablet/desktop. Overlaps with multi-conversation; defer.

---

## 1. Chat UX / streaming

- **Chat minimap** (pi-web `ChatMinimap.tsx`) — a thin right-edge scrollbar
  with turn nodes (user msg + assistant preview) you can click to jump. Great
  for long agent sessions where turns are huge. **S — high value.** aiui
  already has smart autoscroll; this is the natural next step for navigation.
- **Lazy render of long histories** (pi-web `chat-lazy-load.ts`) — render only
  the tail N=50 messages, page in older ones on scroll-up, with a "reveal
  history" affordance. aiui replays full history into `entries[]`; for long
  sessions this is a real win. **M.**
- **Turn "files written" chips** (pi-web `TurnWrittenFiles.tsx`) — after a
  turn, render the files it actually wrote/edit as clickable chips (sourced
  from the turn's `write`/`edit` tool calls, **not** by scanning reply text).
  aiui already renders tool calls + diff stats; this adds a clean clickable
  summary. **S.**
- **Compaction summary parsing** (pi-web `compaction-summary.ts`) — parse the
  `<read-files>`/`<modified-files>` envelope out of a compaction summary and
  show the body + file lists separately instead of raw text. aiui has
  `compaction_*` events; surface a structured summary. **M.**
- **Sources / citations drawer** (chatbot-template `sources-part.tsx`) — after
  a web search, dedupe results into a "Searched N websites" drawer with
  citations. Only relevant if aiui adds a web-search tool. **M (with tool).**

## 2. Composer / input

- **Per-session draft persistence** (pi-web `draft-store.ts`) — save the
  in-progress text + attached images per draft key so switching sessions /
  tabs doesn't lose what you were typing; rekey on session switch. aiui's
  `useAttachments` holds images in state only. **S.**
- **Prompt recovery on retry** (pi-web `prompt-recovery.ts`) — key a user
  message by its text + image signature so a retried prompt with identical
  content isn't duplicated. **S.**
- **Input history recall** (pi-web ChatInput `inputHistory`) — up-arrow recalls
  previously sent prompts. **S.**
- **Composer "submit modes"** (pi-gui `composer-commands.ts`) — slash commands
  can be `immediate` / `prefill` / `pick-option` (e.g. `/model` prefills,
  `/compact` runs). aiui's `/`-menu is palette-only; adding a prefill/pick
  mode for param'd commands is a nice upgrade. **M.**
- **Queued messages while streaming** (pi-web ChatInput `queuedMessages`) —
  let the user type the next prompt while the agent is still running and queue
  it (instead of a disabled input). **M.**
- **Image attach limits** (pi-web `image-attachments.ts`) — enforce
  `MAX_ATTACHED_IMAGES` + per-image byte cap with clear errors, instead of
  unbounded base64 uploads. **S — worth doing regardless.**

## 3. Sessions / history

- **Group sessions by project** (pi-web `session-reader.ts` +
  `attachSessionProjectInfo`) — read each session's `cwd`, resolve its git
  project root, and group the sidebar by project. aiui's sidebar lists Recent
  sessions flat. **M.**
- **Session auto-title** (pi-web `session-title.ts`) — generate a concise
  title with a shadow-agent run (tools stubbed to throw) using the same
  provider, then persist it. aiui stores sessions; auto-titling beats
  "Session N". **M.**
- **Session search already exists** in aiui (CHANGELOG 0.2.1) — pi-web adds
  **branch/rename/export/delete/archive** per session. aiui has fork + new but
  not rename/archive/export. **M.**
- **Worktree per session** (pi-web `worktree.ts`, pi-gui) — start a session in
  an isolated git worktree so parallel work never collides. Heavy; aiui's
  sandbox already isolates per-user. **L — probably out of scope for a web
  multi-user app.**

## 4. File / workspace tools

- **File viewer with source/preview/diff modes** (pi-web `FileViewer.tsx` +
  `file-viewer-state.ts`) — click a written file to open a pane that shows
  source, rendered Markdown/image/PDF/DOCX preview, or the git diff. aiui has
  a file browser + inline diff viewer; a dedicated preview pane is the gap. **M.**
- **Git status/diff sidebar** (pi-web `git-changes.ts`, `git-status.ts`) — show
  `git status --porcelain` with a `+added/-removed` stat and per-file diffs.
  aiui already shows per-tool diff stats; a live workspace git panel is new. **M.**
- **File fuzzy @-mention index** (pi-web `file-fuzzy.ts`) — rank @-mention
  matches by frecency, not just prefix. aiui has `useMention`; add ranking. **S.**
- **File type / icon mapping** (pi-web `file-types.ts`, `FileIcons.tsx`) —
  central extension→type→icon registry. aiui has `mime.js` server-side; a
  client icon map is polish. **S.**

## 5. Model / config

- **Model discovery + scoped models** (pi-web `model-discovery.ts`,
  `model-scope.ts`) — resolve which models are actually enabled, surface
  diagnostics when a pattern matched nothing. aiui has `useModels` +
  BYOK catalog; surfacing per-user scope warnings is a small win. **S.**
- **Web-based provider/API-key config** (pi-web `ModelsConfig.tsx`,
  `provider-credential-store.ts`) — manage providers/keys from the UI instead
  of editing files. aiui deliberately keeps credentials file-based
  (default-deny); this would need care around the entitlement model. **L.**
- **Model test runner** (pi-web) — run a test prompt against a newly added
  model to verify it works before selecting. **M.**

## 6. Keyboard / system

- **Global Esc = abort agent** (pi-web `useKeyboardShortcuts.ts`) — a module
  registry so any pane can invoke abort; Esc in textarea closes menus first,
  aborts when no menu open. aiui has abort via button + `useEscape`; make it
  global + consistent. **S.**
- **OS notifications on run finish** (pi-gui, pi-web `browser-notifications.ts`)
  — native/browser notification when an agent turn ends, with a sound toggle.
  For a web app, the Notification API is easy. **S.**
- **Native notifications** are desktop-only in pi-gui; browser notifications
  are the web equivalent. See above.

## 7. Architecture / robustness patterns worth copying

- **Pure, heavily-unit-tested lib modules** (pi-web) — almost every lib file
  has a matching `*.test.mjs` (atomic-file, file-fuzzy, session-title, etc.).
  aiui's tests are plain `node` scripts; extending that habit to new pure
  modules (compaction parsing, draft store, lazy-load math) is cheap and
  high-leverage. **Ongoing.**
- **Module-level handler registry** (pi-web `useKeyboardShortcuts.ts`) — a
  tiny global registry (abort handler) avoids prop-drilling across the app.
  **S.**
- **Shadow tools for side-effect-free sub-runs** (pi-web `session-title.ts`) —
  stub `execute` to throw when you only need the LLM to produce text. Clean
  pattern for any future "generate X from the conversation" feature. **S.**
- **JSONL/disk as source of truth** (pi-gui) — pi-gui reads pi's JSONL session
  files as authoritative for closed sessions rather than keeping a divergent
  copy. aiui already replays from stored sessions; keeping the session file the
  single source of truth is the right posture to preserve. **Posture, not code.**

---

## 8. Multi-agent / orchestration

- **Subagents runtime** (pi-web `subagent-*` modules) — run sub-agents from the UI; `subagent-runtime`, `subagent-queue`, `subagent-isolation`, `subagent-profile-precedence`, `subagent-prompt` (each with sibling tests).
- **Agent of Empires model** — multi-agent parallel runs in isolated tmux sessions; TUI + web + CLI + HTTP API surfaces; worktrees + Docker/Podman/Apple Containers sandboxing; diff review; mobile-responsive dashboard.
- **Universal Agent UI adapter pattern** — provider-agnostic frontend with pluggable adapters (`BaseAdapter` extension); dynamic theming per provider (colors, icons, labels); cost tracking per response; auth status checks; settings modal to enable/disable providers.
- **omp-deck kanban + routines** — multi-session chat view, kanban board for task status, cron-like scheduled routines, inbox for notifications, Telegram bridge, plugin marketplace.
- **Multi-agent coordination** (lightson-os/coders-war-room) — real-time coordination of multiple Claude Code agents; tmux-based sessions, live dashboard, file browser, drag-and-drop task assignment.

## 9. Scheduling / automation

- **Cron scheduled jobs** (liuhuanxi-oss/claude-code-web-ui, deepseek-harness `schedule`) — cron表达式调度自动执行提示词; one-shot and fixed-rate reminders over session log; manual trigger/pause/resume; execution logs.
- **Agent-of-empires profiles + repo hooks** — per-agent profiles with custom commands, repo-level hooks, diff review workflows.

## 10. Analytics / cost tracking

- **Usage analytics dashboard** (liuhuanxi-oss/claude-code-web-ui, universal-agent-ui) — total token usage (input/output), cost tracking in USD, 30-day trend charts, breakdown by model.
- **Provider usage quotas** (pi-web) — show provider-level quota usage in the model picker.
- **Cost + duration per response** (universal-agent-ui) — display cost and duration for each agent response.
- **Session monitor dashboard** (Claude-Code-Agent-Monitor) — real-time tracking of sessions, agent activity, tool usage, subagent orchestration; Kanban status board; live analytics; notifications.

## 11. Terminal / shell integration

- **Web terminal** (liuhuanxi-oss/claude-code-web-ui, pi-web `custom-ui-terminal`) — full terminal in browser via node-pty + WebSocket; interactive shell commands; tmux session attachment.
- **Integrated PTY terminal** (pi-gui) — terminal pane inside the desktop app for running commands alongside agent chat.

## 12. Mobile / cross-platform

- **Mobile-responsive web UI** (agent-of-empires, acp-ui, agent-os) — structured mobile view for phones/tablets; PWA support; touch-optimized controls.
- **Native mobile apps** (bmpenuelas/opencode-mobile-client, ferdiu/opencode-wrapper-android) — Android/iOS webview wrappers with native notification support.
- **Desktop apps** (vastsa/PI-Desktop, pi-gui, cdesktop) — Electron/Rust host core; native menus, tray, system notifications; offline-first architecture.
- **Obsidian sidebar embed** (emmet24/obsidian-opencode-wsl) — embed web UI in Obsidian via WSL bridge.
- **VSCode extension** (cpkt9762/opencode-web-for-vscode) — embed web UI in VSCode sidebar.

## 13. Safety / guardrails

- **Pre-execution guard** (kenryu42/cc-safety-net) — blocks destructive Git and filesystem commands before tool calls run; supports multiple agents (Amp, Claude Code, Codex, Cursor, Pi, etc.).
- **RiskConfirmation primitive** (deepseek-harness) — modal dialog gating sensitive actions behind explicit checkbox acknowledgment; warning icon + description; confirm button disabled until checked.
- **Sandbox policies** (deepseek-harness `sandbox-policy`, `sandbox-local`, `sandbox-windows-acl`) — native sandbox implementations (Linux landlock, Windows ACL, macOS seatbelt).

## 14. Extensions / plugins

- **Plugin marketplace** (omp-deck, deepseek-harness Cordis) — user-installable plugins; everything-is-a-plugin architecture; composability model for tools/skills/models.
- **Extension display** (pi-gui `extension-display`, `extension-session-ui`) — show active extensions per session; extension-specific UI controls.
- **MCP adapter** (nicobailon/pi-mcp-adapter) — token-efficient MCP adapter for Pi.
- **Web search extension** (nicobailon/pi-web-access) — web search and content extraction for Pi.

## 15. Session / project management

- **Persistent task workspace** (gcywcsyxx/JerryCodexUI) — DeepSeek-ready workspace with paste uploads, persistent tasks across sessions.
- **Faryo Codex mobile agent** (SongJunguo/faryo-codex-web-ui) — live tmux sessions, structured history, Markdown/KaTeX rendering, reliable delivery, PWA, secure remote access.
- **Session isolation** (agent-os) — isolated workspaces per session with git integration.

## 16. Blackboard / persistent workspace

- **Blackboard (wie Claude App)** — ein persistentes, frei editierbares Markdown-Dokument pro User/Projekt, das wie eine „Tafel“ (blackboard) funktioniert: Agent und User teilen sich denselben laufenden Notizzettel. Der Agent kann darauf schreiben/löschen/umschreiben, der User kann es direkt im Browser editieren — und beide sehen live, was der andere ändert.
  - **Wie es funktionieren könnte:** Wir schreiben eine Markdown-Datei (z. B. `workspace/<user>/blackboard.md`) als gemeinsame Quelle der Wahrheit. Der Agent bekommt sie als Tool („write to blackboard“/„read blackboard“), die UI zeigt sie als editierbares Panel (nicht nur Chat-Stream), und Änderungen werden live via Event bus / SSE synchronisiert.
  - **Warum es gut passt:** aiui hat bereits per-User Workspaces, den Event bus für Live-Sync und Markdown-Rendering. Es hebt aiui von reinem Chat zu einem kollaborativen Arbeitsraum — der Agent arbeitet *in* einem Dokument, nicht nur in Antworten.
  - **Referenzen:** Claude App's „blackboard“/canvas-Konzept; Notion-artige Live-Dokumente; `workspace-files.js` (aiui) als bestehende Basis für Datei-Zugriff.
  - **Offene Fragen:** Ein einziges Blackboard pro User oder pro Projekt/Session? Konfliktlösung bei gleichzeitigem Editieren? Soll es in den Sandbox-Zugriff des Agents eingebunden sein (schreiben darf nur der Agent + User, nicht der Sandbox)?

---

## Embeddability — was die neuen Repos wirklich beitragen

**Kernbefund:** Keins der vier neuen Repos (pi-web-ui-official, pi-web-jmfederico,
pi-feats, pi-web-ui-valtterimelkko) ist ein **Embed-Widget** (Custom Element,
script-tag oder iframe-embed). Alle sind eigenständige Apps, die ihr eigenes
Browser-Fenster betreiben. Aber zwei liefern die **Vorstufe**, die für ein Embed
entscheidend ist: die **Host-Schnittstelle** und das **Pi-SDK als Embed-Punkt**.

### 1. `window.__piWebUiHost` (pi-web-ui-official) — die Host-Bridge

Das ist die nächste verwandte Sache zu einem Embed. Ein **window-Singleton**,
über das Plugins die Haupt-App steuern können (kein Import interner Module):

```ts
window.__piWebUiHost = {
  version: 6,
  setView("chat" | "terminal" | "git" | `plugin:<id>`),
  startChat({ prompt, newChat?, cwd?, model? }) → boolean,
  openSession({ cwd?, folders?, roots?, prompt?, newChat? }) → Promise<{ok, sessionId?, error?}>,
  sessions: { list(), open(id) },
  compose({ text?, attachments? }) → boolean,   // in die Eingabe, warten auf User
  reloadCatalog(source, { install?, replace? }) → Promise<{ok, error?, entries?, installed?}>,
  onUiAction(name, handler) → () => void,
  pageCall({ op, args?, target?, timeoutMs? }) → Promise<{ok, result?, error?}>,
}
```

**Warum relevant für πui:** Das ist genau die **host-API-Fläche**, die ein
Embed-Widget braucht. Bevor man ein `<ai-chat>`-Custom-Element baut, sollte
man diese **Host-Schnittstelle** als Referenz nehmen: sie zeigt, wie man
Aktionen (startChat, openSession, compose) **durch eine schmale, versionierte
Bridge** anbietet, statt die App intern zu importieren. πui's Embed-Widget
könnte dieselbe Form nutzen — ein `window.__aiuiHost`-Singleton, den der Host
befüllt und das Widget konsumiert.

**Was fehlt für ein echtes Embed:** `__piWebUiHost` ist **innen** (App → Plugin),
nicht **außen** (Host-Seite → App). Es fehlt die Umkehrung: eine API, über die
ein fremder Host das Widget erzeugt/steuert. Das ist die Lücke, die πui mit
seinem `<ai-chat>`-Custom-Element + Key-Modell füllt.

### 2. Pi-SDK als Embed-Punkt (nicht die Web-UI)

Die eigentliche Embed-Referenz ist **nicht** eine der Web-UIs, sondern das
**Pi-SDK selbst** (`@earendil-works/pi-coding-agent`). `pi-web-ui-official` und
`pi-web-jmfederico` nutzen es **in-process** (die Agent-Runtime läuft im eigenen
Server-Prozess, nicht in einem Kind-Prozess). Das ist der Kern des
„embed"-Ansatzes: die **Agent-Logik** ist embeddbar (via SDK), die **UI** ist
es nicht (sie ist eine App).

> **Konsequenz für πui:** Wenn Embeddability ein Ziel ist, ist der richtige
> Hebel das **Pi-SDK in-process** (das πui schon tut) + eine **schmale
> Host-Bridge** (analog `__piWebUiHost`) + das **Key-/Token-Modell** (aus der
> Widget-Idee). Die Web-UIs liefern dafür nur die Host-Bridge-Referenz, nicht
> das fertige Widget.

### 3. Plugin-API als Embed-äquivalente Erweiterungsfläche

- **pi-web-ui-official** — `plugin-host.ts` + `plugin-api-catalog.ts`: Plugins
  sind Bare-ESM, dynamisch importiert, steuern die App via `__piWebUiHost`.
  Ein **Plugin-System** ist eine eng verwandte (aber andere) Form der
  Erweiterbarkeit als ein Embed — Plugins erweitern *von innen*, ein Widget
  bettet *von außen* ein.
- **pi-web-jmfederico** — `pi-web-plugins/` + `pluginPublicApi.test.ts`: erzwungen
  schmale öffentliche Plugin-API, verbietet direkte interne Imports. **Beste
  Disziplin für eine öffentliche API-Boundary** — die gleiche Regel sollte πui
  für sein Embed-Widget setzen (nur public API, keine internen Imports).

### 4. pi-feats — Application Routing (die Multi-User-Embed-Variante)

`pi-feats` hat **Application Routing** (external payloads → pi sessions →
integration-specific responses, identity-key mapping). Das ist die **serverseitige**
Embed-Variante: statt ein Widget in eine Seite zu setzen, nimmt es externe
Payloads an und routet sie in isolierte Sessions. **Direkt relevant für πui's
Widget-Idee** — es ist das Muster, externe Identitäten (Keys) auf isolierte
User-Workspaces zu mappen, ohne den echten Credentials auszuliefern.

### Fazit Embeddability

| Quelle | Beitrag | Embed-Bezug |
|---|---|---|
| pi-web-ui-official `__piWebUiHost` | Host-Bridge-Referenz | **Hoch** — die API-Fläche, die ein Embed braucht |
| Pi-SDK (in-process) | eigentlicher Embed-Punkt | **Hoch** — Agent-Logik embeddbar |
| pi-feats Application Routing | Identity-Key → Session | **Mittel** — serverseitige Embed-Variante |
| pi-web-jmfederico Plugin-API-Disziplin | schmale public API | **Mittel** — Boundary-Regel fürs Widget |
| valtterimelkko | Multi-Runtime | **Niedrig** — kein Embed-Bezug |

**Nächster Schritt (falls Embeddability priorisiert wird):** Die Widget-Idee in
§Eigene Ideen ist die richtige Richtung. Verfeinern mit: (1) `__piWebUiHost`-Stil
als Host-Bridge, (2) Pi-SDK in-process als Basis (schon vorhanden), (3)
pi-feats-Routing als Key→Workspace-Mapping, (4) jmfederico-Plugin-API-Disziplin
als public-API-Regel.

---

## Embedding von Web-Chat-UIs — Best Practices (Web-Recherche 2026-10-01)

Wie man ein Web-Chat-UI in eine fremde Seite einbettet. Drei komplementäre
Referenz-Implementierungen + die Security-Referenz. Zusammen ergeben sie das
vollständige Muster für πui's Widget-Idee.

### Die 4 Embed-Muster (Agentkit, universalapi)

| Muster | Integration | Isolation | Wann |
|---|---|---|---|
| **JS/script-tag-Widget** | `<script src=".../widget.js" data-key="...">` | Shadow DOM | Standard, kein Build-Schritt |
| **Custom Element** | `<ai-chat key="...">` | Shadow DOM | Programmgesteuert steuerbar |
| **iframe** | `<iframe src="...">` | Vollständig (eigener Kontext) | Maximale Isolation, aber kein CSS/DOM-Zugriff |
| **React/Native-Komponente** | npm-Import | — | Wenn der Host selbst React nutzt |

> **Kernwahl:** Custom Element (Shadow DOM) ist der Sweet Spot — volle
> Kapselung, trotzdem programmatisch steuerbar. iframe ist der Fallback für
> maximale Isolation (aber Canvas/Dialoge/Theme-Anpassung werden schwerer).

### Die 3-Schichten-Security-Kette (hodgen.ai „API Key Security Done Right")

Die Kernregel: **der echte Secret darf nie ins Browser-Bundle.** Drei Schichten:

1. **Public Embed Key** (pro Workspace/User, scoped, revocable) — „safe-ish"
   zu exponieren. Identifiziert nur den Ursprung, kann keinen Model-Spend
   auslösen. Wie ein Garderoben-Ticket: wertlos, beweist nur „welcher Mantel".
   - **Scoped:** an einen Workspace + bestimmte Aktionen gebunden.
   - **Revocable:** `active`-Flag, schneller Index. Churn/Leak → eine Zeile
     auf inaktiv → Widget stoppt sofort. Kein Rotieren für alle Kunden.
2. **Session-Endpoint (Token-Broker)** — tauscht den Embed-Key gegen ein
   **kurzlebiges, workspace-gebundenes Token** (signed JWT, `exp` in Minuten).
   Der echte Secret bleibt serverseitig. Das Widget **re-mintet** bei Ablauf.
   - **Rate-Limit den Session-Endpoint selbst** — sonst kann ein geleakter
     Key unbegrenzt Tokens prägen (Problem nur eine Ebene tiefer).
3. **Scoped, tenant-isolierte Endpoints** — jede Request trägt das Token;
   der Backend liest den Workspace aus dem **signed claim**, nie aus
   Query-Param/Header, den der Browser setzen kann.

> **Konsequenz für πui:** Embed-Key (pro Mandant) → `POST /api/widget/session`
> → kurzlebiges Token → SSE + prompt. Das Token ist an einen User-`agentDir`
> gebunden (ADR-0001); der Key mappt auf einen User + engeren Scope.

### Architektur-Muster (universalapi, dangntvn)

- **widget.js ist minimal** — liest `data-*`-Attribute, ruft `/embed/config`
  (validiert Token), erzeugt eine **geschlossene Shadow DOM**. Kein Secret, kein
  Business-Logic im öffentlichen File.
- **Config als Daten, nicht Code** (dangntvn) — ein neuer Kunde = ein
  Profile-Objekt (Theme-Tokens, Copy, Adapter, API-Base). Keine Logik-Datei
  wird angefasst. `core/` kennt nur eine `ChatTransport`-Interface, injiziert
  am Composition-Root; neuer Backend = ein Adapter-File.
- **Storage nach Zugriffsmuster** (dangntvn) — `conversationId` (klein, beim
  Mount synchron nötig) in `localStorage`; Message-History (unbegrenzt,
  häufig geschrieben) in `IndexedDB`, ohne Wrapper-Bibliothek.
- **Domain-Restriction** (universalapi) — Token funktioniert nur auf den
  beim Erstellen angegebenen Domains. Rate-Limit pro Token/IP.
- **Tool-Call-Details + Metrics-Bar** (universalapi) — nach jeder Antwort
  aufklappbare „N Tool Calls"-Sektion + Token/Cycle/Duration/Tools-Bar.
  Direkt übertragbar auf πui's Tool-Call-Karten + StatsFooter.

### Referenz-Implementierungen

| Referenz | Stack | Besonderheit |
|---|---|---|
| [dangntvn/ai-embeddable-chat-widget-starter](https://github.com/dangntvn/ai-embeddable-chat-widget-starter) | Vite lib-mode · TS · Preact (~3KB) · Vitest | **Shadow-DOM Custom Element**, 4-Layer one-way-Dependency, `ChatTransport`-Adapter-Seam, Playwright-E2E gegen echten Backend |
| [hodgen.ai — API Key Security Done Right](https://hodgen.ai/blog/embeddable-ai-widget-for-saas) | — | **Die Security-Referenz**: scoped/revocable Keys + ephemeral Tokens + Rate-Limit |
| [universalapi — Embed AI Chat Widget](https://blog.universalapi.co/posts/embed-ai-chat-widget-any-website.html) | — | **Architektur**: script-tag + Shadow DOM, `/embed/config`, `/embed/chat`, Domain-Restriction, Tool-Call-Details, Metrics-Bar |
| [Google CX Agent Studio Web widget](https://docs.cloud.google.com/gemini-enterprise-cx/cx-agent-studio/deploy/web-widget) | — | **Token-Broker** (Service-Account im eigenen GCP-Projekt generiert Zugriffstoken) |
| [nivq — Chat widget (embed)](https://nivq.ai/en/docs/chat-widget/) | Web Component | Framework-agnostisch, kleiner Token-Broker, Secret erreicht nie den Browser |
| [rakib-sikder/ai-chat-widget](https://github.com/rakib-sikder/ai-chat-widget) | — | White-labeled, single-tag, kein Framework nötig |
| [agentkit.ai — Embed Chatbot](https://agentkit.ai/blog/embed-chatbot-on-website) | — | Die 4 Embed-Wege (JS-Widget, React, iframe, WordPress) |

### Was πui übernehmen sollte

1. **Custom Element `<ai-chat>` + Shadow DOM** als Primärweg (flexibel,
   kapselbar); iframe als Fallback.
2. **3-Schichten-Security:** Embed-Key (pro Mandant, scoped, revocable) →
   rate-limited Session-Endpoint → kurzlebiges workspace-gebundenes Token.
3. **Minimales `embed.js`** — nur Key lesen, Token holen, UI mounten.
4. **Config als Daten** — Theme/Copy/Adapter pro Kunde als Profile-Objekt.
5. **`ChatTransport`-Interface** als Adapter-Seam — `core/` kennt kein Backend.
6. **Domain-Restriction + Rate-Limit** auf den Widget-Endpoints.
7. **Tool-Call-Details + Metrics-Bar** in das Widget übernehmen.

---

## Notes on architecture patterns

- **Adapter pattern** (universal-agent-ui) — single `BaseAdapter` interface; new providers via one file; dynamic UI theming from adapter metadata.
- **Plugin/composability model** (deepseek-harness Cordis) — everything is a plugin; host/client contract boundary; codegen-from-source-of-truth + verify discipline.
- **tmux-based isolation** (agent-of-empires) — agents run in persistent tmux sessions; survive disconnects; TUI/web reattach.
- **Unified Harness Protocol** (HarnessRouter) — open standard for unifying agent harness APIs; sessions, streaming, files, cancellation, failure handling.
- **Thin SDK adapter** (pi-gui `pi-sdk-driver`) — wrap pi SDK closely; don't reimplement runtime behavior.
- **Pure, heavily-unit-tested lib modules** (pi-web) — almost every lib file has a matching `*.test.mjs` sibling.
- **Module-level handler registry** (pi-web `useKeyboardShortcuts.ts`) — tiny global registry avoids prop-drilling.
- **Shadow tools for side-effect-free sub-runs** (pi-web `session-title.ts`) — stub `execute` to throw when only text generation is needed.
- **JSONL/disk as source of truth** (pi-gui) — read pi's JSONL session files as authoritative for closed sessions.

---

## Previously prioritized shortlist (for reference)

*This section captures earlier prioritization; treat as historical context, not current guidance.*

High value / low effort (do first):
1. **Files-written chips** per turn (S)
2. **Global Esc abort** + consistent keyboard shortcuts (S)
3. **Image attach limits** (S)
4. **Per-session draft persistence** (S)
5. **Browser notifications** on turn finish (S)
6. **Chat minimap** navigation for long sessions (S–M)
7. **Steer / follow-up queueing** (pi-web-ui-official, jmfederico) — S–M, top pick from the 2026-10-01 delta-review

Medium value / medium effort (next):
7. **Lazy render** of long histories (M)
8. **Compaction summary** structured display (M)
9. **Group sessions by project** + rename/archive/export (M)
10. **File preview pane** (source/preview/diff) (M)
11. **Live git status panel** (M)

Defer / out of scope:
- Worktrees per session (L, sandbox already isolates)
- Web-based credential management (conflicts with default-deny entitlement)
- Full i18n (pi-web has en/zh/ja/ru; only if multi-language is a goal)
- Multi-runtime adapter (valtterimelkko) — only if πui drives non-pi agents
- Remote machines / sessiond daemon (jmfederico) — strategic, matches πui's multi-user direction
- In-app package manager + Pi Console WebUI (pi-feats) — strategic admin/ops surface, L

---

## Eigene Feature-Ideen

### Kopfzahl-Schätzung in die Webapp einbauen (geplant)

**Idee:** Personalaufwand → Mitarbeiterzahl nicht nur als Agent-Skill-Regel,
sondern als **Webapp-Feature** — der UGB-Anhang paart die Größen offiziell
(VZÄ-Angabe explizit „um eine Verbindung mit dem Personalaufwand je
Arbeitnehmer herstellen zu können"), Statistik Austria liefert die
Divisoren branchenscharf und gratis.

Research-Befunde + AKOE-2024-Gesamttabelle:
[`docs/research-personalaufwand-kopfzahl.md`](./docs/research-personalaufwand-kopfzahl.md)

Sketch (Reihenfolge ist der Kern):
1. **Anhang zuerst** — Agent liest Mitarbeiterzahl aus hvd-Bericht → Fakt mit Zitat
2. **Fallback als UI-Berechnung** — fehlt sie, rechnet die Webapp client-seitig:
   `Personalaufwand ÷ AKOE-Divisor der eigenen ÖNACE (je VZÄ)` → als
   „≈ N (geschätzt, Bandbreite ±25 %)" in Canvas-Profilkarte/Bericht;
   Divisor-Tabelle als pure lib + Daten-Modul (Update jährlich, AKE-Zyklus)
3. Agent nennt die Schätzung nie als Fakt — Label-Pflicht „geschätzt"

Warum Webapp statt nur Skill: deterministisch, testbar (pure function +
AKOE-Tabelle als Unit-Tests), überall konsistent (Canvas, Report, Chat).

---

### aiui als embeddable Komponente für fremde Web-Apps (geplant)

**Idee:** aiui nicht nur als eigene App, sondern als **einbaubares Widget** in
beliebige Web-Anwendungen — ein `<ai-chat key="…">`-Custom-Element (oder
iframe/script-tag), das einen vollwertigen πui-Chat in die Host-Seite bringt.
Der Host übergibt einen **Key** (scoped, revocable), aiui liefert Modal/Launcher,
Streaming, Tool-Calls, Session-Persistenz — alles gekapselt, ohne dass der Host
πui-Code oder SDK-Kenntnis braucht.

**SOTA-Quickcheck (2026-09, web-search):**

- **Drei Embed-Muster** dominieren: (1) **script-tag** (eine Zeile rendert das
  Widget in die Seite), (2) **iframe** (isoliert & sicher, aber kein
  CSS-Overriding / DOM-Zugriff), (3) **Custom Element / Web Component**
  (`<ai-chat …>`), isoliert via **shadow DOM** — der moderne Sweet Spot: eine
  Zeile im Host, volle Kapselung, trotzdem programmatisch steuerbar.
- **Key-Sicherheit ist das Kernproblem** (hodgen.ai „API Key Security Done
  Right"): nie den echten Secret ins Browser-Bundle. Best Practice = **scoped,
  revocable Keys** + **ephemeral Session-Tokens** (kurzlebig, pro Session vom
  Token-Broker geholt). Genau das Muster, das Google CX Agent Studio mit
  seinem „token broker" und Agentkit mit seinem Embed-SDK fahren.
- **Auth-Modell**: entweder **anonymer Visitor-Chat** (keine Login-Pflicht,
  Session nur per Key) oder **Token-Broker**, der frische Tokens ausstellt.
  Bei aiui heißt das: ein Key identifiziert einen **externen Mandanten**, der
  auf einen bestehenden User-`agentDir`/Workspace gemappt wird.
- **Config über Attribute/Props**: `key`, Modell, Theme, Position
  (floating vs. inline), Launcher-Icon, „öffne als Modal"-Verhalten.
- **Referenz-Produkte**: Free.ai Widget, Orckai, TeamWeb AI, OpenAssistantGPT
  (iframe), Agentkit Embed-SDK, `@agent-native/embedding`, ai-chat-toolkit.

**Sketch (Reihenfolge ist der Kern):**

1. **Embed-Form wählen** — Custom Element `<ai-chat>` mit shadow DOM als
   Primärweg; iframe als Fallback für maximale Isolation. Ein `src/embed/`
   Bundle, das als eigenes Skript gebaut wird (`vite` lib mode), getrennt von
   der Haupt-App.
2. **Key-Modell** — Server-seitig `keys` in der Auth-Config (`~/.aiui-auth.json`
   erweitert): `{ "widgetKeys": { "<key>": { "user": "alice", "scope": "…", "revoked": false } } }`.
   Ein Key mappt auf einen User + optional einen eingeschränkten Scope
   (bestimmter Agent, bestimmtes Workspace-Fenster). **Key löst Session-Key aus,**
   nicht den echten Credentials.
3. **Ephemeral Session-Token** — `POST /api/widget/session { key }` → prüft
   Key (nicht revoked, Quota), erzeugt ein **kurzlebiges Token** (z. B. 1h,
   signed) und gibt es zurück. Das Widget nutzt nur das Token für SSE + prompt;
   der Key selbst bleibt beim Host, nie im Bundle. Das ist die
   „API-Key-Security-Done-Right"-Linie.
4. **Modal/Launcher** — Host legt einen Launcher-Button oder ruft
   `el.open()`/`el.close()` auf; das Modal rendert den bestehenden Chat
   (StreamEntry, Tool-Calls, Attachments) in isoliertem shadow DOM. Theme via
   CSS-Custom-Properties, damit es zur Host-Seite passt.
5. **Session-Persistenz pro Host-Key** — Session an `widget:<key>` binden, damit
   der Visitor seine Historie über Reloads behält, ohne Login.

**Offene Fragen:**

- **Ein Key = ein User?** Ein externer Mandant bekommt einen eigenen
  `agentDir`/Workspace (ADR-0001) oder teilt er die Entitlement eines
  bestehenden Users? (Vermutlich eigener, damit Quota + Sandbox sauber
  getrennt bleiben.)
- **Scope-Granularität** — Key nur für einen bestimmten Agent (z. B. nur
  Deutsch-Assistent) oder volle Session?
- **Sandbox-Boundary** — was darf ein Widget-Visitor im Workspace? Gleiche
  Sandbox wie der User, oder ein engeres, read-only Fenster?
- **Quota** — zählt ein Widget-Key gegen den User-Tages-Cap oder einen eigenen
  `limits.widget`-Eintrag?
- **iframe vs. Custom Element** — iframe ist einfacher + sicherer, aber
  Canvas/Datei-Dialoge und Theme-Anpassung werden schwerer. Custom Element
  ist flexibler, braucht aber schärfere CSS-Isolation.

**Referenzen:**

- hodgen.ai „Embeddable AI Widget: API Key Security Done Right" (scoped keys +
  ephemeral session tokens)
- Google CX Agent Studio „Web widget" (token broker)
- Agentkit „Widget Embed SDK" (script-embed vs. iframe-embed)
- OpenAssistantGPT „Embed" (iframe), Free.ai / Orckai / TeamWeb AI (script-tag)
- `@agent-native/embedding`, ai-chat-toolkit (Open-Source-Beispiele)

**Warum Widget statt nur eigener App:** aiui hat bereits alles Nötige —
per-User Workspaces, Event bus für Live-Sync, Session-Lifecycle, Sandbox,
Quota. Ein Embed-Widget macht daraus ein **Produkt für Dritte** statt nur ein
internes Tool; der Key-Mechanismus ist die einzige echte neue Server-Fläche,
und die ist klein + testbar (pure key/scope-Validierung, Token-Signierung).
