# Ideas from reference repos

Analysis of the three reference repos cloned into `refs/`, mapped against
what aiui (`piui`) already has. Each idea is tagged with an estimated effort
(S/M/L) and where it slots into aiui's existing architecture.

- `refs/chatbot-template` — shadcn-ui/chatbot-template (Next.js + AI SDK UI shell)
- `refs/pi-web` — agegr/pi-web (Next.js browser UI for pi; closest analog to aiui)
- `refs/pi-gui` — minghinmatthewlam/pi-gui (Electron Codex-style desktop app for pi)

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

## Prioritized shortlist for aiui

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
