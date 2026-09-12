# Media & Assets

OpenDoc keeps reusable **Logos** and **Fonts** in a shared workspace library. **Media** remains owned by its document: photographs, illustrations, charts, and diagrams retain their prepared data, recipes, and evidence. Do not copy a shared logo or font into every document. Original reference material stays wherever the surrounding project manages it.

The app and `npx opendoc assets` operate on the same local records, import checks, and conflict protection. Selecting a library item tells the agent what the user is looking at; it does not apply it to any document or theme.

Run commands from the workspace root. Asset, theme, document, and output paths in this guide refer to that workspace; this guide is installed under `node_modules/opendoc/docs`.

## Start from the document

1. Resolve the intended document and read fresh `.opendoc/current.json` when the user refers to the current selection.
2. Discover with `npx opendoc assets list`. Inspect only the relevant family to read its variations, guidance, compatibility, paths, relationships, and authoring examples.
3. Bind the chosen asset to the document. This saves an exact version immediately. Choose a logo variation from its guidance and the actual PDF background, never from the app's light/dark appearance.
4. Use `Logo` or the document's semantic fonts, render, and review the resulting PDF. A binding makes an asset available; it is not proof that the PDF uses it.

```sh
npx opendoc assets list logo
npx opendoc assets inspect logo acme
npx opendoc assets bind my-report logo acme --variation default
```

The supported binding roles are `logo`, `body-font`, and `heading-font`. For example, bind an imported, eligible family with `npx opendoc assets bind my-report body-font acme-sans`. Use `--name partner` with the `logo` role to add a named logo instead of changing the preferred logo. `--revision <revision>` chooses a historical version; omission captures the current version at binding time. Repeating `bind` is an explicit update. `unbind <document> <role>` removes that choice; add `--name <binding>` when removing a named logo.

## Logos: one identity, several variations

In the app, choose **Add logo**, enter a name, then upload the default SVG or PNG. The logo opens as a folder with that default file. Use **Add variations** inside the folder to select one or more additional files together; names are suggested from filenames and can be edited before uploading. A family can mix SVG and PNG originals, with user-defined variation names and optional **When to use** descriptions. “On light backgrounds” and “On dark backgrounds” are suggestions, not fixed categories.

```sh
npx opendoc assets import logo --id acme --name "Acme" --description "Use for Acme publications." --file /path/to/acme.png --variation-name "On light backgrounds" --variation-description "Dark mark for white or pale surfaces."
npx opendoc assets inspect logo acme
npx opendoc assets add-variation acme --id on-dark --name "On dark backgrounds" --description "White mark for dark surfaces." --file /path/to/acme-white.svg --expected-revision <current-revision>
```

Copy the real revision returned by inspection; angle-bracket placeholders in this guide are not literal values. The first variation's stable ID is `default`, even when its display name is “On light backgrounds.” Names and guidance can change without changing family or variation IDs. To replace a variation's file, use `add-variation` with `--replace <variation-id>`, the desired name, and the latest `--expected-revision`. Replacement preserves the variation's identity and publishes a new family version.

Use a JSON file for revisions instead of long sets of metadata flags:

```json
{
  "expectedRevision": "copy-the-current-revision-from-inspect",
  "description": "Brand guidance for the agent.",
  "defaultVariation": "on-dark",
  "variation": {
    "id": "on-dark",
    "name": "On dark backgrounds",
    "description": "Use the white mark on dark navy or black backgrounds."
  }
}
```

```sh
npx opendoc assets revise logo acme --metadata /path/to/logo-update.json
```

Omit unchanged fields. The revision operation also accepts `name`, `removeVariation`, or `removeFace` for the relevant asset kind. Keep at least one usable variation or face, and select an existing default variation. Concurrent changes produce a conflict; inspect again and reconcile the intended edit instead of blindly retrying old metadata.

The logo folder shows all variations as file tiles. Select a file to preview it, edit its name or guidance, replace it, make it the default, or remove it. Removing the default requires choosing a replacement; every logo keeps at least one variation. If a batch upload stops on an invalid file, successful files stay saved and the remaining upload list stays open for correction and retry. Its light, dark, and transparency backgrounds are inspection aids. They do not recolor artwork or choose the PDF variation. Preview and PDF use the same prepared PNG. SVG originals are preserved and prepared locally through resvg, with proportions and transparency retained. Unsupported external resources or unresolved text fonts produce a useful import error. Supply self-contained artwork with text converted to outlines when necessary. SVG imports are limited to 5 MB; PNG imports to 50 MB.

### Place a logo

```tsx
import { Figure, Logo } from 'opendoc';

// The preferred document binding; omission of variation uses its saved default.
<Logo width={120} />

// A deliberate variation, identified by its stable ID from inspection.
<Logo variation="on-dark" width={120} alt="Acme" />

// A second logo bound with --name partner.
<Figure id="partner-mark" caption="Delivery partner">
  <Logo name="partner" width={100} height={48} />
</Figure>
```

Width is required and measured in PDF points. Optional height is a maximum bound; the image retains its aspect ratio. An omitted variation uses the binding's explicit variation, otherwise the saved revision's default. Missing bindings and unknown variations fail with an actionable error. Logo placement is always explicit; a theme default does not add a logo to the page automatically. Preserve the enclosing block ID when replacing artwork so feedback stays attached.

## Fonts: actual files, actual PDF checks

Import static TTF/OTF faces from one family together, with repeated `--file` flags. The app asks only for font files. OpenDoc reads their family name, embedded English description (when present), weight, and style, then renders and checks a PDF specimen. A font without an embedded description stays blank; optional agent guidance can be edited later. Variable fonts, font collections, and web-font conversion are outside this release.

```sh
npx opendoc assets import font --id acme-sans --file /path/to/AcmeSans-Regular.ttf --file /path/to/AcmeSans-Bold.ttf --file /path/to/AcmeSans-Italic.ttf
npx opendoc assets inspect font acme-sans
npx opendoc assets add-faces acme-sans --file /path/to/AcmeSans-BoldItalic.ttf --expected-revision <current-revision>
npx opendoc assets bind my-report body-font acme-sans
npx opendoc assets bind my-report heading-font acme-sans
```

Import at most 24 faces and 100 MB at once. Added faces must belong to the existing embedded font family, even when replacing every face; import a different family separately. Original files are preserved; OpenDoc does not rewrite font tables or synthesize missing faces. General body and heading defaults require a regular face plus a semibold or bold face and passing compatibility checks. A family needing attention can remain in the library for inspection, but cannot become a body/heading default. Missing styles are visible in the family detail; explicitly requesting an unavailable weight or italic style fails when rendering. A semibold request can use a real bold face of the same style when semibold is absent; it retains that face's actual weight.

Inter, Roboto, Open Sans, Lato, and Merriweather are included in the library, each with regular, semibold, bold, italic, semibold italic, and bold italic faces. Their Google-supplied static TTF files are preserved, with an OFL license and download provenance in each family folder. Their retained bundled revisions contain passing compatibility results and reviewed specimens from the repaired PDF writer, making them available as body and heading defaults. Original font files are unchanged. The renderer patch is maintained with the OpenDoc application; ordinary workspace authoring does not require rebuilding it.

The specimen checks ligature words, ordinary mixed styles, and kerning-sensitive boundaries as well as glyphs. Inspect its real PDF appearance and copied text. A successful automated check does not establish suitability for every document. Keep font licensing information with the supplied material and respect it when using or sharing the font.

New documents use their generated theme adapter before any template factory runs:

```tsx
// documents/my-report/theme.tsx, generated by the create command
import { theme as base } from '../../themes/neutral';
import { withDocumentAssets, type DocumentAssets } from 'opendoc/assets';
import assets from './assets.json';
export const theme = withDocumentAssets(base, assets as DocumentAssets);
```

The document entry imports `{ theme }` from `./theme` and passes that same theme to `Document` and its template factory. Do not replace this adapter with a direct base-theme import: that would bypass the saved fonts during template construction. Binding fonts upgrades recognized older theme imports to this adapter while preserving the base theme, aliases, and document text. Custom or ambiguous imports produce an actionable error without replacing source; the agent should integrate the same adapter into the existing factory before retrying.

Native semantic body and heading roles receive the saved choices. Theme components that need a family explicitly can call `documentFont('body')` or `documentFont('heading')` from `opendoc` **inside their render function**, then use the returned family in their native PDF style. Do not call this helper at module scope. Deliberate code, caption, label, and furniture families remain intact; explicit authored style overrides remain last.

## Theme defaults and document versions

The theme detail's **Assets for new documents** section chooses an optional preferred logo, body font, and heading font. **Keep theme font** leaves the theme's own family in place. Defaults live separately from design tokens:

```json
{
  "version": 1,
  "logo": { "id": "acme", "variation": "default" },
  "bodyFont": "acme-sans",
  "headingFont": "acme-sans"
}
```

This is `themes/<theme-id>/assets.json`. Omit optional properties to clear them; `{ "version": 1 }` means no shared asset defaults. Inspect and update through the same service as the app:

```sh
npx opendoc assets defaults neutral
npx opendoc assets defaults neutral --metadata /path/to/theme-assets.json --expected-revision <defaults-revision>
```

The read command returns `{ defaults, revision }`, including a revision for an absent defaults file. The metadata file contains the complete defaults object, not that response wrapper. Preserve defaults the user did not ask to change.

Creation resolves these choices once into `documents/<id>/assets.json`. Its version-1 object has optional `logo`, named `logos`, `bodyFont`, and `headingFont` fields. Every selection contains `id` and an exact `revision`; logo selections can also include `variation`. An explicitly empty record is written when no defaults are set. Only asset selections are frozen: the document continues to use its live base theme for color, geometry, and other visual rules.

Changing defaults, publishing a replacement, editing guidance, or adding a variation does not update existing documents. Defaults are validated against actual referenced files when saved and when a document is created. Rename, move, duplicate, and Trash restore preserve saved choices. Older documents without a binding file retain their existing rendering until deliberately bound and adapted. The current PDF's rendered asset usage distinguishes what was actually used from what was only available through bindings.

Generated `.opendoc/current.json` keeps these concepts separate:

- `selectedAsset`: the inspected library family, version, folder, and any selected variation or face.
- `theme.assetDefaults`: the defaults `file` and `choices`, with `appliesTo: "new-documents"`.
- `documentAssets`: the binding `file`, exact `bindings`, and `saved`; `saved: false` means a legacy document has no binding file.
- `renderedAssets`: actual `uses`, the rendered bindings, `renderHash`, and `current`. If `current` is false, usage belongs to the last successful PDF while the current source is rendering or failing.

Read error fields before applying replacements. Do not edit generated context by hand. Navigation between library items and documents clears incompatible selections; selecting a family never adds it to a document.

Saved PDF receipts retain `assetBindings` for the exact choices available to the exported render and `assets` for the deduplicated logo variations and font faces actually used. These fields come from that render, never from today's library state, and later source or library edits do not rewrite them. Earlier receipts may omit them; omission means usage is unknown, not that the PDF used no assets. Per-block usage remains in the render artifact.

## Local records and safe lifecycle

```text
assets/logos/<logo-id>/
  asset.json                    current version and archive state
  revisions/<revision>.json     immutable family versions
  files/<content-hash>.png      prepared image or PNG original
  files/<content-hash>.svg      preserved SVG original
assets/fonts/<font-id>/
  asset.json
  revisions/<revision>.json
  files/<content-hash>.ttf      original font face (or .otf)
  files/<content-hash>.pdf      checked PDF specimen
```

Family, variation, and face IDs are stable lowercase IDs with single hyphens. Filenames and display names are not identities. Unchanged files are reused across versions. Use the CLI or app to publish changes; never overwrite historical manifests or content-addressed files. Changed historical bytes are detected and must be restored or imported as a new version, rather than silently accepted.

Import validation completes before the family is published. Failed imports leave existing families and versions intact. A broken neighboring asset is reported independently rather than hiding the whole library. Prepared artwork, inspections, and specimens are cached; previews load on demand. Rendering watches saved dependencies, so new versions and changed defaults refresh the catalog without rerendering documents that still use earlier versions. Legacy source assets retain conservative dependency tracking.

Archive hides an asset from normal selection while preserving its historical files and existing document bindings. The app offers Undo. When a theme uses the asset as a default, the archive flow names those relationships and offers to clear them explicitly. CLI equivalent:

```sh
npx opendoc assets archive logo acme --expected-revision <current-revision> --clear-defaults
npx opendoc assets list logo --archived
npx opendoc assets restore logo acme --expected-revision <current-revision>
```

Omit `--clear-defaults` unless clearing those defaults is intended; archiving an assigned default otherwise fails. Restoration makes the family selectable again and restores the defaults cleared by that archive only where no later defaults edit would be overwritten. No permanent delete or historical-file cleanup is provided. Documents in Trash and previous PDFs remain usable. A failed current render preserves its last successful preview, and an in-flight export cannot publish against inputs that have changed.

Use `--json` for machine-readable command output. Failures print an actionable message to stderr and exit nonzero. Use `npx opendoc assets --help` for asset command syntax or `npx opendoc --help` for the full command list. Read [Media](MEDIA.md) for document-owned visuals and [Themes](THEMES.md) for executable design systems.
