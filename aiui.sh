#!/usr/bin/env bash
# ═════════════════════════════════════════════════════════════
#  AIUI — Dev spinup script
#  Usage: ./aiui.sh [start|stop|restart|status|logs|dev|e2e|clean]
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

# ─── Process helpers ─────────────────────────────────────

# Get PID(s) listening on a port
port_pids() { lsof -ti :"$1" -sTCP:LISTEN 2>/dev/null || true; }

# True if something is listening on port
is_running() { [ -n "$(port_pids "$1")" ]; }

# Kill every process in a PID file, return count killed
kill_pidfile() {
  local pidfile=$1 name=$2 killed=0
  [ -f "$pidfile" ] || return 0
  while IFS= read -r pid; do
    [ -z "$pid" ] && continue
    if kill -0 "$pid" 2>/dev/null; then
      kill "$pid" 2>/dev/null || true
      killed=$((killed + 1))
    fi
  done < "$pidfile"
  rm -f "$pidfile"
  [ "$killed" -gt 0 ] && warn "$name: killed $killed stale PID(s) from pidfile"
  return "$killed"
}

# Kill all processes on a port (handles orphans not in pidfile)
kill_port() {
  local port=$1 name=$2
  local pids
  pids=$(port_pids "$port") || true
  [ -z "$pids" ] && return 0
  for pid in $pids; do
    kill "$pid" 2>/dev/null || true
  done
}

# Full stop: pidfile PIDs + port PIDs, graceful then force
stop_service() {
  local port=$1 name=$2 pidfile=$3
  local total_killed=0

  # 1. Kill PIDs recorded in pidfile (even if port already dead — they may be zombies)
  if [ -f "$pidfile" ]; then
    while IFS= read -r pid; do
      [ -z "$pid" ] && continue
      if kill -0 "$pid" 2>/dev/null; then
        kill "$pid" 2>/dev/null || true
        total_killed=$((total_killed + 1))
      fi
    done < "$pidfile"
    rm -f "$pidfile"
  fi

  # 2. Kill anything still on the port (orphans, child workers, etc.)
  local port_pids_now
  port_pids_now=$(port_pids "$port") || true
  for pid in $port_pids_now; do
    # Skip if we already sent SIGTERM to this PID above
    kill -0 "$pid" 2>/dev/null && kill "$pid" 2>/dev/null || true
    total_killed=$((total_killed + 1))
  done

  [ "$total_killed" -eq 0 ] && return 0

  # 3. Grace period — wait up to 5s for clean exit
  local waited=0
  while [ "$waited" -lt 10 ]; do
    sleep 0.5; waited=$((waited + 1))
    [ -z "$(port_pids "$port" 2>/dev/null)" ] && break
  done

  # 4. Force-kill survivors
  local survivors
  survivors=$(port_pids "$port" 2>/dev/null) || true
  if [ -n "$survivors" ]; then
    for pid in $survivors; do
      kill -9 "$pid" 2>/dev/null || true
    done
    warn "$name: force-killed orphan(s) on :$port"
  fi

  # 5. Final sweep — kill any remaining children (uvicorn workers, node forks)
  #    Look for processes whose cwd is our project dir and are on our ports
  local extra
  extra=$(lsof -ti :"$port" -sTCP:LISTEN 2>/dev/null) || true
  for pid in $extra; do
    kill -9 "$pid" 2>/dev/null || true
  done

  ok "$name stopped"
}

# Auto-clean stale state: dead pidfiles + orphaned port processes
# Call this before any start operation
autoclean() {
  local dirty=false

  # Check pidfiles for dead PIDs
  for pair in "$PIDFILE_FE:Frontend" "$PIDFILE_BE:Backend"; do
    local pidfile="${pair%%:*}" name="${pair##*:}"
    if [ -f "$pidfile" ]; then
      local has_alive=false
      while IFS= read -r pid; do
        [ -z "$pid" ] && continue
        if kill -0 "$pid" 2>/dev/null; then
          has_alive=true
        else
          warn "Stale PID $pid in ${pidfile##*/} (process dead)"
          dirty=true
        fi
      done < "$pidfile"
      # If ALL pids in file are dead, remove the file
      if [ "$has_alive" = false ]; then
        rm -f "$pidfile"
        warn "Removed stale ${pidfile##*/}"
        dirty=true
      fi
    fi
  done

  # Check for orphans: processes on our ports but NOT tracked in pidfiles
  for pair in "$FRONTEND_PORT:$PIDFILE_FE:Frontend" "$BACKEND_PORT:$PIDFILE_BE:Backend"; do
    local port="${pair%%:*}"; pair="${pair#*:}"
    local pidfile="${pair%%:*}" name="${pair##*:}"
    local orphans=""
    if is_running "$port"; then
      local tracked_pids=""
      if [ -f "$pidfile" ]; then
        tracked_pids=$(tr '\n' '|' < "$pidfile" | sed 's/|$//')
      fi
      if [ -n "$tracked_pids" ]; then
        orphans=$(lsof -ti :"$port" -sTCP:LISTEN 2>/dev/null | grep -vE "^($tracked_pids)$" || true)
      else
        orphans=$(lsof -ti :"$port" -sTCP:LISTEN 2>/dev/null || true)
      fi
      if [ -n "$orphans" ]; then
        warn "Orphan(s) on :$port not in pidfile: $orphans"
        for pid in $orphans; do
          kill "$pid" 2>/dev/null || true
        done
        dirty=true
        # Brief wait for graceful exit
        sleep 0.5
        # Force remaining
        for pid in $(lsof -ti :"$port" -sTCP:LISTEN 2>/dev/null || true); do
          kill -9 "$pid" 2>/dev/null || true
        done
        ok "Cleaned orphan(s) on :$port"
      fi
    fi
  done

  if [ "$dirty" = true ]; then
    echo ""
  fi
}

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
  # Auto-sync Python deps if venv missing/broken
  if [ ! -d "$PROJECT_DIR/.venv" ] || [ ! -x "$PROJECT_DIR/.venv/bin/python" ]; then
    log "Syncing Python dependencies..."
    (cd "$PROJECT_DIR" && uv sync)
  fi
}

# ─── start (background, --reload) ────────────────────────
cmd_start() {
  check_deps
  cd "$PROJECT_DIR"
  autoclean

  # Backend — uvicorn --reload
  if is_running "$BACKEND_PORT"; then
    warn "Backend already running (port $BACKEND_PORT)"
  else
    log "Starting backend (uvicorn --reload) on :$BACKEND_PORT ..."
    # Truncate log for fresh start
    : > "$LOGFILE_BE"
    (cd "$PROJECT_DIR" && uv run uvicorn server.app:app \
      --host 0.0.0.0 --port "$BACKEND_PORT" \
      --reload \
      >>"$LOGFILE_BE" 2>&1 &)
    sleep 1
    local bp; bp=$(port_pids "$BACKEND_PORT")
    if [ -n "$bp" ]; then
      echo "$bp" | tr ' ' '\n' > "$PIDFILE_BE"
      if wait_up "$BACKEND_PORT" "Backend" 10; then
        ok "Backend → http://localhost:$BACKEND_PORT  (reload on server/ change)"
      fi
    else
      fail "Backend failed to start — check: tail $LOGFILE_BE"
    fi
  fi

  # Frontend — vite (HMR built-in)
  if is_running "$FRONTEND_PORT"; then
    warn "Frontend already running (port $FRONTEND_PORT)"
  else
    log "Starting frontend (vite HMR) on :$FRONTEND_PORT ..."
    : > "$LOGFILE_FE"
    (cd "$PROJECT_DIR" && pnpm dev >>"$LOGFILE_FE" 2>&1 &)
    sleep 1
    local fp; fp=$(port_pids "$FRONTEND_PORT")
    if [ -n "$fp" ]; then
      echo "$fp" | tr ' ' '\n' > "$PIDFILE_FE"
      if wait_up "$FRONTEND_PORT" "Frontend" 10; then
        ok "Frontend → http://localhost:$FRONTEND_PORT  (HMR on src/ change)"
      fi
    else
      fail "Frontend failed to start — check: tail $LOGFILE_FE"
    fi
  fi

  echo ""
  log "AIUI ready!  ${G}http://localhost:$FRONTEND_PORT${D}"
  log "Backend API: ${G}http://localhost:$BACKEND_PORT/api/health${D}"
  log "Both reload on file change. Use ${B}./aiui.sh logs${D} to tail."
}

# ─── dev (foreground, split terminal) ────────────────────
cmd_dev() {
  check_deps
  cd "$PROJECT_DIR"
  autoclean

  log "Starting AIUI in dev mode (Ctrl+C to stop both)"
  echo ""

  # Trap to kill both on exit
  cleanup() {
    echo ""
    log "Shutting down..."
    stop_service "$BACKEND_PORT"  "Backend"  "$PIDFILE_BE" 2>/dev/null || true
    stop_service "$FRONTEND_PORT" "Frontend" "$PIDFILE_FE" 2>/dev/null || true
    log "Bye!"
    exit 0
  }
  trap cleanup SIGINT SIGTERM

  # Backend in background
  : > "$LOGFILE_BE"
  uv run uvicorn server.app:app \
    --host 0.0.0.0 --port "$BACKEND_PORT" \
    --reload \
    >>"$LOGFILE_BE" 2>&1 &
  echo "$!" > "$PIDFILE_BE"

  # Frontend in background
  : > "$LOGFILE_FE"
  pnpm dev >>"$LOGFILE_FE" 2>&1 &
  echo "$!" > "$PIDFILE_FE"

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
  stop_service "$BACKEND_PORT"  "Backend"  "$PIDFILE_BE"
  stop_service "$FRONTEND_PORT" "Frontend" "$PIDFILE_FE"
  ok "All stopped"
}

cmd_restart() {
  cmd_stop; sleep 1; cmd_start
}

# ─── clean (force-kill everything, scrub state) ──────────
cmd_clean() {
  cd "$PROJECT_DIR"
  log "Force-cleaning all AIUI processes and state ..."

  # Kill anything on our ports regardless of pidfiles
  for pair in "$BACKEND_PORT:Backend" "$FRONTEND_PORT:Frontend"; do
    local port="${pair%%:*}" name="${pair##*:}"
    local pids
    pids=$(port_pids "$port" 2>/dev/null) || true
    if [ -n "$pids" ]; then
      for pid in $pids; do
        kill -9 "$pid" 2>/dev/null || true
      done
      ok "$name: killed $(echo "$pids" | wc -w | tr -d ' ') process(es) on :$port"
    fi
  done

  # Kill PIDs in pidfiles too (may differ from port listeners)
  for pair in "$PIDFILE_BE:Backend" "$PIDFILE_FE:Frontend"; do
    local pidfile="${pair%%:*}" name="${pair##*:}"
    [ -f "$pidfile" ] || continue
    while IFS= read -r pid; do
      [ -z "$pid" ] && continue
      kill -9 "$pid" 2>/dev/null || true
    done < "$pidfile"
  done

  rm -f "$PIDFILE_BE" "$PIDFILE_FE"
  rm -f "$LOGFILE_BE" "$LOGFILE_FE"
  ok "All state cleaned"
}

# ─── status ──────────────────────────────────────────────
cmd_status() {
  local fe_pids be_pids
  fe_pids=$(port_pids "$FRONTEND_PORT")
  be_pids=$(port_pids "$BACKEND_PORT")

  echo ""
  echo -e "${B}  AIUI Status${D}"
  echo -e "  ─────────────────────────────"

  # Frontend
  if [ -n "$fe_pids" ]; then
    echo -e "  Frontend :$FRONTEND_PORT  ${G}running${D}  (PID $(echo "$fe_pids" | tr '\n' ',' | sed 's/,$//'))"
  else
    echo -e "  Frontend :$FRONTEND_PORT  ${R}stopped${D}"
  fi
  # Show pidfile state
  if [ -f "$PIDFILE_FE" ]; then
    local fe_alive=0 fe_dead=0
    while IFS= read -r pid; do
      [ -z "$pid" ] && continue
      if kill -0 "$pid" 2>/dev/null; then fe_alive=$((fe_alive+1))
      else fe_dead=$((fe_dead+1)); fi
    done < "$PIDFILE_FE"
    [ "$fe_dead" -gt 0 ] && echo -e "    ${Y}pidfile has $fe_dead dead PID(s) — will autoclean on next start${D}"
  fi

  # Backend
  if [ -n "$be_pids" ]; then
    echo -e "  Backend  :$BACKEND_PORT  ${G}running${D}  (PID $(echo "$be_pids" | tr '\n' ',' | sed 's/,$//'))"
    local health
    health=$(curl -sf --max-time 3 http://localhost:"$BACKEND_PORT"/api/health 2>/dev/null || echo '{"status":"unreachable"}')
    local status
    status=$(echo "$health" | python3 -c 'import sys,json;print(json.load(sys.stdin).get("status","?"))' 2>/dev/null || echo "?")
    if [ "$status" = "ok" ]; then echo -e "  Health   ${G}$status${D}"
    else echo -e "  Health   ${R}${status}${D}"; fi
  else
    echo -e "  Backend  :$BACKEND_PORT  ${R}stopped${D}"
  fi
  if [ -f "$PIDFILE_BE" ]; then
    local be_alive=0 be_dead=0
    while IFS= read -r pid; do
      [ -z "$pid" ] && continue
      if kill -0 "$pid" 2>/dev/null; then be_alive=$((be_alive+1))
      else be_dead=$((be_dead+1)); fi
    done < "$PIDFILE_BE"
    [ "$be_dead" -gt 0 ] && echo -e "    ${Y}pidfile has $be_dead dead PID(s) — will autoclean on next start${D}"
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
      echo "Usage: $0 logs [frontend|backend|all|follow] [lines]"
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
  clean)   cmd_clean;;
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
    echo "  ${G}stop${D}      Stop both services gracefully"
    echo "  ${G}restart${D}   Stop then start (background)"
    echo "  ${G}clean${D}     Force-kill everything + scrub pidfiles & logs"
    echo "  ${G}status${D}    Show running state + health + stale pid warnings"
    echo "  ${G}logs${D}      Show logs [frontend|backend|all|follow] [lines]"
    echo "  ${G}e2e${D}       Run end-to-end test"
    echo ""
    echo "Ports:  Frontend=$FRONTEND_PORT  Backend=$BACKEND_PORT"
    echo ""
    echo "Zombie cleanup runs automatically on ${B}start${D} and ${B}dev${D}."
    echo "Use ${B}clean${D} to nuke everything if things are stuck."
    echo ""
    ;;
esac
