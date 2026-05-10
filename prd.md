# AIUI — Product Requirements Document

> Slim chat UI. Talk to any LLM. Upload media. Reference files in conversation with `#image`. Search collections with embeddings.

---

## 1. Overview

**AIUI** is a self-hosted, single-user chat web UI for any OpenAI-compatible LLM API. It runs locally as a Python backend + React SPA. No Docker, no cloud, no accounts. Upload images, PDFs, text files. Reference them in chat with `#filename`. The LLM sees your files and reasons about them.

### Guiding Principles

- **Slim** — one Python file backend, minimal React frontend. No framework bloat.
- **Local-first** — SQLite + flat files on disk. No cloud DB, no external storage.
- **API-flexible** — point at any OpenAI-compatible endpoint (Ollama, vLLM, LiteLLM, etc.)
- **Media-native** — images, PDFs, documents are first-class citizens, not bolted on.
- **Progressive** — start simple. Add embedding search and collection reasoning later.

### Stack

| Layer | Tool | Notes |
|---|---|---|
| Frontend | Vite + React 19 | SPA, port 8082, proxies `/api` → backend |
| Backend | Python 3.11+ / uv / FastAPI | Single `server.py`, port 8099 |
| Database | SQLite (`aiui.db`) | WAL mode, foreign keys, in `data/` |
| File Storage | Flat files (`data/files/`) | UUID filenames, subdirs per folder |
| Package Mgr | pnpm (frontend) + uv (backend) | No venv, no global installs |

### Default Account (pre-seeded)

| Field | Value |
|---|---|
| Base URL | `https://amd1.mooo.com:8123/v1` |
| API Key | `test23@test34` |
| Models | `tu@qwen-3.6-35b`, `tu@qwen-3.5-397b` |
| Capabilities | Text + Image (vision) |

---

## 2. Current State — Review

### What Works

- ✅ Streaming chat with SSE (via backend proxy)
- ✅ Tool calling loop (web_search, read_file, fetch_url) — backend intercepts `tool_calls`, executes, loops
- ✅ Multi-account support with model selector
- ✅ File upload (images, PDFs, TXT, MD) → stored on disk, served by backend
- ✅ Folder system — create, rename, delete, move files between folders
- ✅ `#filename` autocomplete in chat input — resolves to base64 image or extracted text
- ✅ Image attachments via drag-drop, paste, file picker → sent as vision `image_url` blocks
- ✅ PDF text extraction (pdfplumber) → injected as text context
- ✅ Sidebar with chat history grouped by date (Today/Yesterday/Earlier)
- ✅ Settings modal with E2E test
- ✅ Dark theme, responsive layout
- ✅ Floating stop button during streaming
- ✅ Vite proxy handles CORS transparently

### Problems to Fix

| Issue | Severity | Description |
|---|---|---|
| **Monolithic frontend** | 🔴 High | `App.jsx` is 1594 lines — all components + CSS in one file. Unmaintainable. Must split. |
| **Inline CSS via template literal** | 🔴 High | 500+ lines of CSS injected via `document.createElement('style')`. No HMR, no scoping. Must extract to `.css` files. |
| **Hand-rolled markdown** | 🟡 Med | Regex-based `renderMd()` — breaks on nested code, tables, lists. Need `react-markdown` + `remark-gfm`. |
| **No syntax highlighting** | 🟡 Med | Code blocks rendered as plain `<pre><code>`. No language badges. Need `react-syntax-highlighter`. |
| **No chat rename** | 🟡 Med | Title is frozen at first message. No edit UI. |
| **No light theme** | 🟡 Med | Mentioned in old PRD but never implemented. |
| **No message actions** | 🟡 Med | No copy, regenerate, edit. |
| **Tool loop is non-streaming** | 🟡 Med | Backend does full non-streamed request per tool round, then simulates streaming back to frontend. Adds latency. |
| **No PDF visual preview** | 🟢 Low | PDFs shown as text dump. No page rendering. |
| **Voice button is dead** | 🟢 Low | Mic icon present but no Web Speech API wired up. |
| **DB schema drift** | 🟢 Low | `model` column migrated to `models` JSON via ALTER TABLE. `last_used_at` in PRD but not in actual schema. |

---

## 3. Features — V1 (Build Now)

### 3.1 Chat Core

**Streaming responses** — SSE via `fetch()` + `ReadableStream`. Frontend parses `data: {...}` chunks, appends delta content to assistant message in real time.

**Message types:**
- `user` — text, possibly multimodal (text + images)
- `assistant` — streamed markdown text, optionally with tool call annotations
- `system` — configurable system prompt per chat (future)
- `error` — API errors displayed as red bubbles

**Chat management:**
- New chat (sidebar button or keyboard shortcut)
- Delete chat (X button on hover)
- Rename chat (double-click title, or auto-title from first message)
- Chat list sorted by `updated_at`, grouped by Today / Yesterday / Earlier

**Input bar:**
- Auto-growing textarea (max ~200px)
- Send on Enter (Shift+Enter for newline)
- Attach button (file picker)
- Stop button during streaming
- Drag-drop and paste support for images

### 3.2 Multi-Account / Provider System

**Account = one LLM provider endpoint.**

Each account stores:
- `name` — display name ("Work Ollama", "GPT-4 Proxy")
- `base_url` — OpenAI-compatible base URL
- `api_key` — bearer token
- `models` — JSON array of model IDs (manually entered or fetched from `/models`)

**Account switching:**
- Active account stored in `localStorage`
- Switching account reloads chat list filtered by `account_id`
- Model selector dropdown in top bar shows models for active account

**Settings modal:**
- Edit name, base URL, API key, models (one per line textarea)
- "Fetch Models" button → calls `GET /api/models` to auto-populate
- E2E test button (DB + files + LLM connectivity)

### 3.3 File Upload & Media Library

**Supported file types:**

| Type | Extensions | Processing |
|---|---|---|
| Image | `.png`, `.jpg`, `.jpeg`, `.gif`, `.webp` | Stored as-is, served by backend, sent to LLM as base64 `image_url` |
| PDF | `.pdf` | Stored, text extracted via pdfplumber, injected as text context |
| Text | `.txt`, `.md` | Stored, raw text injected into messages |

**Size limits:** 20MB per file, 500MB total storage (configurable).

**Upload methods:**
- File picker (via attach button)
- Drag-drop onto input area
- Paste from clipboard (images)
- Upload into folder from sidebar
- Batch upload via `/api/upload/batch`

**File lifecycle:**
1. Upload → `POST /api/upload` → stored in `data/files/{folder_id}/` with UUID name
2. Recorded in `files` table (id, original_name, mime_type, size_bytes, path, folder_id)
3. Served back via `GET /api/files/{id}`
4. Referenced in chat via `#filename` autocomplete
5. Deleted via `DELETE /api/files/{id}` (removes from DB + disk)

### 3.4 Folders / Collections

Folders organize uploaded files. Like a lightweight workspace.

**Folder operations:**
- Create (name + emoji icon + color)
- Rename (double-click name)
- Delete (files become unsorted — `folder_id = NULL`)
- Upload files into folder
- Move files between folders (dropdown on each file)

**Sidebar folder view:**
- Expandable tree under "Files" nav item
- Each folder shows file count badge
- Expanded view shows files with icon, name, actions (add to chat, move, delete)
- "Unsorted" section for files with no folder
- Inline upload bar per folder

**Default folders** (seeded on first run):
- 📚 Library, 📄 Documents, 🖼️ Images

### 3.5 `#` File Reference in Chat

This is the core media interaction mechanism.

**How it works:**

1. User types `#` in chat input → autocomplete dropdown appears
2. Dropdown searches all files: `GET /api/library/search?q=<query>`
3. Shows file icon (🖼️/📄/📝), filename, folder name
4. Keyboard navigation (↑↓ Enter Esc), fuzzy match on filename
5. Selecting inserts `#filename` into input text
6. On send, frontend calls `POST /api/resolve-references` with message text
7. Backend resolves each `#ref`:

| File type | Resolution |
|---|---|
| Image | Read from disk → base64 → `{ type: "image_url", image_url: { url: "data:image/png;base64,..." } }` |
| PDF | Read from disk → pdfplumber extract text → `{ type: "text", text: "[📄 report.pdf]\n<extracted text>" }` |
| TXT/MD | Read from disk → raw text → `{ type: "text", text: "[📝 notes.md]\n<content>" }` |

8. Built multimodal content array sent to LLM as user message
9. LLM responds with understanding of the referenced files
10. Unresolved refs → warning inline: `[⚠️ #missing.pdf] Not found in library`

**Multiple references:** `Compare #chart-a.png and #chart-b.png` → both images sent as vision blocks.

**Attachment bar preview:** Referenced files show as thumbnails in the attachment bar before sending. Images show actual preview, PDFs show icon + name.

### 3.6 Tool Calling

Backend registers tools with the LLM. When the model emits `tool_calls`, the backend intercepts, executes locally, and feeds results back.

**Built-in tools:**

| Tool | Description |
|---|---|
| `read_file` | Read content from an uploaded file (PDF → text, image → base64 for vision, txt → raw) |
| `web_search` | Search via SearXNG instance (configurable `SEARXNG_URL` env var) |
| `fetch_url` | Fetch and extract readable text from a URL |

**Tool loop flow:**
1. Send messages + tool definitions to LLM (non-streamed request per round)
2. If response contains `tool_calls` → execute each tool
3. Emit `event: tool_status` SSE events to frontend (tool_start, tool_result)
4. Append tool results to message array
5. Re-send to LLM, repeat until model returns final text (max 10 rounds)
6. Stream final text response back to frontend as SSE chunks

**Frontend display:**
- Tool calls shown inline in assistant message bubble
- Icon (📄/🔍/🌐) + tool name + args preview
- Spinner while running, ✓ on success, ✗ on error

### 3.7 Markdown Rendering

**Requirements:**
- `react-markdown` with `remark-gfm` plugin
- Syntax-highlighted code blocks via `react-syntax-highlighter` (or `prism-react-renderer`)
- Support: headings, bold, italic, links, lists, tables, code blocks, inline code
- Code blocks: language label badge, copy button
- Links open in new tab

### 3.8 UI Layout & Design

**Layout:**
```
┌─────────────────────────────────────────────────────────┐
│  SIDEBAR (250px)  │         MAIN AREA                   │
│                   │                                     │
│  ┌─ AIUI ──────┐ │  ┌─ Top Bar ──────────────────────┐ │
│  │ [+ New Chat] │ │  │ [☰] [Model: qwen-3.6 ▾]  [⚙] │ │
│  │ [📁 Files]   │ │  └───────────────────────────────┘ │
│  └─────────────┘ │                                     │
│  ┌─ Folders ───┐ │  ┌─ Messages ────────────────────┐ │
│  │ 📚 Library  │ │  │                               │ │
│  │ 📄 Docs (3) │ │  │  [Avatar] Assistant message   │ │
│  │ 🖼️ Images(5)│ │  │                               │ │
│  └─────────────┘ │  │        User message [Avatar]  │ │
│  ┌─ Chats ────┐ │  │                               │ │
│  │ Today       │ │  │  [Avatar] Assistant typing... │ │
│  │  • Chat 1   │ │  │                               │ │
│  │ Yesterday   │ │  └───────────────────────────────┘ │
│  │  • Chat 2   │ │                                     │
│  └─────────────┘ │  ┌─ Input Bar ────────────────────┐ │
│  ┌─ User ──────┐ │  │ [📎] Type... #file    [Send ▶] │ │
│  │  🅣 User     │ │  └───────────────────────────────┘ │
│  └─────────────┘ │                                     │
└─────────────────────────────────────────────────────────┘
```

**Dark theme colors:**

| Element | Color |
|---|---|
| Sidebar BG | `#111113` |
| Main BG | `#0b0b0c` |
| Surface / Cards | `#18181b` |
| Border | `#2a2a2e` |
| Text Primary | `#ececec` |
| Text Secondary | `#888` |
| User Bubble | `#1e2028` |
| Assistant Bubble | transparent |
| Accent | `#7c5dfa` |
| Input BG | `#18181b` |
| Hover | `#1a1a1a` |

**Typography:** System font stack (`-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`). Message text 14.5px, code `JetBrains Mono` 13px.

**Responsive:** Sidebar collapses on mobile (<768px), hamburger toggle.

---

## 4. Features — V2 (Near Future)

### 4.1 Embedding Search (`#collection`)

> Talk to a folder of documents. Ask questions across all your uploaded files.

**Concept:** When you reference a collection (folder) in chat, the backend searches for relevant chunks using embedding similarity and injects them as context.

**Architecture:**

```
User types:  "Summarize the key findings in #Research"
                                        ↓
Backend:  folder "Research" → list all files → chunk → embed → search
                                        ↓
  Top-K relevant chunks (text snippets + image captions)
                                        ↓
  Inject as context: "[📁 Research collection — 12 files, 47 chunks]\n<chunk 1>\n<chunk 2>\n..."
                                        ↓
  LLM responds with understanding of entire collection
```

**Embedding pipeline:**

| Step | Detail |
|---|---|
| **Chunking** | Split documents into ~512 token overlapping chunks. Images → generate text captions (via vision model) or extract EXIF/metadata. |
| **Embedding model** | Call an embedding API (OpenAI `text-embedding-3-small`, or any `/v1/embeddings` compatible endpoint). Configured per-account alongside chat model. |
| **Vector storage** | `sqlite-vec` extension or `sqlite-vss` — vector search in SQLite. No external DB needed. Store chunks + embeddings in a `chunks` table. |
| **Indexing** | On file upload → extract text → chunk → call embedding API → store vectors. Background job, shows progress. |
| **Search** | On `#collection` reference → embed query → vector similarity search → top-K chunks → inject as context. |

**Database additions:**

```sql
-- Embedding model config (stored in accounts table or separate)
-- accounts.embedding_model TEXT DEFAULT ''   -- e.g. "text-embedding-3-small"
-- accounts.embedding_base_url TEXT DEFAULT '' -- defaults to base_url if empty

-- Chunk + vector storage
CREATE TABLE chunks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  file_id TEXT NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  folder_id TEXT REFERENCES folders(id) ON DELETE SET NULL,
  content TEXT NOT NULL,            -- the text chunk
  chunk_index INTEGER NOT NULL,     -- position in document
  token_count INTEGER NOT NULL,
  embedding BLOB,                   -- vector as binary blob (sqlite-vec format)
  created_at REAL DEFAULT (unixepoch())
);

-- Virtual table for vector search (sqlite-vec)
-- CREATE VIRTUAL TABLE vec_chunks USING vec0(
--   embedding float[1536]  -- dimension depends on model
-- );
```

**`#collection` syntax:**
- `#Research` — reference a folder by name → search all files in that folder
- `#Research:_budget` — search within folder with query hint
- `#*` — search across ALL files (global search)
- Autocomplete shows folders alongside files when typing `#`

**When to embed:**
- On file upload → chunk + embed in background
- On file delete → remove chunks
- Re-embed all: manual trigger in settings (e.g., after changing embedding model)

**Config (settings):**
- Embedding model name (e.g., `text-embedding-3-small`)
- Embedding base URL (defaults to account base_url)
- Chunk size (default 512 tokens)
- Chunk overlap (default 64 tokens)
- Top-K results (default 8)

### 4.2 Message Actions

| Action | Description |
|---|---|
| **Copy** | Copy message text to clipboard |
| **Regenerate** | Re-send last user message, replace assistant response |
| **Edit** | Edit a sent user message, re-submit from that point (truncates later messages) |
| **Delete** | Remove a single message from conversation |

### 4.3 System Prompt Per Chat

- Editable system prompt field in chat settings (gear icon in top bar)
- Stored in `chats.system_prompt` column
- Prepended to messages array on every API call
- Default system prompt configurable in account settings

### 4.4 Chat Export & Import

- Export chat as Markdown file
- Export as JSON (full message array)
- Import from OpenAI ChatGPT export format

### 4.5 Image Generation

- If model supports image generation (DALL-E, etc.), render returned images inline
- Support `generate_image` tool definition

---

## 5. Architecture

### Directory Structure

```
aiui/
├── prd.md                    # this file
├── AGENTS.md                 # agent development guide
├── pyproject.toml            # uv project: fastapi, uvicorn, pdfplumber, httpx
├── uv.lock
├── vite.config.js            # frontend dev server, proxies /api → :8099
├── index.html
├── package.json
├── server.py                 # ⭐ backend: FastAPI, SQLite, file mgmt, LLM proxy
├── src/
│   ├── main.jsx              # React entry
│   ├── App.jsx               # Root layout, context providers
│   ├── App.css               # Global styles, dark theme
│   ├── components/
│   │   ├── Sidebar.jsx       # Chat list, folders, nav
│   │   ├── ChatArea.jsx      # Message list + input
│   │   ├── Message.jsx       # Single message rendering
│   │   ├── InputBar.jsx      # Textarea + attach + send
│   │   ├── AttachmentBar.jsx # Image/file preview thumbnails
│   │   ├── ModelPicker.jsx   # Model selector dropdown
│   │   ├── SettingsModal.jsx # Account/provider config
│   │   ├── AcDropdown.jsx    # #file autocomplete dropdown
│   │   └── ToolCalls.jsx     # Inline tool call status display
│   ├── hooks/
│   │   ├── useChat.js        # Send, stream, tool loop, message state
│   │   ├── useFiles.js       # File upload, folder CRUD
│   │   └── useAutocomplete.js # #reference search + keyboard nav
│   └── services/
│       ├── api.js            # fetch wrapper for /api/*
│       └── markdown.js       # react-markdown config
└── data/                     # runtime (gitignored)
    ├── aiui.db               # SQLite
    └── files/                # uploaded files
        ├── {uuid}.png
        ├── {folder_id}/
        │   └── {uuid}.pdf
        └── ...
```

### Backend API Reference

```
Accounts
  GET    /api/accounts                # list accounts
  PUT    /api/accounts                # replace all accounts

Chats
  GET    /api/chats                   # list chats (?account_id=)
  POST   /api/chats                   # create chat
  GET    /api/chats/{id}              # get chat + messages
  PUT    /api/chats/{id}              # update title/messages
  DELETE /api/chats/{id}              # delete chat + messages

Folders
  GET    /api/folders                 # list folders with file counts
  POST   /api/folders                 # create folder
  PUT    /api/folders/{id}            # rename/icon/color
  DELETE /api/folders/{id}            # delete (files → unsorted)

Files
  POST   /api/upload                  # single file upload (?folder_id=)
  POST   /api/upload/batch            # multi-file upload
  GET    /api/files/{id}              # serve file
  PUT    /api/files/{id}              # move/rename
  DELETE /api/files/{id}              # delete

Library
  GET    /api/library                 # browse (?folder_id=, ?type=, ?sort=, ?limit=, ?offset=)
  GET    /api/library/search?q=X      # fuzzy filename search (for autocomplete)

Processing
  POST   /api/resolve-references      # resolve #filename → multimodal content
  POST   /api/extract-pdf             # PDF → text extraction

LLM Proxy
  POST   /api/chat/completions        # streaming proxy with tool loop
  GET    /api/models?base_url=&key=   # fetch model list from provider

System
  GET    /api/health                  # health check
  GET    /api/e2e                     # end-to-end test
  GET    /api/storage                 # storage quota + usage
```

### Database Schema

```sql
CREATE TABLE accounts (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  base_url TEXT NOT NULL,
  api_key TEXT NOT NULL,
  models TEXT NOT NULL DEFAULT '[]',         -- JSON array of model IDs
  embedding_model TEXT DEFAULT '',            -- e.g. "text-embedding-3-small"
  embedding_base_url TEXT DEFAULT '',         -- defaults to base_url
  created_at REAL DEFAULT (unixepoch())
);

CREATE TABLE chats (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  model TEXT NOT NULL DEFAULT '',
  title TEXT DEFAULT 'New Chat',
  system_prompt TEXT DEFAULT '',
  created_at REAL DEFAULT (unixepoch()),
  updated_at REAL DEFAULT (unixepoch()),
  FOREIGN KEY (account_id) REFERENCES accounts(id)
);

CREATE TABLE messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  chat_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('user','assistant','system','error')),
  content TEXT NOT NULL,                      -- JSON string (supports multimodal arrays)
  created_at REAL DEFAULT (unixepoch()),
  FOREIGN KEY (chat_id) REFERENCES chats(id) ON DELETE CASCADE
);

CREATE TABLE folders (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  icon TEXT DEFAULT '📁',
  color TEXT DEFAULT '#888',
  sort_order INTEGER DEFAULT 0,
  created_at REAL DEFAULT (unixepoch())
);

CREATE TABLE files (
  id TEXT PRIMARY KEY,
  original_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  path TEXT NOT NULL,
  folder_id TEXT REFERENCES folders(id) ON DELETE SET NULL,
  last_used_at REAL DEFAULT (unixepoch()),
  created_at REAL DEFAULT (unixepoch())
);
```

### Key Flows

**Send message with `#` references:**
```
Frontend                          Backend
────────                          ───────
User types "Describe #photo.png"
         │
         ├── GET /api/library/search?q=photo.png
         │   ← [{ id, original_name, mime_type, folder_name }]
         │
         ├── User selects from dropdown → "Describe #photo.png"
         │
User clicks Send
         │
         ├── POST /api/resolve-references
         │   body: { text: "Describe #photo.png" }
         │   ← { content: [
         │         { type: "text", text: "Describe" },
         │         { type: "image_url", image_url: { url: "data:image/png;base64,..." } }
         │       ], resolved: ["photo.png"], missing: [] }
         │
         ├── POST /api/chat/completions
         │   body: { model, messages: [..., userMsg], stream: true }
         │
         │   (backend: tool loop if needed, then stream response)
         │
         ← SSE chunks: data: {"choices":[{"delta":{"content":"This photo..."}}]}
         ← data: [DONE]
```

---

## 6. Implementation Priority

### Phase 1 — Fix & Split (now)
1. Split `App.jsx` into component files under `src/components/`
2. Extract CSS to `App.css` (already exists but unused)
3. Add `react-markdown` + `remark-gfm` + `react-syntax-highlighter`
4. Add chat rename (double-click title)
5. Add message copy button
6. Wire up light theme toggle (CSS variables)

### Phase 2 — Polish (next)
1. Add `last_used_at` to files schema + touch on reference
2. Proper attachment preview for PDFs (icon + extracted text tooltip)
3. Image lightbox on click (fullscreen preview overlay)
4. System prompt per chat
5. Chat export (Markdown + JSON)
6. Fix tool loop to stream first response, only go non-streaming when `tool_calls` detected

### Phase 3 — Embeddings (V2)
1. Add `sqlite-vec` to backend dependencies
2. Add `chunks` table + embedding storage
3. Chunking pipeline on file upload
4. Embedding API integration (`/v1/embeddings`)
5. `#collection` reference resolution → vector search → context injection
6. Settings: embedding model, chunk size, top-K
7. Re-index command

---

## 7. Non-Goals

- ❌ Multi-user / auth / login — single-user desktop tool
- ❌ RAG / vector DB as a service — embeddings stay local in SQLite
- ❌ Code interpreter / sandbox
- ❌ Audio transcription (Whisper) — future maybe
- ❌ Plugin marketplace — tools are backend-defined
- ❌ Docker deployment — `uv run` + `pnpm dev` is enough
- ❌ Mobile app — responsive web is fine

---

## 8. Run Instructions

```bash
cd aiui

# Backend (port 8099)
uv run server.py

# Frontend (port 8082) — in another terminal
pnpm dev

# Open http://localhost:8082
```

Frontend proxies `/api/*` → `http://localhost:8099` via Vite config. No CORS issues.
