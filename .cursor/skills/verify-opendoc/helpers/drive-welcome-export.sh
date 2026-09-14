#!/usr/bin/env bash
# Drive welcome-review-export: wait for Welcome, export its PDF through the live preview, review it.
# Large API/review payloads are written to files; never passed on the argv.

set -euo pipefail
# shellcheck source=./common.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/common.sh"

require_node
"$helpers_dir/doctor.sh" >/dev/null

run_origin="$(node -p 'JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).origin' "$RUN_DIR/run.json")"
run_id="${VERIFY_RUN_ID:-$(date -u +%Y%m%dT%H%M%SZ)}"
evidence="$EVIDENCE_ROOT/$run_id"
scratch="$RUN_DIR/drive-welcome"
mkdir -p "$evidence" "$scratch"

json_field() {
  node -e 'const fs=require("fs"); const value=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));
    const path=process.argv[2].split(".");
    let cur=value; for (const key of path) cur=cur?.[key];
    if (cur===undefined||cur===null) process.exit(2);
    process.stdout.write(String(cur));' "$1" "$2"
}

deadline=$((SECONDS + 90))
while (( SECONDS < deadline )); do
  curl -fsS --max-time 10 "$run_origin/api/documents?view=summary" -o "$scratch/summary.json"
  status="$(node -e 'const docs=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));
    const welcome=docs.find(d=>d.id==="welcome");
    if (!welcome) process.exit(2);
    process.stdout.write(welcome.status);' "$scratch/summary.json")"
  if [[ "$status" == "ready" ]]; then
    break
  fi
  if [[ "$status" == "error" ]]; then
    echo "welcome failed to render:" >&2
    node -e 'const docs=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));
      console.error(docs.find(d=>d.id==="welcome")?.error || "unknown error");' "$scratch/summary.json" >&2
    exit 1
  fi
  sleep 0.5
done
if [[ "$status" != "ready" ]]; then
  echo "welcome did not become ready within 90 seconds." >&2
  exit 1
fi

curl -fsS --max-time 30 "$run_origin/api/documents/welcome" -o "$scratch/welcome.json"
hash="$(json_field "$scratch/welcome.json" artifact.hash)"
pages="$(json_field "$scratch/welcome.json" artifact.pages.length)"
title="$(json_field "$scratch/welcome.json" artifact.meta.title)"

preview="$evidence/welcome-preview.pdf"
curl -fsS --max-time 30 "$run_origin/api/documents/welcome/pdf?hash=$hash" -o "$preview"
preview_hash="$(node -e 'const fs=require("fs"); const c=require("crypto"); process.stdout.write(c.createHash("sha256").update(fs.readFileSync(process.argv[1])).digest("hex"));' "$preview")"
if [[ "$preview_hash" != "$hash" ]]; then
  echo "Preview PDF hash $preview_hash does not match artifact hash $hash." >&2
  exit 1
fi

(
  cd "$REPO_ROOT"
  pnpm exec tsx "$REPO_ROOT/src/server/export.ts" -- welcome --json
) > "$scratch/export.json"
export_status="$(json_field "$scratch/export.json" results.0.status)"
export_path="$(json_field "$scratch/export.json" results.0.path)"
export_source="$(json_field "$scratch/export.json" results.0.source)"
if [[ "$export_status" != "success" ]]; then
  echo "Export failed:" >&2
  cat "$scratch/export.json" >&2
  exit 1
fi
if [[ "$export_source" != "preview" ]]; then
  echo "Expected export to reuse the live GUI preview (source=preview). Got: $export_source" >&2
  exit 1
fi

export_file_hash="$(node -e 'const fs=require("fs"); const c=require("crypto"); process.stdout.write(c.createHash("sha256").update(fs.readFileSync(process.argv[1])).digest("hex"));' "$export_path")"
if [[ "$export_file_hash" != "$hash" ]]; then
  echo "Exported file hash $export_file_hash does not match preview hash $hash." >&2
  exit 1
fi

(
  cd "$REPO_ROOT"
  pnpm exec tsx "$REPO_ROOT/src/server/review-cli.ts" -- welcome --json
) > "$scratch/review.json"
review_status="$(json_field "$scratch/review.json" status)"
if [[ "$review_status" != "ready" ]]; then
  echo "Review failed:" >&2
  cat "$scratch/review.json" >&2
  exit 1
fi

node -e '
const fs=require("fs");
const path=require("path");
const evidence=process.argv[1];
const welcome=JSON.parse(fs.readFileSync(process.argv[2],"utf8"));
const exported=JSON.parse(fs.readFileSync(process.argv[3],"utf8"));
const review=JSON.parse(fs.readFileSync(process.argv[4],"utf8"));
const run=JSON.parse(fs.readFileSync(process.argv[5],"utf8"));
const doctor=JSON.parse(fs.readFileSync(process.argv[6],"utf8"));
const textPath=review.outputs && review.outputs.text;
const excerpt=textPath && fs.existsSync(textPath) ? fs.readFileSync(textPath,"utf8").slice(0,800) : "";
const compactReview={
  status:review.status,
  id:review.id,
  pageCount:review.pageCount,
  hash:review.hash,
  visualReview:review.visualReview,
  factualReview:review.factualReview,
  outputs:review.outputs,
};
const proof={
  feature:"welcome-review-export",
  runId:path.basename(evidence),
  checkedAt:new Date().toISOString(),
  launch:{origin:run.origin,pid:run.pid,readyLine:run.readyLine,command:run.command,port:run.port},
  doctor,
  welcome:{id:welcome.id,status:welcome.status,title:welcome.artifact.meta.title,pages:welcome.artifact.pages.length,hash:welcome.artifact.hash},
  export:exported.results[0],
  review:compactReview,
  extractedTextExcerpt:excerpt,
  notes:[
    "visualReview and factualReview remain required; this proof is technical readiness plus artifact hashes.",
    "Session token is intentionally omitted from evidence.",
  ],
};
fs.writeFileSync(path.join(evidence,"proof.json"), JSON.stringify(proof,null,2)+"\n");
fs.writeFileSync(path.join(evidence,"export.json"), JSON.stringify(exported,null,2)+"\n");
fs.writeFileSync(path.join(evidence,"review.json"), JSON.stringify(compactReview,null,2)+"\n");
if (excerpt) fs.writeFileSync(path.join(evidence,"welcome-text-excerpt.txt"), excerpt);
' "$evidence" "$scratch/welcome.json" "$scratch/export.json" "$scratch/review.json" "$RUN_DIR/run.json" "$RUN_DIR/doctor.json"

cp "$RUN_DIR/doctor.json" "$evidence/doctor.json"
if [[ -f "$RUN_DIR/server.log" ]]; then
  grep -E 'OpenDoc is running at http://127\.0\.0\.1:[0-9]+' "$RUN_DIR/server.log" | tail -n 1 > "$evidence/ready-line.txt" || true
fi

echo "Drove welcome-review-export."
echo "Welcome: $title ($pages pages, hash $hash)"
echo "Export: $export_path (source=$export_source)"
echo "Evidence: $evidence"
echo "$evidence" > "$RUN_DIR/last-evidence-dir"
