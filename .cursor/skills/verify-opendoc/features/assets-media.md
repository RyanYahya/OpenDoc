# Assets and document media

Logos and fonts are shared library families with immutable revisions; documents bind exact revisions. Images and charts belong to one document's `media/` folder, and derived charts must be reviewed and recorded before export.

## Sub-features

- `asset-list` lists bundled fonts (Geist, Inter, Roboto, Open Sans, Lato, Merriweather, Noto Naskh Arabic) and the OpenDoc logo.
- `asset-import-font` imports static TTF/OTF faces and checks a PDF specimen.
- `asset-revision` changes a family only with the current `--expected-revision`; a stale revision is refused.
- `asset-bind` pins a logo or font revision to a document; `unbind` removes it.
- `asset-defaults` reads and writes a theme's defaults for new documents.
- `media-import` / `media-record` / `media-check` add a document image and track its freshness.

## How to get to it (user POV)

- In the browser: **Media & Assets** (`#assets`) with **Logos**, **Fonts**, and **Media** tabs; a theme's **Assets for new documents** section.
- Installed workspace, either edition: `npx opendoc assets ...` and `npx opendoc media ...`.

## Driving it with the Headless CLI

Preconditions:

- A throwaway Headless workspace. Copy the bundled OFL Geist faces (`node_modules/opendoc/starter/assets/fonts/geist/files/*.ttf`: regular, medium, and bold) to a scratch folder; never import from inside `assets/` itself.

- **List.** `npx opendoc assets list font --json` includes `geist` and `noto-naskh-arabic`.
- **Import.** `npx opendoc assets import font --id verify-sans --name "Verify Sans" --file <face-1>.ttf --file <face-2>.ttf --file <face-3>.ttf --json` publishes a family with a revision, a specimen, and `defaultEligible: true`; a single regular face imports but cannot be bound as a body or heading font.
- **Conflict.** `npx opendoc assets add-faces verify-sans --file <face-1>.ttf --expected-revision 0000 --json` is refused without changing the family.
- **Bind.** `npx opendoc assets bind welcome heading-font verify-sans --json`, then `npx opendoc review welcome --json`; `documents/welcome/assets.json` names the exact revision. `assets unbind welcome heading-font --json` removes it.
- **Defaults.** `npx opendoc assets defaults neutral --json` returns `{ defaults, revision }`.
- **Media.** `npx opendoc media import welcome verify-image --file <png> --title "Verify" --description "Verification image" --json`, then `media list welcome --json` and `media check welcome verify-image --json` (`freshness: "original"`).
- **Proof.** Save each JSON result and the review's page image showing the bound font.

## Gotchas

- Copy the real `revision` from `inspect`; placeholders are not values.
- Archive never deletes; `assets restore` brings a family back. Leave `--clear-defaults` off unless clearing defaults is intended.
- `media record` snapshots hashes only; record after reviewing the image, never to silence a stale warning.
- A binding proves availability, not use; check the page image.
