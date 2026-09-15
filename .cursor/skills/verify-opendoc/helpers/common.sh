#!/usr/bin/env bash
# Shared paths and checks for verify-opendoc helpers. Source this file; do not execute it.

set -euo pipefail

helpers_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILL_DIR="$(cd "$helpers_dir/.." && pwd)"

find_repo_root() {
  local dir="${VERIFY_REPO_ROOT:-$PWD}"
  dir="$(cd "$dir" && pwd)"
  while [[ "$dir" != "/" ]]; do
    if [[ -f "$dir/package.json" ]] && grep -q '"name": "@ryanyahya/opendoc"' "$dir/package.json"; then
      printf '%s\n' "$dir"
      return 0
    fi
    dir="$(dirname "$dir")"
  done
  echo "Could not find the OpenDoc repository root (package name @ryanyahya/opendoc)." >&2
  return 1
}

REPO_ROOT="$(find_repo_root)"
RUN_DIR="${VERIFY_RUN_DIR:-${TMPDIR:-/tmp}/opendoc-verify-${UID:-$USER}/run}"
EVIDENCE_ROOT="${VERIFY_EVIDENCE_DIR:-$SKILL_DIR/evidence}"
SESSION_FILE="$REPO_ROOT/.opendoc/server.json"
DEFAULT_PORT="${OPENDOC_PORT:-4318}"

require_node() {
  if ! command -v node >/dev/null 2>&1; then
    echo "node is not on PATH. Install Node.js $(tr -d '[:space:]' < "$REPO_ROOT/.node-version") or newer." >&2
    return 1
  fi
  local major
  major="$(node -p 'Number(process.versions.node.split(".")[0])')"
  if (( major < 24 )); then
    echo "OpenDoc requires Node.js 24 or newer (see .node-version). Current: $(node -v)" >&2
    echo "If this environment also has Node 22 on PATH, put Node 24 first." >&2
    return 1
  fi
}

session_json() {
  if [[ ! -f "$SESSION_FILE" ]]; then
    return 1
  fi
  node -e 'const fs=require("fs"); const s=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));
    if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(s.origin||"") || typeof s.token!=="string" || !s.token || !Number.isSafeInteger(s.pid)) process.exit(2);
    process.stdout.write(JSON.stringify({origin:s.origin,pid:s.pid,token:s.token}));' "$SESSION_FILE"
}

pid_alive() {
  local pid="$1"
  [[ "$pid" =~ ^[0-9]+$ ]] && kill -0 "$pid" 2>/dev/null
}

write_json() {
  local dest="$1"
  shift
  node -e 'const fs=require("fs"); const dest=process.argv[1]; const value=JSON.parse(process.argv[2]);
    fs.mkdirSync(require("path").dirname(dest),{recursive:true});
    fs.writeFileSync(dest, JSON.stringify(value,null,2)+"\n");' "$dest" "$*"
}
