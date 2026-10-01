---
name: opendoc-create
description: Create an OpenDoc document or presentation from a brief and sources. Use for requests to write a report, make a slide deck, or produce a new deliverable in this workspace, even when the user does not name a skill. Deliver documents as PDF and presentations as PDF plus editable PowerPoint unless the user specifies otherwise.
---

Use the user's OpenDoc workspace as the working directory. `documents/`, `templates/`, `themes/`, `assets/`, and `.opendoc/` are workspace paths; guide links are relative to this installed skill. Use `npx opendoc` for commands and keep authoring changes out of `node_modules/opendoc`. In Headless, follow [the remote workflow](../../../docs/HEADLESS.md); these commands and imports stay the same, and no browser or recipient-side installation is needed.

## 1. Establish the brief

Follow the user's brief, choices, and requested files throughout the task. Read supplied material and identify the reader, purpose, evidence, and delivery constraints. Let these determine the title, structure, length, and design. A request for a deck, slides, or PowerPoint selects the presentation branch; a report, article, or written brief normally selects documents. Ask if the intended output is genuinely ambiguous.

Resolve the project from the request or `npx opendoc projects list`; in a normal browser session, [current context](../opendoc-current-document/SKILL.md) is another source. Headless uses explicit task context and catalog IDs rather than an active selection. Create one through the [project CLI](../../../docs/PROJECTS.md) if needed.

Resolve design choices before creating the scaffold:

- Honor an explicitly chosen theme or template, including choices carried by an app prompt. Preserve established project direction; do not ask again about a decision already made.
- Discover themes with `npx opendoc themes list` and layouts with `npx opendoc templates list` or **Templates**. Templates report a `type` and both lists report `language` and custom `tags`; narrow them with `--type <type>`, `--language arabic`, or `--tag <tag>`, such as `templates list --type report`. Inspect a candidate through `npx opendoc templates inspect <id>` and read its guide when assessing its fit; do not load the whole catalog. Match the template's `documentFormat` to the intended output.
- If the brief leaves you unsure of the visual direction or layout, ask a concise question about the user's theme/template preference. Offer relevant available choices and a recommendation in plain language. Do not silently choose Neutral or a familiar template to avoid asking.
- When the user delegates design, choose and briefly state a suitable direction. The project's default for the requested format is useful context (documents and presentations can differ; see `themeDefaults` in `npx opendoc projects list --json`); Neutral is the fallback when no theme is chosen and choosing has been delegated or the choice is immaterial. A bespoke layout is valid. Keep routine composition decisions autonomous and continue useful source/content work while awaiting a meaningful preference.

## 2. Create the right output

Read [Authoring](../../../docs/AUTHORING.md), then create the document before writing its source:

```sh
npx opendoc create <document-id> --project <project-id> --title "Document title"
```

Use `--theme <id>` for the resolved theme choice; without it, the CLI applies the project's default for the new item's format (the presentation default for `--format presentation` or a presentation template), then Neutral. Add `--template <id>` for the resolved catalog layout. These CLI fallbacks do not replace the preference check above. Optional `--starter` prose examples are an alternative to templates, not mandatory classifications. A requested new reusable layout belongs with [opendoc-create-template](../opendoc-create-template/SKILL.md).

For a presentation, add `--format presentation` for a minimal slide scaffold, or choose a presentation template with `--template <id>` (its format is inferred). Discover deck skeletons with `npx opendoc templates list` or **Templates → Presentations**, then read the chosen template's guide. Document templates and prose starters do not apply to slides. Creation records presentation identity before rendering and places the work in **Presentations** while retaining its project, local folder, and asset bindings.

Confirm project membership, `index.tsx`, `theme.tsx`, and `assets.json` exist for the intended output. The scaffold is only a starting draft.

Tag it right away so agents and the user can find it. Set one type from `npx opendoc tags` when one fits (`report`, `proposal`, `brief`, `minutes`, `letter`, `guide`, `article`, `cv`, or `invoice`; aliases such as *memo* or *quote* also work) and the status `draft`. Add a custom tag only for a name that will be reused, such as a client or programme, reusing an existing spelling. Do not tag the format or the language; language is detected from the text:

```sh
npx opendoc tags add document <document-id> report
npx opendoc tags status <document-id> draft
```

Use `presentation` instead of `document` for a deck; both name the same item. Never remove or rename tags the user applied unless asked. See [Tags](../../../docs/TAGS.md#tagging-by-agents).

## 3. Write and compose

Inspect the selected theme with `npx opendoc themes inspect <id>`; read its `design.md` and the components needed for this work. Use the generated `./theme` adapter for `Document`, `Presentation`, and template factories, with `meta.theme` equal to `theme.id`.

Author a pure TSX component using OpenDoc/Forme primitives. Keep prose native and breakable, block IDs stable, and tables able to continue. Keep a heading with its short lead rather than enclosing an entire long section. Use columns for independent material unless sequential flow has been demonstrated. Distinguish source evidence, inference, and illustrative material; use the citation and reference primitives documented in Authoring.

For presentations, use `Presentation` with explicit `Slide` children as described in [Authoring](../../../docs/AUTHORING.md#presentations). Each slide is one 960 × 540 page; nothing may carry over. Use current theme fonts/colors and locally chosen slide typography. Preserve slide and component IDs through reordering. Resolve overflow by editing content or layout or explicitly adding a slide; never hide text, silently shrink it, or use document flow primitives. Keep native text editable and use the same media/asset workflow. Read [PowerPoint delivery](../../../docs/AUTHORING.md#powerpoint-delivery) before composing for the default dual-format handoff so fonts and effects can survive export.

Load only the branch needed:

- **Visuals:** [Media](../../../docs/MEDIA.md) covers local images, charts, prepared data, and recording after visual review. For exact crops use `MediaFrame`; for full bleed use `Page backgroundMedia`. The workspace’s Image story guide at `templates/image-story/AGENTS.md` offers optional half-page, panoramic, inset, collage, and overlay compositions. Use a reviewed chart image when native chart labels cannot render correctly. Review actual image visibility and crop; a successful export alone does not establish them.
- **Arabic or bilingual text:** set the base direction once, on the theme or the root (`<Document direction="rtl" lang="ar">`; `Presentation` takes the same props). For Arabic body text, bind the bundled family with `npx opendoc assets bind <document-id> body-font noto-naskh-arabic`, and `heading-font` too when headings are Arabic; occasional Arabic words in English text use the automatic fallback. Write mixed Arabic, English, and numbers naturally in one run; never reverse words, insert directional marks, or split runs to force an order. Give an English paragraph inside Arabic text `style={{ direction: 'ltr' }}`. Lists, tables, and rows mirror automatically. Avoid `Em` and italics in Arabic; the Arabic faces have none. In decks, PowerPoint keeps one regular and one bold face per family, so do not combine semibold Arabic (`Strong`, headings) with bold Arabic. Read [Arabic and right-to-left text](../../../docs/AUTHORING.md#arabic-and-right-to-left-text).
- **Logos or fonts:** [Assets](../../../docs/ASSETS.md) covers exact bindings, compatibility, and explicit logo placement on the actual PDF background.
- **Editable or reusable content:** keep visible wording as literal children, literal props, or local constants, including props of helper components in the same file; do not compute, transform, or reuse visible text as IDs. Give `DataTable` rows stable `rowIds` so each cell stays editable and commentable when rows reorder or repeat wording. [Selection](../../../docs/SELECTION.md) covers what stays editable, text slots for shared components, stable records, and preservation of saved corrections.
- **A new print system:** [opendoc-create-theme](../opendoc-create-theme/SKILL.md) handles theme creation or a requested shared refinement. Keep one-document variations local.

Develop a complete draft that addresses the brief, with honest sources or illustrative labels for visuals and references. Continue through review and delivery; a scaffold or outline is not the finished request.

## 4. Review and deliver

Run `npx opendoc check` after source changes. In Headless, run `npx opendoc review <document-id> --json`, then inspect the returned page images, extracted text, and issues. In normal OpenDoc, use the existing app session or the [README launch instructions](../../../README.md); the review command is also available. Confirm the current source rendered successfully; a previous PDF is not proof. Complete [opendoc-review-document](../opendoc-review-document/SKILL.md), reusing artifacts from the same unchanged revision:

| Output | Export and handoff |
| --- | --- |
| Document | `npx opendoc export <document-id>` → `output/<document-id>.pdf` |
| Presentation | The same PDF command **and** `npx opendoc export <document-id> --format pptx` → `output/<document-id>.pdf` and `output/<document-id>.pptx` |

Deliver the requested files through the host agent's existing attachment/download capabilities or accessible file links. For normal OpenDoc, the local app view may also be useful. Headless delivery must be complete on the recipient's device without OpenDoc; an inaccessible remote path or instructions to open a local workspace are not delivery. Presentations include **both PDF and editable PowerPoint by default**; an explicit request for only one format takes precedence. Review the PDF even when only PowerPoint is requested, since it supplies the export layout. After revisions, refresh both deliverables from the same final source. If one format fails, fix an in-scope authoring issue, or deliver the available reviewed file and identify the exact remaining blocker; do not call a partial handoff complete or silently change a chosen font/design.

Once the reviewed files are delivered, mark the work final with `npx opendoc tags status <document-id> final`. Keep its type and tags.

Routine writing, design, review, export, and tagging are part of creation and need no extra completion permission. Keep runtime changes, new shared systems, and external publication within the user's requested scope. Success means the requested deliverables are reviewed and available, with concrete verification limits stated.
