#!/usr/bin/env bash
# Drive welcome-review-export: wait for Welcome, export its PDF through the live preview, review it.

set -euo pipefail
# shellcheck source=./common.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/common.sh"

require_node
"$helpers_dir/doctor.sh" >/dev/null

run_origin="$(node -p 'JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).origin' "$RUN_DIR/run.json")"
run_id="${VERIFY_RUN_ID:-$(date -u +%Y%m%dT%H%M%SZ)}"
evidence="$EVIDENCE_ROOT/$run_id"
mkdir -p "$evidence"

deadline=$((SECONDS + 90))
welcome=""
while (( SECONDS < deadline )); do
  welcome="$(curl -fsS --max-time 10 "$run_origin/api/documents/welcome")"
  status="$(node -p 'JSON.parse(process.argv[1]).status' "$welcome")"
  if [[ "$status" == "ready" ]]; then
    break
  fi
  if [[ "$status" == "error" ]]; then
    echo "welcome failed to render:" >&2
    node -p 'JSON.parse(process.argv[1]).error || "unknown error"' "$welcome" >&2
    exit 1
  fi
  sleep 0.5
done
if [[ "$(node -p 'JSON.parse(process.argv[1]).status' "$welcome")" != "ready" ]]; then
  echo "welcome did not become ready within 90 seconds." >&2
  exit 1
fi

hash="$(node -p 'JSON.parse(process.argv[1]).artifact.hash' "$welcome")"
pages="$(node -p 'JSON.parse(process.argv[1]).artifact.pages.length' "$welcome")"
title="$(node -p 'JSON.parse(process.argv[1]).artifact.meta.title' "$welcome")"

preview="$evidence/welcome-preview.pdf"
curl -fsS --max-time 30 "$run_origin/api/documents/welcome/pdf?hash=$hash" -o "$preview"
preview_hash="$(node -e 'const fs=require("fs"); const c=require("crypto"); process.stdout.write(c.createHash("sha256").update(fs.readFileSync(process.argv[1])).digest("hex"));' "$preview")"
if [[ "$preview_hash" != "$hash" ]]; then
  echo "Preview PDF hash $preview_hash does not match artifact hash $hash." >&2
  exit 1
fi

export_json="$(
  cd "$REPO_ROOT"
  pnpm exec tsx "$REPO_ROOT/src/server/export.ts" -- welcome --json
)"
export_status="$(node -p 'JSON.parse(process.argv[1]).results[0].status' "$export_json")"
export_path="$(node -p 'JSON.parse(process.argv[1]).results[0].path' "$export_json")"
export_source="$(node -p 'JSON.parse(process.argv[1]).results[0].source || ""' "$export_json")"
if [[ "$export_status" != "success" ]]; then
  echo "Export failed:" >&2
  printf '%s\n' "$export_json" >&2
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

review_json="$(
  cd "$REPO_ROOT"
  pnpm exec tsx "$REPO_ROOT/src/server/review-cli.ts" -- welcome --json
)"
review_status="$(node -p 'JSON.parse(process.argv[1]).status' "$review_json")"
if [[ "$review_status" != "ready" ]]; then
  echo "Review failed:" >&2
  printf '%s\n' "$review_json" >&2
  exit 1
fi

node -e '
const fs=require("fs");
const path=require("path");
const evidence=process.argv[1];
const welcome=JSON.parse(process.argv[2]);
const exported=JSON.parse(process.argv[3]);
const review=JSON.parse(process.argv[4]);
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
' "$evidence" "$welcome" "$export_json" "$review_json" "$RUN_DIR/run.json" "$RUN_DIR/doctor.json"

cp "$RUN_DIR/doctor.json" "$evidence/doctor.json"
if [[ -f "$RUN_DIR/server.log" ]]; then
  grep -E 'OpenDoc is running at http://127\.0\.0\.1:[0-9]+' "$RUN_DIR/server.log" | tail -n 1 > "$evidence/ready-line.txt" || true
fi

# Keep the preview PDF in evidence; workspace output/ is gitignored and cleanup may leave it.
# The preview file is already at welcome-preview.pdf.

echo "Drove welcome-review-export."
echo "Welcome: $title ($pages pages, hash $hash)"
echo "Export: $export_path (source=$export_source)"
echo "Evidence: $evidence"
echo "$evidence" > "$RUN_DIR/last-evidence-dir"
