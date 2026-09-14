# Welcome review and PDF export

Welcome to OpenDoc is the shipped Getting started document. A user opens it in the library, waits for the live PDF preview, exports that exact PDF, and can prepare page images and extracted text for review.

## Sub-features

- `welcome-open` loads `welcome` from the library until `status` is `ready`.
- `welcome-preview` returns the current preview PDF bytes whose SHA-256 equals `artifact.hash`.
- `welcome-export-preview` writes `output/welcome.pdf` from the live GUI preview (`source: "preview"`).
- `welcome-review` prepares review artifacts with `status: "ready"` and `visualReview: "required"`.

## How to get to it (user POV)

- In the browser, open Documents (`#library`) or Getting started (`#project/getting-started`) and choose **Welcome to OpenDoc**.
- Open the reader at `#document/welcome`.
- Choose Export (`aria-label="Export document"`) and Save PDF.
- From a checkout terminal: `pnpm exec tsx src/server/export.ts -- welcome --json` while the server is running.
- From a checkout terminal: `pnpm exec tsx src/server/review-cli.ts -- welcome --json`.
- In an installed or Headless workspace: `npx opendoc export welcome --json` and `npx opendoc review welcome --json`.

## Driving it with HTTP and checkout CLIs

Preconditions:

- Normal server started by `helpers/launch.sh` and `helpers/doctor.sh` reports `ok: true`.
- `welcome` is assigned to project `getting-started`.
- Evidence directory `.cursor/skills/verify-opendoc/evidence/<run-id>/` exists or will be created.

- **Open Welcome.** `GET <origin>/api/documents/welcome` until `status` is `ready`. The artifact title is `Welcome to OpenDoc` and `artifact.pages.length` is greater than 0.
- **Read the preview.** `GET <origin>/api/documents/welcome/pdf?hash=<artifact.hash>` returns `200` and `application/pdf`. SHA-256 of the body equals `artifact.hash`.
- **Export through the live preview.** From the repo root run `pnpm exec tsx src/server/export.ts -- welcome --json`. Exit code `0`, `results[0].status` is `success`, `results[0].source` is `preview`, and `results[0].path` ends with `output/welcome.pdf`.
- **Confirm the file.** SHA-256 of `output/welcome.pdf` equals `artifact.hash` and `results[0].pages` equals `artifact.pages.length`.
- **Prepare review.** Run `pnpm exec tsx src/server/review-cli.ts -- welcome --json`. Exit code `0` and `status` is `ready`. `outputs.pdf`, `outputs.review`, and `outputs.text` exist. `visualReview` and `factualReview` are `required`.
- **Helper.** `helpers/drive-welcome-export.sh` runs the steps above and writes `proof.json` into `evidence/<run-id>/`.
- **Proof.** Keep `proof.json`, the ready log line, `export.json`, compact `review.json`, a text excerpt, and the preview PDF hash. After cleanup, those files must still be at the printed evidence path.

## Gotchas

- The full `GET /api/documents/welcome` body is too large for a shell argv. Write it to a file and read fields from disk (the drive helper does this). Poll readiness with `?view=summary`.
- First render after launch is not instant. Poll `status`; do not treat a `rendering` document as failed.
- A `409` on export means the preview hash is stale or the document is in error. Re-GET the document and retry with the new hash.
- While the Normal server is up, checkout `export.ts` must use the preview. If `source` is `render`, the GUI was not authoritative — doctor the session before claiming a Normal proof.
- `npx opendoc review` does not work from this checkout root (no workspace marker). Use `pnpm exec tsx src/server/review-cli.ts` here, or Headless init for `npx opendoc`.
- Review `status: "ready"` is not a completed visual or factual review.
- Do not edit `documents/welcome/` to make a proof pass.
