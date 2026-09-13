# Changelog

All notable changes to πui are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

The latest version is shown in the UI under `#/releases`.

## [0.3.2] — 2026-09-13

### Added

- **Model filter (`include` / `notInclude`)** — restrict the model catalog
  via `~/.aiui-auth.json`: `models: { include: [...], notInclude: [...] }`
  deployment-wide, `userModels: { "<user>": {...} }` replaces it per User.
  Patterns anchor at the start of the full `provider@id` — no `*` means
  prefix (`unii@tu@`, `unii@tu@qwen-3.6-35b-vllm`), `*` means glob anywhere
  (`unii@tu@qwen*`, `kilo@*free*`, `opencode@*free`); `notInclude` wins over
  `include`. Enforced in `/api/models` (the picker), `POST /api/model`, and
  agent model pins. Pure logic in `server/model-filter.js`.

### Changed

- **New sessions start with the last-used model** — the picker's choice is
  remembered per User (sidecar `.aiui-model.json` in the agentDir) and
  applied to fresh sessions (new chat, next login). Agent model pins
  (ADR-0004) still win over the remembered choice; a model that has since
  fallen out of the catalog/filter is skipped.
- **read_pdf caches OCR as markdown (pdf2md-style)** — LlamaParse results are
  written next to the PDF as `<name>.pdf.md` and served from there on repeat
  reads while fresh: zero wait, zero credits, full text beyond the 50k-char
  chat cap, browsable in the file explorer and @-mentionable.
- **Uploaded files are visible + reusable** — `uploads/` is no longer hidden
  from the file explorer or the @-mention autocomplete: chat uploads stay
  browsable, mentionable, and re-readable (e.g. `read_pdf` in a later chat).

## [0.3.1] — 2026-09-13

### Fixed

- **Scoped the JSON body limit** — only `/api/prompt` accepts large bodies
  (image dataUrls); every other route, including the public `/api/login`,
  keeps Express' small default. Removes an unnecessary pre-auth memory/DoS
  surface.
- **@-mentioned images are size-capped** (10 MB): larger files keep their
  `@path` token instead of being base64-embedded into the prompt.

### Changed

- **BYOK runtimes re-read on change** — the per-user runtime cache now keys on
  the `auth.json` mtime, so edited keys take effect without a logout/login.
- **Idle context eviction** — user contexts idle for longer than
  `AIUI_IDLE_EVICT_HOURS` (default 24) and not mid-stream are dropped from
  memory on the next request; stored sessions are untouched and resume lazily.
- **File explorer (G5) fixes** from review — async upload reads (a 50MB image
  no longer freezes the event loop for everyone), the base64 `dataUrl` is now
  opt-in (`?dataUrl=1`, only the input bar needs it), image-ness comes from
  the server's mime table via `/api/tree` (no client ext-list drift — svg/bmp
  no longer masquerade as previewable images), upload failures are counted
  instead of masking as success, a failed folder load shows a retry instead
  of "No files", the viewer gets a download affordance and an image-error
  state.

## [0.3.0] — 2026-08-16

### Added
- **Agents** (ADR-0004) — repo-shipped specialist presets: an Agent picker
  in the topbar, agent cards on the welcome screen, and two shipped Agents:
  **English Teacher** (tuned for a 12-year-old Austrian learner — playful
  A2→B1 practice, one gentle correction per message, voice input, spoken
  answers, and homework photos / PDF worksheets the child can upload) and **Deutsch-Assistent** (German documents & images, PDF
  reading, multi-page image assemblies). Switching Agents starts a new
  chat; stored sessions remember their Agent.
- **Voice input (STT)** — Agents with voice support get a mic button:
  speech is transcribed via the DGX gateway (Nemotron, auto EN/DE) through
  a server-side proxy (`POST /api/stt`) and lands in the composer. Enabled
  for the English Teacher; self-hides when the gateway is unreachable.
- **Spoken answers (TTS)** — Agents flagged `tts: true` get a speaker
  toggle in the topbar: each finished answer is read aloud via the
  browser's speech synthesis (no backend, good English voices on Apple
  devices). Enabled for the English Teacher.
- **PDF reading with OCR — baseline for every agent** — a `read_pdf`
  extension tool: per-page text extraction (pdf.js), automatic LlamaParse
  cloud-OCR for scans without a text layer (key via credgoo `llamacloud`),
  and `ocr: true` to force it. Workspace-confined. Shipped as a baseline
  extension (like generate-image) so the English Teacher can read PDF
  worksheets too.
- **Multi-image assemblies** — a set of scanned pages (e.g. a book section)
  is interpreted as ONE ordered document: the Deutsch-Assistent downscales
  images client-side before upload (multi-page sets now fit reliably) and
  synthesizes across page boundaries with per-page citations.
- **Image generation as an extension** — the `generate-image` skill is now
  a baseline `generate_image` tool for every user (same TU Aqueduct
  z-image-turbo backend): no CLI install, images land in the user's
  workspace and render in chat behind the app's base path. Seeded for new
  users and backfilled for existing ones at deploy time.

## [0.2.1] — 2026-07-15

### Added
- **Slash command menu** in the composer — type `/` to open a palette of
  commands (skills, prompts, extensions) plus host actions (`/compact`,
  `/new`, `/model`), with descriptions and live filtering.
- **Inline diff viewer** — write/edit tool calls render a unified diff inline
  (added/removed lines with line numbers) when the tool result contains one.

## [0.2.0] — 2026-07-15

### Added
- **@-mention file autocomplete** in the composer — type `@` to insert a
  workspace file; the server exposes a new `GET /api/files` endpoint that lists
  files git-aware (ignored dirs such as `node_modules` are excluded).
- **Richer tool-call rendering** — each tool call now shows a per-tool glyph
  (edit / terminal / file / spark), the affected file path, `+added/-removed`
  diff stats for write/edit tools, a copy-output button, and running/error
  states.
- **Code-block header** — fenced code blocks show a language label and a copy
  button.
- **Session search** — filter the Recent list in the sidebar.

### Fixed
- **Windows launch** — dropped the `PORT=3001` bash-ism from `dev:server` so the
  Express backend starts under `cmd.exe` (the server already defaults to port
  3001).

## [0.1.5] — 2026-06-24

### Added
- **Image generation via the `generate-image` skill** — the agent now generates
  images on natural requests ("draw me…", "generate an image of…") by calling
  a TU Aqueduct `z-image-turbo` CLI. Generated images are saved to `uploads/`
  and rendered inline as markdown. Works in any chat model (text-only safe —
  images are never sent back to the model).
- **Release notes page** at `#/releases` (this changelog), linked from the
  sidebar version footer.
- `start.sh` helper for local dev/prod/build.

### Changed
- **Model picker filters to `tu@*` models** — only TU Aqueduct models are
  selectable, using full `provider@id` identifiers so selection is unambiguous.
- **Smart autoscroll** — the view only sticks to the bottom when you're near it.
  Scrolling up to read no longer fights the streaming output.
- **Markdown links open in a new tab** (`target="_blank" rel="noopener"`).
- **Markdown images** are prefixed with `BASE_URL` so they render correctly
  behind the `/aiui/` reverse proxy in production.

### Fixed
- **Uploads 404 behind nginx** — mounted the static route at both
  `${VITE_BASE}/uploads` and bare `/uploads`, since nginx `proxy_pass` with a
  trailing slash strips the `/aiui/` prefix before it reaches the server.
- **Session model fallback to openai-codex** — was caused by an expired
  `tu-aqueduct` key and a wrong `defaultProvider` (`amd` vs `amd-local`) in
  project settings.

## [0.1.4] — 2026-06-10

### Added
- File upload (drag/paste/picker) with image preview.
- Model picker overlay with search.
- Collapsible sidebar with skills/prompts/extensions.
- SSE streaming with thinking blocks, tool-call rendering, and markdown output.

### Changed
- Single-file `index.css` styling, emerald accent on dark background.
