# Theme specimen review

A theme specimen is a catalog preview, not a library document. A user lists themes, inspects Neutral, and exports or reviews its specimen PDF without creating a new document.

## Sub-features

- `theme-list` returns the shipped catalog including `neutral`.
- `theme-inspect` returns Neutral's name and guide path.
- `theme-preview` writes `output/themes/neutral.pdf`.
- `theme-review` prepares specimen review artifacts under `output/reviews/themes/neutral/`.

## How to get to it (user POV)

- In the browser, open Themes (`#themes`, nav `aria-label="Themes"`) and select Neutral.
- From a checkout terminal: `pnpm themes -- list`, `pnpm themes -- inspect neutral`, `pnpm themes -- preview neutral`.
- Review without the app: `pnpm exec tsx src/server/review-cli.ts -- --theme neutral --json`.
- In an installed workspace: `npx opendoc themes preview neutral --json` and `npx opendoc review --theme neutral --json`.

## Driving it with checkout CLIs

Preconditions:

- Repository root has `themes/neutral/`. The Normal server may be running but is not required for theme CLI preview/review.
- Do not edit `themes/neutral/` to force a pass.

- **List.** `pnpm themes -- list` prints JSON. An entry has `id: "neutral"` and no `error`.
- **Inspect.** `pnpm themes -- inspect neutral` includes `id`, `name`, and `paths` pointing at the theme folder.
- **Preview.** `pnpm themes -- preview neutral`. JSON `status` is `ready`, `pages` is greater than 0, and `output` is the absolute path to `output/themes/neutral.pdf`. The file exists and is a PDF.
- **Review.** `pnpm exec tsx src/server/review-cli.ts -- --theme neutral --json`. `status` is `ready`, `outputs.review` exists, and `visualReview` is `required`.
- **Library unchanged.** `GET <origin>/api/documents?view=summary` (if the server is up) still has only the shipped ids plus any disposable copies this run already created. A specimen is not a new document.
- **Proof.** Save list/inspect/preview/review JSON and the specimen PDF hash. Record that the specimen was not added to Documents.

## Gotchas

- Specimens are not user documents. Do not look for `neutral` in `/api/documents`.
- `pnpm themes -- preview` overwrites `output/themes/<id>.pdf`. Copy the file into evidence if the proof must survive later previews.
- `review --theme` and `themes preview` are different commands; say which one you ran.
- Other shipped theme ids (`opendoc-neutral`, `field-manual`, `civic-spectrum`, `mckinsey-consulting`) use the same recipe. Prove `neutral` unless the change names another theme.
