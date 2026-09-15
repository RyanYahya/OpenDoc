#!/usr/bin/env bash
# Read-only check: is the verification instance ours and worth driving?

set -euo pipefail
# shellcheck source=./common.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/common.sh"

require_node

if [[ ! -f "$RUN_DIR/run.json" ]]; then
  echo "No verification run record at $RUN_DIR/run.json. Start with helpers/launch.sh." >&2
  exit 1
fi

run_pid="$(node -p 'JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).pid' "$RUN_DIR/run.json")"
run_origin="$(node -p 'JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).origin' "$RUN_DIR/run.json")"

if ! pid_alive "$run_pid"; then
  echo "Recorded verification pid $run_pid is not running." >&2
  exit 1
fi

if ! session="$(session_json)"; then
  echo "Workspace session file is missing or invalid: $SESSION_FILE" >&2
  exit 1
fi

session_pid="$(node -p 'JSON.parse(process.argv[1]).pid' "$session")"
session_origin="$(node -p 'JSON.parse(process.argv[1]).origin' "$session")"
session_token="$(node -p 'JSON.parse(process.argv[1]).token' "$session")"

if [[ "$session_pid" != "$run_pid" ]]; then
  echo "Session pid $session_pid does not match this run's pid $run_pid. Refuse to drive a foreign instance." >&2
  exit 1
fi
if [[ "$session_origin" != "$run_origin" ]]; then
  echo "Session origin $session_origin does not match this run's origin $run_origin." >&2
  exit 1
fi

live="$(curl -fsS --max-time 3 "$session_origin/api/session")"
live_token="$(node -p 'JSON.parse(process.argv[1]).token' "$live")"
if [[ "$live_token" != "$session_token" ]]; then
  echo "GET /api/session token does not match .opendoc/server.json. The recorded session is stale." >&2
  exit 1
fi

html="$(curl -fsS --max-time 5 "$session_origin/")"
if ! printf '%s' "$html" | grep -q 'OpenDoc'; then
  echo "GET $session_origin/ did not return the OpenDoc client HTML." >&2
  exit 1
fi

docs="$(curl -fsS --max-time 10 "$session_origin/api/documents?view=summary")"
node -e '
const docs=JSON.parse(process.argv[1]);
const ids=new Set(docs.map(d=>d.id));
for (const id of ["welcome","welcome-presentation"]) {
  if (!ids.has(id)) { console.error("Library is missing "+id); process.exit(1); }
}
const welcome=docs.find(d=>d.id==="welcome");
if (welcome.status==="error") { console.error("welcome is in error: "+(welcome.error||"")); process.exit(1); }
' "$docs"

projects="$(curl -fsS --max-time 5 "$session_origin/api/projects")"
node -e '
const manifest=JSON.parse(process.argv[1]);
if (!manifest.projects?.some(p=>p.id==="getting-started")) { console.error("Project getting-started is missing."); process.exit(1); }
' "$projects"

doctor="$(node -e '
const docs=JSON.parse(process.argv[1]);
const summary=Object.fromEntries(docs.map(d=>[d.id,{status:d.status,name:d.name||d.artifact?.meta?.title||null,pages:d.artifact?.pages?.length||0,hash:d.artifact?.hash||null}]));
process.stdout.write(JSON.stringify({
  ok:true,
  origin:process.argv[2],
  pid:Number(process.argv[3]),
  node:process.version,
  htmlContainsOpenDoc:true,
  documents:summary,
  checkedAt:new Date().toISOString(),
},null,2)+"\n");
' "$docs" "$session_origin" "$run_pid")"

printf '%s\n' "$doctor"
printf '%s\n' "$doctor" > "$RUN_DIR/doctor.json"
echo "Doctor passed. Instance at $session_origin is this run's server (pid $run_pid)."
