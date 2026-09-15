# Presentation PDF and PowerPoint export

The shipped welcome presentation is a 16:9 deck. A user opens it, exports the reviewed PDF, and also exports an editable PowerPoint whose slide count matches the PDF.

## Sub-features

- `deck-open` loads `welcome-presentation` until `status` is `ready`.
- `deck-pdf` exports `output/welcome-presentation.pdf` from the live preview.
- `deck-pptx` exports `output/welcome-presentation.pptx` with `--format pptx`.
- `deck-geometry` confirms each PDF page is 960 × 540.

## How to get to it (user POV)

- In the browser, open Presentations (`#presentations`) or Getting started and choose the welcome presentation.
- Open `#document/welcome-presentation`.
- Choose Export (`aria-label="Export presentation"`), pick PDF or PowerPoint (.pptx), and save.
- From a checkout terminal, with the server running:
  - `pnpm exec tsx src/server/export.ts -- welcome-presentation --json`
  - `pnpm exec tsx src/server/export.ts -- welcome-presentation --format pptx --json`
- In Headless: `npx opendoc export welcome-presentation --json` and `npx opendoc export welcome-presentation --format pptx --json`.

## Driving it with HTTP and checkout CLIs

Preconditions:

- Normal server started by this run; `helpers/doctor.sh` reports `welcome-presentation` in the library.
- Do not overwrite a human's `output/welcome-presentation.*` without copying prior proof elsewhere.

- **Open the deck.** `GET <origin>/api/documents/welcome-presentation` until `status` is `ready`. `artifact.format` is `presentation`. Every page has `width` 960 and `height` 540.
- **Preview PDF.** `GET <origin>/api/documents/welcome-presentation/pdf?hash=<artifact.hash>` returns 200. Body SHA-256 equals `artifact.hash`.
- **Export PDF.** `pnpm exec tsx src/server/export.ts -- welcome-presentation --json`. `status` is `success`, `source` is `preview`, `pages` equals `artifact.pages.length`, and the file hash matches.
- **Export PowerPoint.** `pnpm exec tsx src/server/export.ts -- welcome-presentation --format pptx --json`. `status` is `success` and `path` ends with `.pptx`. The file is a ZIP (`PK` header).
- **Package check.** `unzip -l output/welcome-presentation.pptx` lists `ppt/slides/slide1.xml` through `slideN.xml` where N equals the PDF page count. Native PowerPoint appearance is unverified unless PowerPoint is actually opened — say so.
- **Proof.** Save both CLI JSON results, both file hashes, the slide/page count, and whether native PowerPoint was inspected.

## Gotchas

- PPTX is rejected for ordinary documents. Only `format: "presentation"` ids accept `--format pptx`.
- PDF and PPTX must come from the same ready revision. If the document re-renders between the two exports, re-GET and redo both.
- A remote environment without PowerPoint can finish ZIP/slide-count checks and must report that native appearance was not verified. Do not substitute the PDF for a failed PPTX.
- Headless `export` uses direct render (`source: "render"`). That is valid for a Headless proof and is not a Normal preview proof.
