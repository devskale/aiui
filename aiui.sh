#!/usr/bin/env bash
# ═════════════════════════════════════════════════════════════
#  AIUI — Dev spinup script
#  Usage: ./aiui.sh [start|stop|restart|status|logs|dev|e2e]
# ═════════════════════════════════════════════════════════════
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
FRONTEND_PORT=8082
BACKEND_PORT=8099
PIDFILE_FE="$PROJECT_DIR/.frontend.pid"
PIDFILE_BE="$PROJECT_DIR/.backend.pid"
LOGFILE_FE="$PROJECT_DIR/.frontend.log"
LOGFILE_BE="$PROJECT_DIR/.backend.log"

# Colors
if [ -z "${NO_COLOR:-}" ]; then
  R='\033[0;31m'; G='\033[0;32m'; Y='\033[0;33m'; B='\033[1m'; D='\033[0m'
else
  R=''; G=''; Y=''; B=''; D=''
fi

log()   { echo -e "${B}[AIUI]${D} $*"; }
ok()    { echo -e "  ${G}✅ $*${D}"; }
warn()  { echo -e "  ${Y}⚠️  $*${D}"; }
fail()  { echo -e "  ${R}❌ $*${D}"; }

port_pid() { lsof -ti :"$1" -sTCP:LISTEN 2>/dev/null || true; }
is_running() { [ -n "$(port_pid "$1")" ]; }

wait_up() {
  local port=$1 name=$2 timeout=${3:-10} elapsed=0
  while ! is_running "$port"; do
    sleep 0.5; elapsed=$((elapsed + 1))
    if [ "$elapsed" -ge "$timeout" ]; then
      fail "$name failed to start within ${timeout}s"
      return 1
    fi
  done
}

kill_graceful() {
  local port=$1 name=$2 pid
  pid=$(port_pid "$port")
  if [ -z "$pid" ]; then warn "$name not running"; return 0; fi
  kill "$pid" 2>/dev/null || true
  for i in $(seq 1 10); do kill -0 "$pid" 2>/dev/null || break; sleep 0.5; done
  if kill -0 "$pid" 2>/dev/null; then kill -9 "$pid" 2>/dev/null || true; warn "$name force-killed"
  else ok "$name stopped"; fi
}

check_deps() {
  local missing=()
  command -v pnpm >/dev/null 2>&1 || missing+=("pnpm")
  command -v uv   >/dev/null 2>&1 || missing+=("uv")
  if [ "${#missing[@]}" -gt 0 ]; then fail "Missing: ${missing[*]}"; exit 1; fi
  # Auto-install node_modules if missing
  if [ ! -d "$PROJECT_DIR/node_modules" ]; then
    log "Installing frontend dependencies..."
    (cd "$PROJECT_DIR" && pnpm install)
  fi
}

# ─── start (background, --reload) ────────────────────────
cmd_start() {
  check_deps; cd "$PROJECT_DIR"

  # Backend — uvicorn --reload
  if is_running "$BACKEND_PORT"; then
    warn "Backend already running (port $BACKEND_PORT)"
  else
    log "Starting backend (uvicorn --reload) on :$BACKEND_PORT ..."
    (cd "$PROJECT_DIR" && uv run uvicorn server:app \
      --host 0.0.0.0 --port "$BACKEND_PORT" \
      --reload \
      >>"$LOGFILE_BE" 2>&1 &)
    # grab the PID of the uvicorn watcher process
    sleep 1
    local bp; bp=$(port_pid "$BACKEND_PORT")
    echo "$bp" > "$PIDFILE_BE"
    wait_up "$BACKEND_PORT" "Backend" 10 && ok "Backend → http://localhost:$BACKEND_PORT  (reload on server.py change)"
  fi

  # Frontend — vite (HMR built-in)
  if is_running "$FRONTEND_PORT"; then
    warn "Frontend already running (port $FRONTEND_PORT)"
  else
    log "Starting frontend (vite HMR) on :$FRONTEND_PORT ..."
    (cd "$PROJECT_DIR" && pnpm dev >>"$LOGFILE_FE" 2>&1 &)
    sleep 1
    local fp; fp=$(port_pid "$FRONTEND_PORT")
    echo "$fp" > "$PIDFILE_FE"
    wait_up "$FRONTEND_PORT" "Frontend" 10 && ok "Frontend → http://localhost:$FRONTEND_PORT  (HMR on src/ change)"
  fi

  echo ""
  log "AIUI ready!  ${G}http://localhost:$FRONTEND_PORT${D}"
  log "Backend API: ${G}http://localhost:$BACKEND_PORT/api/health${D}"
  log "Both reload on file change. Use ${B}./aiui.sh logs${D} to tail."
}

# ─── dev (foreground, split terminal) ────────────────────
cmd_dev() {
  check_deps; cd "$PROJECT_DIR"

  # Clean up any stale background instances
  is_running "$BACKEND_PORT"  && { log "Stopping stale backend..."; kill_graceful "$BACKEND_PORT" "Backend"; sleep 0.5; }
  is_running "$FRONTEND_PORT" && { log "Stopping stale frontend..."; kill_graceful "$FRONTEND_PORT" "Frontend"; sleep 0.5; }

  log "Starting AIUI in dev mode (Ctrl+C to stop both)"
  echo ""

  # Trap to kill both on exit
  cleanup() {
    echo ""
    log "Shutting down..."
    kill_graceful "$BACKEND_PORT" "Backend"  2>/dev/null || true
    kill_graceful "$FRONTEND_PORT" "Frontend" 2>/dev/null || true
    rm -f "$PIDFILE_FE" "$PIDFILE_BE"
    log "Bye!"
    exit 0
  }
  trap cleanup SIGINT SIGTERM

  # Backend in background
  uv run uvicorn server:app \
    --host 0.0.0.0 --port "$BACKEND_PORT" \
    --reload \
    >>"$LOGFILE_BE" 2>&1 &
  local be_pid=$!
  echo "$be_pid" > "$PIDFILE_BE"

  # Frontend in background
  pnpm dev >>"$LOGFILE_FE" 2>&1 &
  local fe_pid=$!
  echo "$fe_pid" > "$PIDFILE_FE"

  # Wait for both to come up
  wait_up "$BACKEND_PORT"  "Backend"  10 2>/dev/null && ok "Backend  → http://localhost:$BACKEND_PORT  (uvicorn --reload)"
  wait_up "$FRONTEND_PORT" "Frontend" 10 2>/dev/null && ok "Frontend → http://localhost:$FRONTEND_PORT  (vite HMR)"

  echo ""
  log "${G}AIUI running!${D}  Open ${B}http://localhost:$FRONTEND_PORT${D}"
  log "Press Ctrl+C to stop both"
  echo ""
  log "Live logs (Ctrl+\\ to force quit):"
  echo "─────────────────────────────────────────"

  # Tail both logs interleaved
  tail -f "$LOGFILE_BE" "$LOGFILE_FE" 2>/dev/null || wait
}

# ─── stop ────────────────────────────────────────────────
cmd_stop() {
  cd "$PROJECT_DIR"
  log "Stopping services ..."
  kill_graceful "$FRONTEND_PORT" "Frontend"
  kill_graceful "$BACKEND_PORT"  "Backend"
  rm -f "$PIDFILE_FE" "$PIDFILE_BE"
  ok "All stopped"
}

cmd_restart() {
  cmd_stop; sleep 1; cmd_start
}

# ─── status ──────────────────────────────────────────────
cmd_status() {
  local fe be
  fe=$(port_pid "$FRONTEND_PORT"); be=$(port_pid "$BACKEND_PORT")

  echo ""
  echo -e "${B}  AIUI Status${D}"
  echo -e "  ─────────────────────────────"

  if [ -n "$fe" ]; then
    echo -e "  Frontend :$FRONTEND_PORT  ${G}running${D}  (PID $fe)"
  else
    echo -e "  Frontend :$FRONTEND_PORT  ${R}stopped${D}"
  fi

  if [ -n "$be" ]; then
    echo -e "  Backend  :$BACKEND_PORT  ${G}running${D}  (PID $be)"
    local health
    health=$(curl -sf http://localhost:"$BACKEND_PORT"/api/health 2>/dev/null || echo '{"status":"unreachable"}')
    local status
    status=$(echo "$health" | python3 -c 'import sys,json;print(json.load(sys.stdin).get("status","?"))' 2>/dev/null || echo "?")
    if [ "$status" = "ok" ]; then echo -e "  Health   ${G}$status${D}"
    else echo -e "  Health   ${R}${status}${D}"; fi
  else
    echo -e "  Backend  :$BACKEND_PORT  ${R}stopped${D}"
  fi
  echo ""
}

# ─── logs ────────────────────────────────────────────────
cmd_logs() {
  local service="${1:-all}" lines="${2:-40}"
  case "$service" in
    fe|frontend)
      echo -e "${B}--- Frontend log (last $lines) ---${D}"
      tail -n "$lines" "$LOGFILE_FE" 2>/dev/null || warn "No frontend log"
      ;;
    be|backend)
      echo -e "${B}--- Backend log (last $lines) ---${D}"
      tail -n "$lines" "$LOGFILE_BE" 2>/dev/null || warn "No backend log"
      ;;
    follow|tail)
      echo -e "${B}Tailing all logs (Ctrl+C to stop)${D}"
      tail -f "$LOGFILE_BE" "$LOGFILE_FE" 2>/dev/null || true
      ;;
    all)
      cmd_logs backend "$lines"
      echo ""
      cmd_logs frontend "$lines"
      ;;
    *)
      echo "Usage: $0 logs [frontend|backend|all|follow] [lines=40]"
      ;;
  esac
}

# ─── e2e ─────────────────────────────────────────────────
cmd_e2e() {
  log "Running E2E test ..."
  curl -sf http://localhost:"$BACKEND_PORT"/api/e2e 2>/dev/null \
    | python3 -c '
import sys, json
d = json.load(sys.stdin)
color = "\033[0;32m" if d.get("status") == "PASS" else "\033[0;31m"
print(f"\n{color}{d.pop("status")}\033[0m")
for k, v in d.items():
    print(f"  {k}: {v}")
' 2>/dev/null || fail "Cannot reach backend — is it running?"
}

# ─── Dispatch ────────────────────────────────────────────
case "${1:-help}" in
  start)   cmd_start;;
  dev)     cmd_dev;;
  stop)    cmd_stop;;
  restart) cmd_restart;;
  status)  cmd_status;;
  logs)    cmd_logs "${2:-all}" "${3:-40}";;
  e2e)     cmd_e2e;;
  help|*)
    echo ""
    echo -e "${B}AIUI — Dev Server Control${D}"
    echo ""
    echo "Usage: $0 <command>"
    echo ""
    echo "  ${G}start${D}     Start backend (--reload) + frontend (HMR) in background"
    echo "  ${G}dev${D}       Start both in foreground, tail logs, Ctrl+C to stop"
    echo "  ${G}stop${D}      Stop both services"
    echo "  ${G}restart${D}   Stop then start (background)"
    echo "  ${G}status${D}    Show running state + health check"
    echo "  ${G}logs${D}      Show logs [frontend|backend|all|follow] [lines]"
    echo "  ${G}e2e${D}       Run end-to-end test"
    echo ""
    echo "Ports:  Frontend=$FRONTEND_PORT  Backend=$BACKEND_PORT"
    echo ""
    ;;
esac
