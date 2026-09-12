# Layout templates

Templates define document architecture: columns, section order, cover composition, and placement. Themes supply the visual system: typography and hierarchy, spacing rhythm, page defaults, running matter, and treatments for tables, figures, and asides. Template values are defaults; `themeType` and `themePage` let a selected theme govern its supported roles without replacing the architecture. See [Themes](THEMES.md). Content remains the writer's prose, data, visuals, and citations. A layout must not impose an argument or a mandatory writing outline.

Treat that architecture as an adaptable starting point. The specimen demonstrates a design direction, not a fixed rule system. Adjust title size for a long headline, rebalance spacing, vary image proportions, or reshape a passage when the document benefits. Preserve clear hierarchy and readable flow while allowing variation and creativity. Keep adaptations for one document local; shared changes should preserve other documents' defaults. Native rendering, stable IDs, evidence integrity, and applicable data contracts remain functional requirements.

The Templates page discovers ordinary `templates/<id>/` folders containing `template.json` in the workspace root. These editable templates are separate from the installed package that contains this guide. The page’s **Documents** and **Presentations** tabs separate page layouts from 16:9 slide decks. Narrative layouts, validated data reports, and presentation skeletons share the same catalog and creation path. Run commands from the workspace root.

```sh
npx opendoc templates list
npx opendoc templates inspect monthly-report
npx opendoc templates check monthly-report
npx opendoc templates preview monthly-report
npx opendoc create my-report --project client-work --template monthly-report --title "Monthly report"
```

Choose an existing project and catalog template ID. Use `--theme <id>` for an explicit override. Template selection is optional for bespoke documents; `--starter` is a separate set of optional prose examples and cannot be combined with `--template`.

These commands work in both editions without a browser. `check` validates the descriptor and renders the Neutral specimen with the same format/layout checks as the catalog. `preview` additionally writes `output/templates/<id>.pdf` with source freshness checks. For page images, extracted text, and structured review evidence, use `npx opendoc review --template <id> --json`, then inspect its returned artifacts. Headless theme/template creation and reuse stay in the remote workspace; the recipient can review the specimen PDF without installing OpenDoc. See [Headless](HEADLESS.md#create-themes-and-templates-remotely).

Each catalog folder contains:

- `AGENTS.md`: brief, qualitative guidance on the design's character and useful defaults, explicitly allowing content-led variation and giving examples. Distinguish flexible visual choices from functional requirements. The shared attitude lives in `templates/AGENTS.md`.
- `index.tsx`: the reusable pure layout component. Accept a theme from the caller. Preserve structural dimensions where necessary; use theme helpers for type roles and page defaults. Do not reset the caller’s body size, line height, or paragraph gap.
- `template.json`: `name`, `description`, `format` (a human-readable label), and `structure` (one to eight short layout notes). Presentation templates add `"documentFormat": "presentation"`; omission means `document`. This determines project registration, catalog grouping, and the required root in the PDF specimen.
- `preview.tsx`: a default pure document component and document metadata, rendered with the shared `neutral` theme. Use clearly marked placeholders so different templates can be compared on structure. This is an actual PDF rendered by the same worker and preflight as documents.
- `starter.tsx`: a working ordinary document, with double-quoted `"__OPENDOC_TITLE__"` and `"__OPENDOC_THEME__"` literals. Creation replaces these literals with safely quoted user values and copies the result into a new document folder, alongside generated `theme.tsx` and `assets.json` files. Keep workspace-relative provenance and imports valid from `documents/<id>/index.tsx`. The reusable layout stays linked to its template folder.

The starter imports `{ theme }` from the exact quoted `"__OPENDOC_THEME_MODULE__"` sentinel once; creation replaces this sentinel import with the generated `./theme` adapter. Use that same adapted theme for template factories and `Document`; importing the base theme directly would bypass saved font choices. It also uses `"__OPENDOC_THEME__"` for metadata and `"__OPENDOC_TITLE__"` for the title. Keep the import’s explanatory TypeScript ignore comment while it is an unresolved starter. Replacement runs once so literal user text is never reinterpreted.

A data-bound catalog template may also contain `data.json` (up to 128 KB, a JSON object). Creation copies it into the document before publishing the TSX entry; the title and theme literals may appear in that JSON instead of the starter. The optional double-quoted `"__OPENDOC_DOCUMENT_ID__"` literal in the TSX receives the validated document ID, for accurate data provenance. This uses the same exclusive creation path and never overwrites an existing instance. Quotation demonstrates this pattern. Keep data parsing and calculation in the template contract, not the catalog UI.

Use workspace-root `templates/editorial-essay` as the first example. Its layout accepts arbitrary OpenDoc blocks, with no prescribed section outline or JSON format. Import the `DocumentTemplate<T>` contract and binding helpers from `opendoc/template`; import `themeType` and `themePage` from `opendoc/themes`. The contract provides `parse`, `meta`, and `render` for validated data-driven reports. Use it when content needs validation; a narrative page layout can accept ordinary blocks. Keep imports of reusable workspace layouts relative, such as `../../templates/monthly-report` from a document entry.

The page presents every specimen in Neutral. A separate theme choice applies when creating a document; the preview remains neutral for comparison. New documents use the existing exclusive folder creation path, preserve existing files, and enter the normal preview/comment/export workflow. A malformed template stays visible with an error; it does not remove other templates. Preview changes invalidate the catalog, and proofs remain outside the document library.

Supply sparse, typical, and long specimens, check every rendered page, and verify that changing the theme preserves the intended architecture. Do not promise multi-column sequential text flow until it has been demonstrated in the renderer. A pair of bounded side-by-side panels is not proof of continuous two-column pagination.

## Presentation templates

Use `Presentation` and explicit `Slide` components. Each slide remains one 960 × 540 PDF page. The template's declared format is inferred during creation; an explicit `--format` must agree. For example:

```sh
npx opendoc create investor-deck --project client-work --template pitch-deck --title "Company pitch"
```

The catalog includes Pitch deck, Brand guidelines, Company profile, and Proposal deck. Each guide records research sources and a recommended skeleton. Adapt the sequence to the audience and brief; the outline is a starting point. Keep editable copy, evidence fields, and visual assignments in the instance starter. Shared template code supplies composition. Mark missing evidence and image slots clearly, use document-owned media when populating them, and never use invented numbers or credentials as a finished company's facts.

Inspect every slide, including sparse content, long titles, and another theme. Long content must be edited, recomposed, or divided into explicitly authored slides; it cannot flow onto an accidental continuation page or be silently reduced to fit.

Custom template creation happens with the external agent. The page's Create template action supplies a reusable prompt; there is no embedded AI service or form builder.

## Project membership

Every created document or presentation instance requires a destination project. The creation prompt carries the selected template; the agent resolves the project and any meaningful design preferences through [opendoc-create](../.agents/skills/opendoc-create/SKILL.md). The CLI uses an explicit theme choice, then the project default, then Neutral. Moving an instance or changing a project default leaves its source and current theme intact. Template specimens remain shared resources outside the project document list. **View AGENTS.md** opens the selected template’s current guidance in a scrollable Markdown dialog.
