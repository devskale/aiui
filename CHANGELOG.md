# Changelog

All notable changes to πui are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

The latest version is shown in the UI under `#/releases`.

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
