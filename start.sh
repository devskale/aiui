#!/usr/bin/env bash
# Start πui locally on the Mac.
#
# Usage:
#   ./start.sh          # dev mode (Vite HMR on :5173, API on :3001)
#   ./start.sh prod     # production mode, single server on :3001 (serves dist/)
#   ./start.sh build    # just build dist/ and exit
#
# Dev:  open http://localhost:5173   (Vite proxies /api → :3001)
# Prod: open http://localhost:3001
set -euo pipefail
cd "$(dirname "$0")"

MODE="${1:-dev}"
PORT="${PORT:-3001}"

case "$MODE" in
  prod)
    if [ ! -d dist ]; then
      echo "🔨 dist/ missing — building…"
      pnpm build
    fi
    echo "🚀 Production server → http://localhost:$PORT"
    NODE_ENV=production PORT="$PORT" node server/index.js
    ;;
  build)
    echo "🔨 Building dist/…"
    pnpm build
    echo "✅ Done. Run ./start.sh prod to serve it."
    ;;
  dev|"")
    # Kill anything stuck on the ports (optional, non-fatal)
    lsof -ti :"$PORT" -ti :5173 2>/dev/null | xargs -r kill -9 2>/dev/null || true
    echo "🚀 Dev mode → http://localhost:5173  (API on :$PORT)"
    PORT="$PORT" pnpm dev
    ;;
  *)
    echo "Unknown mode: $MODE (use: dev | prod | build)"; exit 1
    ;;
esac
