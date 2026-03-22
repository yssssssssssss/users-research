#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUN_DIR="$ROOT_DIR/tmp/dev-stack"
SERVER_PID_FILE="$RUN_DIR/server.pid"
WEB_PID_FILE="$RUN_DIR/web.pid"
SERVER_LOG_FILE="$RUN_DIR/server.log"
WEB_LOG_FILE="$RUN_DIR/web.log"

SERVER_URL="http://127.0.0.1:8787/health"
WEB_URL="http://127.0.0.1:5173/"

mkdir -p "$RUN_DIR"

is_pid_running() {
  local pid="${1:-}"
  [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null
}

read_pid() {
  local file="$1"
  [[ -f "$file" ]] || return 0
  tr -d '[:space:]' < "$file"
}

cleanup_stale_pid_file() {
  local file="$1"
  local pid
  pid="$(read_pid "$file")"
  if [[ -n "$pid" ]] && ! is_pid_running "$pid"; then
    rm -f "$file"
  fi
}

wait_for_http() {
  local url="$1"
  local label="$2"
  local retries="${3:-40}"

  for ((i = 1; i <= retries; i += 1)); do
    if curl -fsS "$url" >/dev/null 2>&1; then
      echo "$label 已就绪：$url"
      return 0
    fi
    sleep 1
  done

  echo "$label 启动超时：$url"
  return 1
}

is_http_up() {
  local url="$1"
  curl -fsS "$url" >/dev/null 2>&1
}

ensure_native_deps() {
  if node -e "require('better-sqlite3')" >/dev/null 2>&1; then
    return 0
  fi

  echo "检测到 better-sqlite3 与当前 Node 不匹配，开始重建..."
  (cd "$ROOT_DIR" && npm rebuild better-sqlite3 --workspace @users-research/server)
}

start_server() {
  cleanup_stale_pid_file "$SERVER_PID_FILE"

  local pid
  pid="$(read_pid "$SERVER_PID_FILE")"
  if is_pid_running "$pid"; then
    echo "后端已在运行，PID=$pid"
    return 0
  fi

  if is_http_up "$SERVER_URL"; then
    echo "后端已在运行（非脚本托管进程）：$SERVER_URL"
    return 0
  fi

  ensure_native_deps
  (cd "$ROOT_DIR" && npm run build --workspace @users-research/server >/dev/null)

  (
    cd "$ROOT_DIR"
    nohup env HOST=127.0.0.1 PORT=8787 node apps/server/dist/apps/server/src/index.js >"$SERVER_LOG_FILE" 2>&1 &
    echo $! >"$SERVER_PID_FILE"
  )

  pid="$(read_pid "$SERVER_PID_FILE")"
  echo "后端启动中，PID=$pid"
  wait_for_http "$SERVER_URL" "后端"
}

start_web() {
  cleanup_stale_pid_file "$WEB_PID_FILE"

  local pid
  pid="$(read_pid "$WEB_PID_FILE")"
  if is_pid_running "$pid"; then
    echo "前端已在运行，PID=$pid"
    return 0
  fi

  if is_http_up "$WEB_URL"; then
    echo "前端已在运行（非脚本托管进程）：$WEB_URL"
    return 0
  fi

  (
    cd "$ROOT_DIR/apps/web"
    nohup npm run dev -- --host 127.0.0.1 >"$WEB_LOG_FILE" 2>&1 &
    echo $! >"$WEB_PID_FILE"
  )

  pid="$(read_pid "$WEB_PID_FILE")"
  echo "前端启动中，PID=$pid"
  wait_for_http "$WEB_URL" "前端"
}

stop_process() {
  local file="$1"
  local label="$2"
  local pid
  pid="$(read_pid "$file")"

  if ! is_pid_running "$pid"; then
    rm -f "$file"
    echo "$label 未运行"
    return 0
  fi

  kill "$pid" 2>/dev/null || true

  for ((i = 1; i <= 10; i += 1)); do
    if ! is_pid_running "$pid"; then
      rm -f "$file"
      echo "$label 已停止"
      return 0
    fi
    sleep 1
  done

  kill -9 "$pid" 2>/dev/null || true
  rm -f "$file"
  echo "$label 已强制停止"
}

show_status() {
  cleanup_stale_pid_file "$SERVER_PID_FILE"
  cleanup_stale_pid_file "$WEB_PID_FILE"

  local server_pid web_pid
  server_pid="$(read_pid "$SERVER_PID_FILE")"
  web_pid="$(read_pid "$WEB_PID_FILE")"

  echo "项目目录：$ROOT_DIR"
  echo "SQLite：$ROOT_DIR/apps/server/tmp/users-research.sqlite"
  echo "后端 PID：${server_pid:-未运行}"
  echo "前端 PID：${web_pid:-未运行}"
  echo "后端日志：$SERVER_LOG_FILE"
  echo "前端日志：$WEB_LOG_FILE"

  if curl -fsS "$SERVER_URL" >/dev/null 2>&1; then
    echo "后端状态：OK ($SERVER_URL)"
  else
    echo "后端状态：DOWN ($SERVER_URL)"
  fi

  if curl -fsS "$WEB_URL" >/dev/null 2>&1; then
    echo "前端状态：OK ($WEB_URL)"
  else
    echo "前端状态：DOWN ($WEB_URL)"
  fi
}

start_all() {
  start_server
  start_web

  cat <<EOF

启动完成：
- 前端：http://127.0.0.1:5173/
- 后端：http://127.0.0.1:8787/health
- SQLite：$ROOT_DIR/apps/server/tmp/users-research.sqlite
- 后端日志：$SERVER_LOG_FILE
- 前端日志：$WEB_LOG_FILE
EOF
}

case "${1:-}" in
  start)
    start_all
    ;;
  stop)
    stop_process "$WEB_PID_FILE" "前端"
    stop_process "$SERVER_PID_FILE" "后端"
    ;;
  restart)
    "$0" stop
    "$0" start
    ;;
  status)
    show_status
    ;;
  *)
    cat <<EOF
用法：
  bash scripts/dev-stack.sh start
  bash scripts/dev-stack.sh stop
  bash scripts/dev-stack.sh restart
  bash scripts/dev-stack.sh status
EOF
    exit 1
    ;;
esac
