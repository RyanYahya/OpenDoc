# Third-party notices

- **Forme 0.20.1**: shared React serializer, JavaScript definitions, and PDF rendering through repaired Node WASM. OpenDoc carries PDF text-writer and embedded font-subset metadata repairs in core 0.20.1-opendoc.3; both editions bundle the same repaired Node engine. Source patches, rebuild instructions, and MIT license are in `vendor/formepdf/`; the source repository also retains the rebuild archive, excluded from runtime packages. The attributed asset resolver in `src/rendering/resolve-sources.ts` is adapted from `@formepdf/renderer` 0.20.1 under that MIT license (Daniel Molitor, 2026); OpenDoc supplies its own TSX bundling and source-location capture. Original imported font files remain unchanged. https://github.com/formepdf/forme
- **PDF.js**: PDF preview, review page rendering, and text extraction. Apache-2.0. https://github.com/mozilla/pdf.js
- **@napi-rs/canvas 1.0.8**: Skia-backed Node canvas for PDF review page PNGs, without a browser. MIT; native dependencies retain their upstream notices. https://github.com/Brooooooklyn/canvas
- **Base UI 1.8.0**: accessible interface controls. MIT. https://github.com/mui/base-ui
- **React** and **Vite**: interface and development server. Their licenses are included in the installed packages.
- **ts-pptx 3.7.0**: editable PowerPoint generation. MIT. https://github.com/shbernal/ts-pptx
- **ttf2eot 3.1.0**: embedded TrueType font packaging for PowerPoint. MIT. https://github.com/fontello/ttf2eot
- **fontkit 2.0.4**: font inspection and metadata. MIT. https://github.com/foliojs/fontkit
- **resvg-js 2.6.2**: SVG rasterization. MPL-2.0; distributed through its installed package, with upstream source and notices at https://github.com/yisibl/resvg-js

## Bundled fonts

OpenDoc Sans, OpenDoc Serif, and OpenDoc Mono are renamed derivatives of Adobe Source Sans 3, Source Serif 4, and Source Code Pro, distributed under the SIL Open Font License 1.1. The original notices and licenses are retained beside the fonts in `assets/fonts/`. Sans and Serif include regular, semibold, italic, and semibold italic faces. Mono includes a regular face for code specimens.

These historical derivatives removed GSUB, GPOS, and legacy kern tables to work around the original Forme 0.20.1 writer's ligature and spacing bugs. The engine now fixes those bugs directly; the existing derivatives are retained unchanged for document continuity. Outlines are unchanged; these variants intentionally use unkerned character spacing. Family and PostScript names are renamed to respect the reserved name “Source”. The derived font software remains under OFL 1.1.

These checked-in derivatives retain their existing metrics for built-in themes. New font imports preserve the original files and shaping tables and are checked through the repaired PDF engine. The app needs no font conversion tools. Upstream sources:

- https://github.com/adobe-fonts/source-sans/tree/release/TTF
- https://github.com/adobe-fonts/source-serif/tree/release/TTF
- https://github.com/adobe-fonts/source-code-pro/tree/release/TTF

## Google Fonts asset families

Inter, Roboto, Open Sans, Lato, and Merriweather are bundled as shared font assets under the SIL Open Font License 1.1. Each includes regular (400), semibold (600), bold (700), and the corresponding italic styles. These are Google-supplied static TTF files preserved byte for byte, not OpenDoc derivatives. The app makes no network request to use or inspect them.

Each `assets/fonts/<family-id>/` folder retains `OFL.txt` with the original copyright notice and `source.json` with the exact download URLs, SHA-256 hashes, original filenames, and their managed asset paths. Lato comes from a pinned revision of the official `google/fonts` repository; the other four use the static TTF responses from the official Google Fonts CSS API, served by `fonts.gstatic.com`.

- Inter: https://fonts.google.com/specimen/Inter
- Roboto: https://fonts.google.com/specimen/Roboto
- Open Sans: https://fonts.google.com/specimen/Open+Sans
- Lato: https://fonts.google.com/specimen/Lato
- Merriweather: https://fonts.google.com/specimen/Merriweather

The bundled revisions include PDF compatibility results and specimens. The app uses those checks to determine eligibility for theme defaults; `tests/bundled-fonts.test.ts` and `tests/font-renderer.test.ts` cover the bundled files and text rendering, while `tests/font-subset.test.ts` checks metadata in the actual embedded font streams. Original font files, names, shaping tables, and hashes are preserved.

## Geist and interface fonts

Geist is distributed under SIL OFL 1.1. Its copyright and license are retained in `assets/ui-fonts/geist/OFL.txt` and `assets/fonts/geist/OFL.txt`. The interface uses variable WOFF2 files from `@fontsource-variable/geist` 5.3.0, with package provenance and exact hashes in `assets/ui-fonts/geist/source.json`. The shared document asset contains static regular, medium, and bold faces, with hashes and a PDF specimen recorded in its immutable revision. Upstream: https://github.com/vercel/geist-font

The retained Inter UI TTF files carry their own OFL notice, original URLs, and hashes in `assets/fonts/InterUI-LICENSE.txt` and `assets/fonts/InterUI-source.json`.

## OpenDoc examples and branding

The welcome document and presentation contain OpenDoc demo artwork and synthetic chart data. Their media metadata identifies the AI-generated paper illustration and the chart's data and recipe. They contain no customer records. OpenDoc-authored source and example assets follow the repository's MIT license; bundled font software retains its separate OFL license. The OpenDoc wordmark is project artwork.

The McKinsey Consulting theme is an independent interpretation of analytical publication conventions. It contains no McKinsey logo or proprietary font and does not imply affiliation or endorsement. Other theme and template specimens use illustrative content; their design guides retain relevant research references.
