#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUN_DIR="$ROOT_DIR/tmp/dev-stack"
SERVER_PID_FILE="$RUN_DIR/server.pid"
WEB_PID_FILE="$RUN_DIR/web.pid"
SERVER_PORT_FILE="$RUN_DIR/server.port"
WEB_PORT_FILE="$RUN_DIR/web.port"
SERVER_LOG_FILE="$RUN_DIR/server.log"
WEB_LOG_FILE="$RUN_DIR/web.log"

LOCAL_HOST="127.0.0.1"
DEFAULT_SERVER_PORT=8787
DEFAULT_WEB_PORT=5173

mkdir -p "$RUN_DIR"

server_url() {
  local port="${1:-$DEFAULT_SERVER_PORT}"
  echo "http://${LOCAL_HOST}:${port}/health"
}

web_url() {
  local port="${1:-$DEFAULT_WEB_PORT}"
  echo "http://${LOCAL_HOST}:${port}/"
}

is_pid_running() {
  local pid="${1:-}"
  [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null
}

read_pid() {
  local file="$1"
  [[ -f "$file" ]] || return 0
  tr -d '[:space:]' < "$file"
}

write_runtime_value() {
  local file="$1"
  local value="$2"
  printf '%s\n' "$value" > "$file"
}

cleanup_stale_runtime_files() {
  local file="$1"
  local runtime_file="${2:-}"
  local pid
  pid="$(read_pid "$file")"
  if [[ -n "$pid" ]] && ! is_pid_running "$pid"; then
    rm -f "$file"
    [[ -n "$runtime_file" ]] && rm -f "$runtime_file"
  fi
}

wait_for_http() {
  local url="$1"
  local label="$2"
  local retries="${3:-40}"

  for ((i = 1; i <= retries; i += 1)); do
    if curl -fsS "$url" >/dev/null 2>&1; then
      echo "${label} 已就绪：${url}"
      return 0
    fi
    sleep 1
  done

  echo "${label} 启动超时：${url}"
  return 1
}

is_http_up() {
  local url="$1"
  curl -fsS "$url" >/dev/null 2>&1
}

is_port_available() {
  local host="$1"
  local port="$2"

  if command -v lsof >/dev/null 2>&1; then
    ! lsof -n -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1
    return
  fi

  if command -v nc >/dev/null 2>&1; then
    ! nc -z "$host" "$port" >/dev/null 2>&1
    return
  fi

  node --input-type=module -e '
    import net from "node:net";
    const [host, port] = process.argv.slice(1);
    const socket = net.connect({ host, port: Number(port) });
    socket.setTimeout(1000);
    socket.once("connect", () => process.exit(1));
    socket.once("timeout", () => process.exit(0));
    socket.once("error", (error) => {
      process.exit(error.code === "ECONNREFUSED" ? 0 : 1);
    });
  ' "$host" "$port" >/dev/null 2>&1
}

find_available_port() {
  local host="$1"
  local base_port="$2"
  local max_tries="${3:-20}"
  local port="$base_port"

  for ((i = 0; i < max_tries; i += 1)); do
    if is_port_available "$host" "$port"; then
      echo "$port"
      return 0
    fi
    port=$((port + 1))
  done

  echo "未找到可用端口（起始端口：${base_port}，尝试次数：${max_tries}）" >&2
  return 1
}

ensure_native_deps() {
  if node -e "require('better-sqlite3')" >/dev/null 2>&1; then
    return 0
  fi

  echo "检测到 better-sqlite3 与当前 Node 不匹配，开始重建..."
  (cd "$ROOT_DIR" && npm rebuild better-sqlite3 --workspace @users-research/server)
}

start_server() {
  cleanup_stale_runtime_files "$SERVER_PID_FILE" "$SERVER_PORT_FILE"

  local pid
  local port
  pid="$(read_pid "$SERVER_PID_FILE")"
  port="$(read_pid "$SERVER_PORT_FILE")"
  if is_pid_running "$pid"; then
    echo "后端已在运行，PID=${pid}，端口=${port:-未知}"
    return 0
  fi

  port="$(find_available_port "$LOCAL_HOST" "$DEFAULT_SERVER_PORT")"
  if [[ "$port" != "$DEFAULT_SERVER_PORT" ]]; then
    echo "后端默认端口 ${DEFAULT_SERVER_PORT} 被占用，自动切换到 ${port}"
  fi

  ensure_native_deps
  (cd "$ROOT_DIR" && npm run build --workspace @users-research/server >/dev/null)

  (
    cd "$ROOT_DIR"
    nohup env HOST="$LOCAL_HOST" PORT="$port" node apps/server/dist/apps/server/src/index.js >"$SERVER_LOG_FILE" 2>&1 &
    write_runtime_value "$SERVER_PID_FILE" "$!"
    write_runtime_value "$SERVER_PORT_FILE" "$port"
  )

  pid="$(read_pid "$SERVER_PID_FILE")"
  echo "后端启动中，PID=${pid}，端口=${port}"
  wait_for_http "$(server_url "$port")" "后端"
}

start_web() {
  cleanup_stale_runtime_files "$WEB_PID_FILE" "$WEB_PORT_FILE"

  local pid
  local port
  local server_port
  pid="$(read_pid "$WEB_PID_FILE")"
  port="$(read_pid "$WEB_PORT_FILE")"
  if is_pid_running "$pid"; then
    echo "前端已在运行，PID=${pid}，端口=${port:-未知}"
    return 0
  fi

  server_port="$(read_pid "$SERVER_PORT_FILE")"
  if [[ -z "$server_port" ]]; then
    echo "未找到后端端口记录，请先启动后端" >&2
    return 1
  fi

  port="$(find_available_port "$LOCAL_HOST" "$DEFAULT_WEB_PORT")"
  if [[ "$port" != "$DEFAULT_WEB_PORT" ]]; then
    echo "前端默认端口 ${DEFAULT_WEB_PORT} 被占用，自动切换到 ${port}"
  fi

  (
    cd "$ROOT_DIR/apps/web"
    nohup env VITE_API_PROXY_TARGET="http://$LOCAL_HOST:$server_port" npm run dev -- --host "$LOCAL_HOST" --port "$port" --strictPort >"$WEB_LOG_FILE" 2>&1 &
    write_runtime_value "$WEB_PID_FILE" "$!"
    write_runtime_value "$WEB_PORT_FILE" "$port"
  )

  pid="$(read_pid "$WEB_PID_FILE")"
  echo "前端启动中，PID=${pid}，端口=${port}，代理后端=http://${LOCAL_HOST}:${server_port}"
  wait_for_http "$(web_url "$port")" "前端"
}

stop_process() {
  local file="$1"
  local label="$2"
  local runtime_file="${3:-}"
  local pid
  pid="$(read_pid "$file")"

  if ! is_pid_running "$pid"; then
    rm -f "$file"
    [[ -n "$runtime_file" ]] && rm -f "$runtime_file"
    echo "${label} 未运行"
    return 0
  fi

  kill "$pid" 2>/dev/null || true

  for ((i = 1; i <= 10; i += 1)); do
    if ! is_pid_running "$pid"; then
      rm -f "$file"
      [[ -n "$runtime_file" ]] && rm -f "$runtime_file"
      echo "${label} 已停止"
      return 0
    fi
    sleep 1
  done

  kill -9 "$pid" 2>/dev/null || true
  rm -f "$file"
  [[ -n "$runtime_file" ]] && rm -f "$runtime_file"
  echo "${label} 已强制停止"
}

show_status() {
  cleanup_stale_runtime_files "$SERVER_PID_FILE" "$SERVER_PORT_FILE"
  cleanup_stale_runtime_files "$WEB_PID_FILE" "$WEB_PORT_FILE"

  local server_pid web_pid server_port web_port
  server_pid="$(read_pid "$SERVER_PID_FILE")"
  web_pid="$(read_pid "$WEB_PID_FILE")"
  server_port="$(read_pid "$SERVER_PORT_FILE")"
  web_port="$(read_pid "$WEB_PORT_FILE")"

  echo "项目目录：${ROOT_DIR}"
  echo "SQLite：${ROOT_DIR}/apps/server/tmp/users-research.sqlite"
  echo "后端 PID：${server_pid:-未运行}"
  echo "后端端口：${server_port:-未记录}"
  echo "前端 PID：${web_pid:-未运行}"
  echo "前端端口：${web_port:-未记录}"
  echo "后端日志：$SERVER_LOG_FILE"
  echo "前端日志：$WEB_LOG_FILE"

  if [[ -n "$server_port" ]] && curl -fsS "$(server_url "$server_port")" >/dev/null 2>&1; then
    echo "后端状态：OK ($(server_url "$server_port"))"
  else
    echo "后端状态：DOWN"
  fi

  if [[ -n "$web_port" ]] && curl -fsS "$(web_url "$web_port")" >/dev/null 2>&1; then
    echo "前端状态：OK ($(web_url "$web_port"))"
  else
    echo "前端状态：DOWN"
  fi
}

start_all() {
  start_server
  start_web

  local server_port web_port
  server_port="$(read_pid "$SERVER_PORT_FILE")"
  web_port="$(read_pid "$WEB_PORT_FILE")"

  cat <<EOF

启动完成：
- 前端：$(web_url "$web_port")
- 后端：$(server_url "$server_port")
- SQLite：${ROOT_DIR}/apps/server/tmp/users-research.sqlite
- 后端日志：${SERVER_LOG_FILE}
- 前端日志：${WEB_LOG_FILE}
EOF
}

case "${1:-}" in
  start)
    start_all
    ;;
  stop)
    stop_process "$WEB_PID_FILE" "前端" "$WEB_PORT_FILE"
    stop_process "$SERVER_PID_FILE" "后端" "$SERVER_PORT_FILE"
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
