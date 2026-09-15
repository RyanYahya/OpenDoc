#!/usr/bin/env bash
# Start the Normal-edition production server for verification.
# Ready when .opendoc/server.json exists and GET /api/session returns this process's token.

set -euo pipefail
# shellcheck source=./common.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/common.sh"

require_node
startup_timeout="${VERIFY_STARTUP_TIMEOUT_SECONDS:-60}"
if [[ ! "$startup_timeout" =~ ^[1-9][0-9]*$ ]]; then
  echo "VERIFY_STARTUP_TIMEOUT_SECONDS must be a positive integer." >&2
  exit 1
fi
mkdir -p "$RUN_DIR"

if [[ -f "$RUN_DIR/run.json" ]]; then
  existing_pid="$(node -p 'JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).pid' "$RUN_DIR/run.json" 2>/dev/null || true)"
  if [[ -n "${existing_pid:-}" ]] && pid_alive "$existing_pid"; then
    echo "A verification server is already recorded at pid $existing_pid. Run helpers/cleanup.sh first." >&2
    exit 1
  fi
fi

if session="$(session_json 2>/dev/null)"; then
  live_pid="$(node -p 'JSON.parse(process.argv[1]).pid' "$session")"
  live_origin="$(node -p 'JSON.parse(process.argv[1]).origin' "$session")"
  if pid_alive "$live_pid"; then
    echo "Workspace already has a live OpenDoc session at $live_origin (pid $live_pid)." >&2
    echo "Do not drive a session this run did not start. Stop that server, or use another checkout." >&2
    exit 1
  fi
fi

if [[ ! -d "$REPO_ROOT/dist" ]]; then
  echo "dist/ is missing. From the repository root run: pnpm install --frozen-lockfile && pnpm build" >&2
  echo "(pnpm verify also builds. pnpm start needs the production client.)" >&2
  exit 1
fi

export OPENDOC_PORT="$DEFAULT_PORT"
: > "$RUN_DIR/server.log"

# Same process shape as `pnpm start` / `npx opendoc start`: production client, isolated port.
(
  cd "$REPO_ROOT"
  exec node --import tsx "$REPO_ROOT/src/server/index.ts" --production
) >> "$RUN_DIR/server.log" 2>&1 &
pid=$!
ready=false
# Until startup succeeds, this shell owns the child directly. Do not leave a
# failed launch running without a usable run.json for the cleanup helper.
cleanup_failed_launch() {
  local result=$?
  if [[ "$ready" != true ]]; then
    kill -TERM "$pid" 2>/dev/null || true
    local stop_deadline=$((SECONDS + 5))
    while pid_alive "$pid" && (( SECONDS < stop_deadline )); do sleep 0.1; done
    if pid_alive "$pid"; then kill -KILL "$pid" 2>/dev/null || true; fi
    wait "$pid" 2>/dev/null || true
    rm -f "$RUN_DIR/helper.pid"
  fi
  return "$result"
}
trap cleanup_failed_launch EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
echo "$pid" > "$RUN_DIR/helper.pid"

deadline=$((SECONDS + startup_timeout))
origin=""
authenticated=false
while (( SECONDS < deadline )); do
  if ! pid_alive "$pid"; then
    echo "OpenDoc exited during startup. Last log lines:" >&2
    tail -n 40 "$RUN_DIR/server.log" >&2
    exit 1
  fi
  if session="$(session_json 2>/dev/null)"; then
    session_pid="$(node -p 'JSON.parse(process.argv[1]).pid' "$session")"
    origin="$(node -p 'JSON.parse(process.argv[1]).origin' "$session")"
    token="$(node -p 'JSON.parse(process.argv[1]).token' "$session")"
    if [[ "$session_pid" == "$pid" ]]; then
      if body="$(curl -fsS --max-time 2 "$origin/api/session")"; then
        remote_token="$(node -p 'JSON.parse(process.argv[1]).token' "$body" 2>/dev/null || true)"
        if [[ "$remote_token" == "$token" ]]; then
          authenticated=true
          break
        fi
      fi
    fi
  fi
  sleep 0.2
done

if [[ "$authenticated" != true ]] || ! pid_alive "$pid"; then
  echo "OpenDoc did not become ready within $startup_timeout seconds. Log:" >&2
  tail -n 40 "$RUN_DIR/server.log" >&2
  exit 1
fi

ready_line="$(grep -E 'OpenDoc is running at http://127\.0\.0\.1:[0-9]+' "$RUN_DIR/server.log" | tail -n 1 || true)"
node -e '
const fs=require("fs");
const run={
  pid: Number(process.argv[1]),
  origin: process.argv[2],
  port: Number(new URL(process.argv[2]).port),
  repo: process.argv[3],
  startedAt: new Date().toISOString(),
  readyLine: process.argv[4],
  command: "node --import tsx src/server/index.ts --production",
  env: { OPENDOC_PORT: process.argv[5] },
};
fs.writeFileSync(process.argv[6], JSON.stringify(run,null,2)+"\n");
' "$pid" "$origin" "$REPO_ROOT" "$ready_line" "$OPENDOC_PORT" "$RUN_DIR/run.json"

ready=true
echo "OpenDoc is ready at $origin (pid $pid)"
echo "Session file: $SESSION_FILE"
echo "Run record: $RUN_DIR/run.json"
if [[ -n "$ready_line" ]]; then
  echo "$ready_line"
fi
