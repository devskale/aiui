# AIUI — Agent Development Guide

## Project Overview

Slim Open WebUI clone. **Vite + React SPA**, no backend server. All API calls go direct from browser → LLM provider (CORS handled by provider or proxy).

### Tech Stack
- **Framework:** React 19 + Vite
- **Styling:** CSS modules or plain CSS (pick one and stick to it)
- **State:** React Context + localStorage persistence
- **Markdown:** react-markdown + remark-gfm + react-syntax-highlighter
- **Icons:** lucide-react
- **PDF:** pdfjs-dist (client-side PDF text extraction)
- **HTTP:** native fetch (no axios needed)
- **Package manager:** pnpm

### Default Account (pre-configured)
| Field | Value |
|---|---|
| Base URL | `https://amd1.mooo.com:8123/v1` |
| API Key | `test23@test34` |
| Model | `tu@qwen-3.6-35b` |
| Capabilities | Text + Image (vision) |

---

## Architecture

### No Backend — Everything Client-Side
- Chat history → `localStorage` (or IndexedDB if size becomes an issue)
- Accounts → `localStorage`
- PDF extraction → `pdfjs-dist` runs in browser
- Tool calls (web search) → call SearXNG directly from browser (or use a CORS proxy)
- Streaming → `fetch()` with `ReadableStream` / SSE parser

### Component Structure (Planned)
```
src/
├── App.jsx                    # Root layout, router, context providers
├── main.jsx                   # Entry point
├── index.css                  # Global styles, dark theme default
├── contexts/
│   ├── ChatContext.jsx         # Chat state, messages, current chat
│   └── AccountContext.jsx      # Accounts, active account, settings
├── components/
│   ├── Sidebar.jsx             # Chat list, new chat, account switcher
│   ├── ChatArea.jsx            # Main chat window
│   ├── MessageList.jsx         # Scrollable message container
│   ├── Message.jsx             # Single message (user/assistant/tool)
│   ├── InputBar.jsx            # Text input + attachment bar + send
│   ├── AttachmentBar.jsx       # Image previews + PDF file icons
│   ├── SettingsModal.jsx       # Account CRUD, base URL, model config
│   ├── ModelSelector.jsx       # Dropdown: fetch models or type custom
│   └── ThemeToggle.jsx         # Dark/light
├── hooks/
│   ├── useChat.js              # Send message, stream response, tool loop
│   ├── useAccounts.js          # Account CRUD in localStorage
│   └── usePDF.js               # PDF → markdown via pdfjs-dist
├── services/
│   ├── api.js                  # OpenAI-compatible API client (streaming)
│   ├── models.js               # Fetch model list from /models endpoint
│   ├── webSearch.js            # SearXNG search (tool implementation)
│   └── pdfService.js           # PDF extraction pipeline
└── utils/
    ├── storage.js              # localStorage helpers
    ├── markdown.js             # Markdown rendering config
    └── tools.js                # Tool registry, @tool-like pattern
```

---

## Open WebUI Look & Feel Reference

Match these visual characteristics:

### Layout
- **Left sidebar:** 260px wide, dark bg (`#1a1a2e` or similar), contains:
  - Logo/app name at top
  - "New Chat" button (prominent, accent color)
  - Chat history list (scrollable, each item shows title + date)
  - Account switcher at bottom
  - Settings gear icon
- **Main area:** Chat window taking remaining width
  - Header bar: model selector (center/right), theme toggle
  - Messages: centered max-width (~800px), user messages right-aligned or subtle bg diff, assistant left-aligned
  - Input area: sticky bottom, rounded textarea with attachment + send button

### Color Palette (Dark Default)
```
Sidebar BG:        #171717  or  #1a1a2e
Main BG:           #0f0f0f  or  #12121a
Surface/Card:      #1e1e2e  or  #21212d
Border:            #2a2a3c
Text Primary:      #ececf0
Text Secondary:    #8888a0
User Bubble:       #1e3a5f  (subtle blue tint)
Assistant Bubble:  transparent (just text on bg)
Accent:            #6d6df2  or  #7c5dfa  (purple/blue)
Input BG:          #1a1a2e
Input Border:      #2a2a3c
Hover:             #252538
```

### Typography
- Font: Inter or system-ui stack (`-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`)
- Message text: 15-16px, line-height 1.6
- Code: 'JetBrains Mono' or 'Fira Code', monospace
- Sidebar items: 14px

### Behavior
- Smooth scroll to bottom on new messages
- Typing indicator (three bouncing dots) while streaming
- Message appear with subtle fade-in
- Sidebar collapsible on mobile (hamburger menu)
- Input area auto-grows up to ~200px height

---

## Development Commands

```bash
pnpm dev          # Start dev server (http://localhost:5173)
pnpm build        # Production build → dist/
pnpm preview      # Preview production build
```

---

## Coding Conventions

- **Functional components + hooks only** (no class components)
- **Named exports** for components, default export only for pages/App
- **CSS:** Plain CSS files co-located with components (`ComponentName.css`) or a single global stylesheet — pick one approach
- **No prop-drilling past 2 levels** — use Context
- **Error boundaries** at route level
- **Console warnings** are errors during dev — fix them
- **Keep components under 200 lines** — split if growing
- **File naming:** PascalCase for components, camelCase for utils/hooks/services

---

## Feature Checklist (from PRD)

- [ ] Base URL + model selector (auto-fetch from `/models`)
- [ ] Multi-account system (localStorage, switchable)
- [ ] Image upload (drag-drop, paste, picker → base64 vision)
- [ ] PDF upload (pdfjs-dist → markdown injection)
- [ ] Tool/function calling (stream parse tool_calls → execute → loop)
- [ ] Web search tool (SearXNG, zero-config)
- [ ] Streaming responses (SSE via fetch ReadableStream)
- [ ] Markdown rendering with syntax highlighting
- [ ] Chat history (localStorage per account)
- [ ] Dark/light theme
- [ ] Responsive/mobile sidebar
- [ ] New chat, delete chat, rename chat

---

## Key Implementation Notes

### Streaming (No Backend Proxy)
```js
// Browser calls OpenAI-compatible API directly
const response = await fetch(`${baseUrl}/chat/completions`, {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ model, messages, stream: true, tools /* optional */ })
});
const reader = response.body.getReader();
// Parse SSE: data: {...}\n\n chunks
```

### CORS Consideration
If the LLM provider doesn't support CORS, we may need a tiny Vite proxy:
```js
// vite.config.js
server: {
  proxy: { '/api': { target: 'https://amd1.mooo.com:8123', changeOrigin: true } }
}
```
This keeps the "no backend" feel while handling CORS transparently.

### PDF Extraction (Client-Side)
Use `pdfjs-dist` with worker:
```js
import * as pdfjsLib from 'pdfjs-dist';
pdfjsLib.GlobalWorkerOptions.workerSrc = '...';
const pdf = await pdfjsLib.getDocument(arrayBuffer).promise;
// Extract text per page, detect headings by font size, tables, etc.
```

### Tool Call Loop (Client-Side)
Since everything is client-side, the tool loop runs in the browser:
1. Stream response → accumulate chunks
2. If `tool_calls` detected in parsed JSON → stop streaming
3. Execute tool function (web_search, etc.) in browser
4. Append `tool` role message + `tool` result message
5. Re-send request with full conversation (including tool results)
6. Repeat until model returns content (no more tool_calls)
7. Render final response
