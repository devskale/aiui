# πui — Web UI for the π Coding Agent

πui is a React frontend + Express backend that wraps the **pi SDK** (`@earendil-works/pi-coding-agent`) into a chat-style web interface with SSE streaming.

## Commands

```bash
pnpm dev            # Start both server (port 3001) + client (port 5173, proxies /api → 3001)
pnpm dev:server     # Server only (auto-restart via --watch)
pnpm dev:client     # Vite dev server only
pnpm build          # Production build → dist/
```

No linter or test runner is configured yet.

### E2E Smoke Tests with Rodney

Use **rodney** (headless Chrome CLI) for e2e checks. Rodney is a CLI tool — call via bash, not MCP.

```bash
uv tool install rodney                 # Install (if not already)
rodney start                            # Launch Chrome
rodney open http://localhost:3001        # Navigate to dev server
rodney waitstable                       # Wait for SPA to render
rodney screenshot test.png              # Capture state
rodney exists ".entry-user"             # Assert element exists
rodney stop                             # ALWAYS stop when done
```

Typical workflow:
1. Start dev server: `pnpm dev`
2. Run rodney checks (start → open → waitstable → assert/screenshot → stop)
3. **Always `rodney stop`** — never leave Chrome running

## Project Structure

```
server/
  index.js          # Express API: SSE, /api/prompt, /api/abort, /api/models, /api/upload
  pi-session.js     # pi SDK session lifecycle: create, prompt, abort, model switching
src/
  App.jsx           # Root: composes sidebar, content area, input bar, model picker
  main.jsx          # React entry point
  index.css         # All styles (single file, no CSS modules)
  components/
    StreamEntry.jsx # Renders user/assistant/error entries, tool calls, thinking blocks
    Sidebar.jsx     # Collapsible sidebar: new chat, skills/prompts/extensions, model info
    InputBar.jsx    # Bottom textarea with file attachment (drag/paste/picker)
    ModelPicker.jsx # Full-screen model selection overlay
    CommandPanel.jsx# Skills/prompts/extensions panel (currently unused in App)
    EmptyState.jsx  # Shown when no messages
  hooks/
    useAgentEvents.js  # SSE event reducer — core state machine for the chat stream
    useAttachments.js  # File upload state (images as dataURL, others via /api/upload)
uploads/            # Uploaded files (gitignored)
session/            # pi agent session data (gitignored)
vite.config.js      # Vite config with /api proxy to Express
```

## pi SDK Reference

The `@earendil-works/pi-coding-agent` package is the source of truth for SDK APIs. The full pi SDK repo is cloned at `pi/` for easy reference — **this directory is gitignored, never commit it.**

Key references (all under `pi/`):
- `README.md` — main docs
- `docs/` — extensions, themes, skills, TUI, SDK, models, etc.
- `examples/` — extensions, custom tools, SDK integrations
- `packages/` — SDK source code (agent, core, etc.)

When working on piui, consult `pi/docs/` and `pi/examples/` for SDK patterns before implementing.

## Tech Stack

- **Backend:** Express 5, multer (file uploads), SSE (`EventSource` on client)
- **Frontend:** React 19, Vite 6, react-markdown + remark-gfm
- **Agent SDK:** `@earendil-works/pi-coding-agent` — `createAgentSession`, `ModelRegistry`, `AuthStorage`, `SessionManager`
- **Runtime:** Node ESM (`"type": "module"`)

## Architecture

### Data Flow

1. User types in `InputBar` → `POST /api/prompt` with `{ text, attachments }`
2. Server calls `pi-session.js::prompt()` which sends text + images to the pi SDK
3. SDK emits events → server subscribes and broadcasts them via SSE (`broadcast(event.type, event)`)
4. Client `useAgentEvents` hook receives SSE events through a `useReducer` state machine
5. `StreamEntry` renders the current state: thinking blocks, tool calls, markdown text

### SDK Event Flow (useAgentEvents reducer)

```
agent_start → turn_start → message_start → [thinking_start/delta/end]*
  → [tool_call_start/end]* → message_update (text_delta) → message_end
  → [tool_execution_start/update/end]* → turn_end → agent_end
```

Tool calls carry across `message_start` boundaries within a turn (see `prevToolCalls` in reducer).

## Code Style

- Functional React components with hooks — no classes
- `useReducer` for complex state (chat stream), `useState` for simple UI state
- Single `index.css` for all styling — no CSS modules or styled-components
- JSDoc-style section headers with `═══` separators
- Inline styles used sparingly in components; prefer CSS classes
- Component files export named functions, not default exports
- Hooks return destructured objects for consumers

## Boundaries

- ✅ **Always:** Run `pnpm dev` to verify changes before committing
- ✅ **Always:** Keep `useAgentEvents` reducer logic in sync with SDK event types
- ⚠️ **Ask first:** Adding new npm dependencies, changing the SSE protocol
- 🚫 **Never:** Modify `node_modules/`, commit `uploads/` or `session/`, hardcode API keys
- 🚫 **Never:** Add a CSS framework (Tailwind, etc.) without discussion — keep single-file CSS
