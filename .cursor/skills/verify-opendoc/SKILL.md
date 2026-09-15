---
name: verify-opendoc
description: Drive OpenDoc's Normal browser workspace (and Headless CLI) to prove library, review, export, and comments behavior. Use after a checkout change, to reproduce a user-facing bug, or to confirm the real app still boots and produces PDFs/PPTX.
---

# Verify OpenDoc

OpenDoc is a local document-production app: a Normal-edition browser workspace plus a Headless CLI that share one engine. This skill drives the **real app**, not a mock.

**Primary surface:** Normal edition from a source checkout — production server + browser GUI (`pnpm start` after `pnpm build`, or the helper below).  
**Secondary surface:** Headless CLI on an initialized workspace (`npx opendoc check|review|export`). Use it when the task is remote file production with no browser. Do not treat Headless as a substitute for a Normal GUI proof when the change is the browser or the local service.

Document-authoring skills under `.agents/skills/opendoc-*` are not verification skills. Follow [VALIDATION.md](../../../VALIDATION.md) for release-scale checks; this skill is the repeatable drive loop.

## Surfaces and isolation

| Surface | Who uses it | Start | Drive |
| --- | --- | --- | --- |
| Normal (primary) | Browser library, reader, comments, export | Checkout: `pnpm start`. Installed workspace: `npx opendoc start --no-open` | HTTP `/api/*` (same contracts as `tests/http.test.ts`), checkout CLIs, then the GUI hashes/ARIA if you need a visible page |
| Headless (secondary) | Agent file production, no service | `npx --yes @ryanyahya/opendoc-headless init <empty-dir> --json` | `npx opendoc check\|review\|export --json` |

One workspace has one live session (`.opendoc/server.json`). Two servers cannot share a checkout. Always set `OPENDOC_PORT` (helpers default to `4318`) so a verification run does not steal port `4310` from a human session. **Refuse to drive a session this run did not start.**

The source checkout is a Normal workspace for `pnpm start` and `pnpm exec tsx src/server/*.ts`. It is **not** an initialized `npx opendoc` workspace (no `.opendoc/workspace.json`). Installed-workspace commands in VALIDATION.md stay on a disposable init, not this repo root.

Node must be **>= 24** (pin in `.node-version`). `pnpm` must be **12.3.4** (`packageManager` in `package.json`). Put that Node first on `PATH` if the environment also has Node 22.

## Launch

From the repository root, after a clean install:

```sh
pnpm install --frozen-lockfile
pnpm verify          # tsc + production build + tests; required before claiming the checkout boots
```

`pnpm start` needs `dist/` (the production client). `pnpm verify` and `pnpm build` create it. `pnpm dev` is the Vite development server on the same API; prefer production `pnpm start` for verification unless the change is the dev middleware.

**Helper (preferred for this skill):**

```sh
.cursor/skills/verify-opendoc/helpers/launch.sh
```

It starts `node --import tsx src/server/index.ts --production` with `OPENDOC_PORT=4318`, writes `/tmp/opendoc-verify-$UID/run/run.json`, and waits until `.opendoc/server.json` exists **and** `GET /api/session` returns that process's token.

An unsuccessful launch exits nonzero, stops its own child process, and retains the server log. A child that ignores termination is killed after five seconds. No ready run record is published without a successful session handshake.

**Ready signals (all three):**

1. Log line: `OpenDoc is running at http://127.0.0.1:<port>`
2. `.opendoc/server.json` contains `{ origin, token, pid }` for that process
3. `GET <origin>/api/session` returns the same `token`

Equivalent documented commands without the helper:

```sh
export OPENDOC_PORT=4318
pnpm start            # foreground; Ctrl-C stops it
# or, development server:
pnpm dev
```

Do not commit `.opendoc/server.json` (it holds a session token). `output/` and `.opendoc/` are gitignored.

**Headless launch (secondary):** there is no server. Initialize an empty folder, then each command is its own drive:

```sh
npx --yes @ryanyahya/opendoc-headless init /tmp/opendoc-headless-verify --json
cd /tmp/opendoc-headless-verify
npx opendoc check --json
```

Ready: `init --json` exits 0 and the folder has `.opendoc/workspace.json` with `edition: "headless"`.

## Doctor

Run this first whenever anything looks off:

```sh
.cursor/skills/verify-opendoc/helpers/doctor.sh
```

It is read-only. It must report all of:

- Recorded verification pid is alive
- `.opendoc/server.json` `pid` and `origin` match `run.json`
- `GET /api/session` token matches the session file (token is not printed to evidence)
- `GET /` HTML contains `OpenDoc`
- `GET /api/documents?view=summary` includes `welcome` and `welcome-presentation`
- `GET /api/projects` includes project `getting-started`

Manual equivalent:

```sh
origin=$(node -p 'JSON.parse(require("fs").readFileSync(".opendoc/server.json","utf8")).origin')
curl -fsS "$origin/api/session"
curl -fsS "$origin/api/documents?view=summary"
curl -fsS "$origin/"
```

If doctor fails, run cleanup and launch again. Do not continue against a foreign or half-started instance.

## Drive

Prefer existing harnesses, in this order:

1. **HTTP** on the live origin (GET needs no token; writes need `X-OpenDoc-Token` and `Origin: <origin>` — see `tests/http.test.ts`).
2. **Checkout CLIs** from the repo root (these do not need `npx opendoc`):
   - `pnpm exec tsx src/server/export.ts -- <id> --json`
   - `pnpm exec tsx src/server/review-cli.ts -- <id> --json`
   - `pnpm exec tsx src/server/review-cli.ts -- --theme <id> --json`
   - `pnpm themes -- preview <id>` / `pnpm themes -- list`
   - `pnpm comments -- list <id>` / `add` / `resolve` (add requires the live server in Normal)
3. **Repo tests** for a focused contract: `pnpm exec tsx --test tests/<name>.test.ts`
4. **Browser** only when the claim is the GUI. Routes are hash URLs; use ARIA names, not coordinates.

Stable Normal handles:

| User place | Handle |
| --- | --- |
| App origin | `http://127.0.0.1:<port>/` |
| Documents library | `#library` — nav link `aria-label="Documents"` |
| Presentations | `#presentations` |
| Getting started | `#project/getting-started` |
| Welcome reader | `#document/welcome` |
| Welcome presentation | `#document/welcome-presentation` |
| Themes / Templates / Assets | `#themes` `#templates` `#assets` |
| Export control | button `aria-label="Export document"` or `Export presentation` |
| Library list | `GET /api/documents` and `GET /api/documents?view=summary` |
| Current PDF bytes | `GET /api/documents/<id>/pdf?hash=<artifact.hash>` |
| Export via preview | `pnpm exec tsx src/server/export.ts -- <id> --json` while the server is up (`source` must be `"preview"`) |

Wait until `status === "ready"` before exporting. `status === "error"` is a failed render; do not export. First Welcome render after launch can take tens of seconds.

Feature recipes live in [features/](features/README.md). Drive one mapped feature per proof unless the task names others.

**One-feature helper used to prove this skill:**

```sh
.cursor/skills/verify-opendoc/helpers/drive-welcome-export.sh
```

**Headless drive (secondary):** from the initialized workspace, `npx opendoc review welcome --json` and `npx opendoc export welcome --json`. Review writes `output/reviews/documents/<id>/`. Exit 0 and `status: "ready"` mean artifacts were prepared; `visualReview` and `factualReview` stay `"required"`.

## Evidence

Write proof under `.cursor/skills/verify-opendoc/evidence/<run-id>/`. Default `run-id` is a UTC timestamp. Override with `VERIFY_RUN_ID` or `VERIFY_EVIDENCE_DIR`.

Minimum for a Normal proof:

- Launch: origin, pid, ready log line, `OPENDOC_PORT`
- Doctor JSON (`ok: true`, library ids, node version)
- The action: export/review JSON, HTTP status, or CLI exit code
- The resulting state: artifact hash, page/slide count, output path, and a second read (file hash or `GET` of the document)
- Extracted-text excerpt or page-image path when review ran

Standards:

- Exercise the user path (live preview export, GUI hash, or documented CLI), not an internal setter
- Capture the action **and** the resulting file/state
- When the server is up, PDF export must report `source: "preview"` and the file hash must equal `artifact.hash`
- Do not store `.opendoc/server.json` or the session token in evidence
- `visualReview: "required"` is not a passed visual review — say so

`output/` is workspace scratch and gitignored. Copy anything you need to keep into `evidence/<run-id>/` **before** cleanup.

## Cleanup

```sh
.cursor/skills/verify-opendoc/helpers/cleanup.sh
```

Stops **only** the pid in `run.json`, and only if `.opendoc/server.json` still names that pid. Sends SIGINT (the same signal as Ctrl-C), then SIGTERM. It does not `pkill`, does not match process names, does not delete `evidence/`, and does not delete `output/` or authored documents.

After cleanup, confirm the evidence directory still exists at the path printed by the drive helper.

If launch or drive fails mid-run, still run cleanup so port `4318` and `server.json` are not left behind.

## Helpers

All scripts are executable. Run them from any cwd; they locate the repo by walking to `package.json` name `@ryanyahya/opendoc`.

| Script | Purpose |
| --- | --- |
| `helpers/launch.sh` | Start the production server on `OPENDOC_PORT` (default 4318) |
| `helpers/doctor.sh` | Read-only health check; writes `$VERIFY_RUN_DIR/doctor.json` |
| `helpers/drive-welcome-export.sh` | Doctor → Welcome ready → preview PDF → preview export → review → evidence |
| `helpers/cleanup.sh` | Stop this run's pid; leave evidence |

Environment:

| Variable | Default | Role |
| --- | --- | --- |
| `OPENDOC_PORT` | `4318` | Listen port; set this so a human session on 4310 is untouched |
| `VERIFY_RUN_DIR` | `/tmp/opendoc-verify-$UID/run` | pid/log scratch; deleted on cleanup |
| `VERIFY_EVIDENCE_DIR` | `.cursor/skills/verify-opendoc/evidence` | Durable proof; never deleted by cleanup |
| `VERIFY_RUN_ID` | UTC timestamp | Evidence subdirectory name |
| `VERIFY_REPO_ROOT` | discovered | Override if the working directory is outside the repo |
| `VERIFY_STARTUP_TIMEOUT_SECONDS` | `60` | Positive integer deadline for the startup handshake |

## After a change

Keep the [feature map](features/README.md) honest as routes and CLIs change. Use `/maintain-verification-skill` for that loop.
