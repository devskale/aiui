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
