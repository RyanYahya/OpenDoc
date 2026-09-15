#!/usr/bin/env bash
# Stop only the verification server this run started. Never kill by process name.
# Proof artifacts under evidence/ are left in place.

set -euo pipefail
# shellcheck source=./common.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/common.sh"

if [[ ! -f "$RUN_DIR/run.json" ]]; then
  echo "No verification run record at $RUN_DIR/run.json. Nothing to stop."
  echo "Evidence directory (untouched): $EVIDENCE_ROOT"
  exit 0
fi

run_pid="$(node -p 'JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).pid' "$RUN_DIR/run.json")"
run_origin="$(node -p 'JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).origin' "$RUN_DIR/run.json")"

if session="$(session_json 2>/dev/null)"; then
  session_pid="$(node -p 'JSON.parse(process.argv[1]).pid' "$session")"
  if [[ "$session_pid" != "$run_pid" ]]; then
    echo "Session file now belongs to pid $session_pid, not this run's pid $run_pid." >&2
    echo "Leaving that process alone. Removing only this run record." >&2
    rm -rf "$RUN_DIR"
    echo "Evidence directory (untouched): $EVIDENCE_ROOT"
    exit 1
  fi
fi

if pid_alive "$run_pid"; then
  kill -INT "$run_pid" 2>/dev/null || true
  deadline=$((SECONDS + 15))
  while pid_alive "$run_pid" && (( SECONDS < deadline )); do
    sleep 0.2
  done
  if pid_alive "$run_pid"; then
    kill -TERM "$run_pid" 2>/dev/null || true
    deadline=$((SECONDS + 10))
    while pid_alive "$run_pid" && (( SECONDS < deadline )); do
      sleep 0.2
    done
  fi
  if pid_alive "$run_pid"; then
    echo "Pid $run_pid did not exit after SIGINT/SIGTERM. Not sending SIGKILL; inspect it before retrying." >&2
    exit 1
  fi
fi

# The server removes .opendoc/server.json on a clean shutdown when it still owns the session.
if session="$(session_json 2>/dev/null)"; then
  leftover_pid="$(node -p 'JSON.parse(process.argv[1]).pid' "$session")"
  if [[ "$leftover_pid" == "$run_pid" ]]; then
    rm -f "$SESSION_FILE"
  fi
fi

rm -rf "$RUN_DIR"
echo "Stopped verification server pid $run_pid ($run_origin)."
echo "Evidence directory (untouched): $EVIDENCE_ROOT"
