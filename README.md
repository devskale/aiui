# AIUI

Slim chat UI for any OpenAI-compatible LLM. Upload media, reference files with `#`, talk to images & docs.

## Quick Start

```bash
# 1. Start both servers (backend --reload + frontend HMR)
./aiui.sh start

# 2. Open
open http://localhost:8082
```

That's it. Backend on `:8099`, frontend on `:8082`, both auto-reload on file changes.

## Dev Commands

```bash
./aiui.sh start     # start in background (both reload on change)
./aiui.sh dev       # start in foreground, tail logs, Ctrl+C to stop
./aiui.sh stop      # stop both
./aiui.sh restart   # stop + start
./aiui.sh status    # show running state + health
./aiui.sh logs      # tail logs [backend|frontend|all|follow]
./aiui.sh e2e       # run end-to-end test
```

## Features

- **Streaming chat** — SSE, real-time token streaming
- **Tool calling** — web search, file reading, URL fetching (server-side loop)
- **File upload** — images (vision), PDFs (text extraction), TXT/MD
- **`#filename` references** — type `#` to autocomplete files, send as multimodal context
- **Folder system** — organize uploads, browse from sidebar
- **Multi-account** — multiple LLM providers, model selector

## Stack

| Layer | Tool |
|---|---|
| Frontend | Vite + React 19 |
| Backend | FastAPI + SQLite |
| Runtime | `pnpm` + `uv` |

## Project Structure

```
├── aiui.sh              # dev spinup script
├── prd.md               # product requirements
├── AGENTS.md            # agent development guide
├── server/              # Python backend
│   ├── app.py           # FastAPI app (API, DB, LLM proxy, tools)
│   ├── seed.py          # seed demo data
│   └── __init__.py
├── src/                 # React frontend
│   ├── App.jsx          # components + styles
│   ├── main.jsx
│   └── index.css
├── public/              # static assets
├── docs/                # screenshots, documentation
├── data/                # runtime (gitignored)
│   ├── aiui.db          # SQLite database
│   └── files/           # uploaded files
├── pyproject.toml       # Python deps (uv)
├── package.json         # JS deps (pnpm)
└── vite.config.js       # dev server + proxy
```

## License

MIT
