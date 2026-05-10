# AIUI — Agent Development Guide

## Project Overview
Slim Open WebUI clone. **FastAPI + SQLite backend**, **Vite + React SPA frontend**. All LLM calls proxied through backend.

### Tech Stack
- **Backend:** FastAPI + SQLite (Python 3.13, uvicorn, httpx)
- **Frontend:** React 19 + Vite (pnpm)
- **Markdown:** react-markdown + remark-gfm + react-syntax-highlighter (Prism)
- **Icons:** lucide-react
- **HTTP:** native fetch (browser) → `/api/*` → Vite proxy → backend `:8099`

### Defaults (pre-seeded)
| Field | Value |
|---|---|
| Base URL | `https://amd1.mooo.com:8123/v1` |
| API Key | `test23@test34` |
| Model | `tu@qwen-3.6-35b` |

---

## Architecture

### File Layout (actual)
```
aiui.sh                  # Dev control: start|stop|restart|dev|clean|status|logs
server/
  app.py                 # FastAPI: chat proxy, tool loop, accounts, chats (SQLite)
  seed.py                # DB seed + migration
src/
  App.jsx                # Root layout, context providers
  components/
    Sidebar.jsx          # Chat list, new chat, account switcher
    MainArea.jsx         # Chat window, message list, input orchestration
    Message.jsx          # Single message (user/assistant/tool pills)
    ChatInput.jsx        # Pill-shaped input: textarea + toolbar (attach, web toggle, send)
    ModelPicker.jsx      # Model dropdown
    SettingsModal.jsx    # Account CRUD, base URL, model config
  hooks/
    useStreamChat.js     # Streaming + tool-call display + abort
  lib/
    api.js               # Frontend API helpers
    icons.jsx            # lucide-react icon exports
    utils.jsx            # renderMd (react-markdown), file helpers
  index.css              # All styles, dark theme
tests/
  conftest.py            # pytest fixtures (httpx AsyncClient)
  test_tools.py          # Tool loop + endpoint tests (30 tests)
```

### Backend (server/app.py)
- **Port 8099**, proxies LLM calls, handles tool execution server-side
- **Tool loop:** `run_with_tools()` async generator — global budget 20 tools / 12 rounds
- **Tools:** `web_search` (SearXNG), `fetch_url` (httpx)
- **SSE events:** `tool_status` with `tool_start`/`tool_result` payloads
- **DB:** SQLite at `data/aiui.db` (accounts, chats, messages)

### Frontend
- Vite dev on `:8082`, proxies `/api` → `:8099`
- Streaming via SSE parser in `useStreamChat.js`
- Web search: **persistent toggle** (globe icon stays on until clicked off)
- Tool pills: per-tool call, stacked with overlap, status indicators

---

## Dev Commands
```bash
./aiui.sh start          # Backend (--reload) + frontend (HMR)
./aiui.sh stop           # Kill both
./aiui.sh restart        # Stop + start
./aiui.sh dev            # Foreground dev mode
./aiui.sh logs           # Tail both logs
./aiui.sh clean          # Stop + delete data/logs
./aiui.sh status         # Show running processes
```

---

## Coding Conventions
- Functional components + hooks only
- Named exports (default export only for App)
- Single global `index.css` for all styles
- No prop-drilling past 2 levels — use Context
- Keep components under 200 lines
- PascalCase components, camelCase hooks/utils

---

## Key Details

### SearXNG
- Instance: `https://neusiedl.duckdns.org:8002` (self-signed cert → `verify=False`)
- Auth: `searxng:searxng23`
- Config stored as `url@user@pass` format, split on all `@`

### Tool Pill Persistence
- Tools live on message object as `msg.tools` array
- Not stored in DB — preserved in React state
- `useEffect([chat?.id])` skips reset if current messages have tools

### Common Pitfalls
- `msg.get("tool_calls")` and `msg.get("content")` can return `None`, not `[]`/`""`
- `AbortController` must be created before fetch, stored in ref
- Loop variables must not shadow outer scope (e.g. `url`)

---

## 📋 TODO — Next Session

### Collection & Document Management (Big Feature)
Upload, index, and query private documents in-chat.

- [ ] Upload docs (PDF, DOCX, PPTX, images) → store in `data/uploads/`
- [ ] **Image-heavy docs** — OCR text, keep page images for context
- [ ] Parsing: **LlamaParse** primary, pymupdf/pdfplumber fallback, surya-ocr for images
- [ ] Store parsed text + vector indexes in `data/parsed/` + `data/indexes/`
- [ ] Embed chunks via LLM `/embeddings`, store in SQLite + sqlite-vss
- [ ] RAG: embed query → top-k chunks → inject as context
- [ ] UI: collections in sidebar, upload dropzone, chat toggle for collection context
