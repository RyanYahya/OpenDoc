# Themes

A theme is OpenDoc’s reusable document design system. Fonts, colors, opening hierarchy, page rhythm, component treatments, tables, captions, asides, and running matter share one executable definition. A short design guide explains how to use those decisions. A real PDF specimen makes the result inspectable in the app.

Themes are authored in source by the external coding agent. Users describe the outcome or supply references; they explore the completed result in the Themes view. The app can choose shared logo and font defaults for new documents; design tokens remain controlled in source. There are no visual tuning controls or embedded AI.

## A small source bundle

```text
themes/<kebab-case-id>/
  index.ts       executable definition; named theme export
  design.md      exact palette, type, geometry, composition, usage, and basis
  components.tsx reusable visual components, when the system needs them
  preview.tsx    an independent visual showcase and applied document example
  assets.json    optional shared logo/body/heading defaults for new documents
```

These folders belong to the workspace root, not the installed package. The folder ID and `theme.id` must agree. Keep `index.ts` pure data; do not import or re-export React components from it. OpenDoc loads this small module for discovery and loads the preview only on demand. New folders need no registry edit. New documents use the `theme.tsx` adapter generated beside their source:

```tsx
import { theme } from './theme';

export const meta = {
  title: 'A clear proposal',
  description: 'The proposal and its supporting detail.',
  theme: theme.id,
};
// Pass the same theme to <Document theme={theme} ...> or the chosen template.
```

Metadata identifies the relationship. The theme passed to the document or template actually controls rendering. Keep them consistent. Every real document still belongs to a project; a theme specimen is a separate preview artifact and does not need a project or a document-library entry.

The generated adapter imports the base theme from `../../themes/<id>` and calls `withDocumentAssets` with the document's saved `assets.json`. Use the adapted theme before constructing a template, not only when rendering `Document`; factories may already capture its font roles. Shared colors, geometry, and other rules remain live. Existing direct theme imports remain supported. See [Assets](ASSETS.md) for the adapter and exact-version contract.

## What belongs in the definition

Import `DocTheme`, `themeType`, and `themePage` from `opendoc/themes`. Root properties provide identity, font families, semantic colors, base reading metrics, page size and running-matter defaults. `palette` holds up to 16 named six-digit hex colors with semantic roles. `geometry` holds up to eight short rules; `useFor` and `principles` summarize the design. These bounded fields power the app without loading every guide. The grouped `design` rules style native OpenDoc components:

| Group | Responsibility |
| --- | --- |
| Typography | Heading levels, labels, leads, small text, captions, and code |
| Page and opening | Page geometry, title block, and cover treatment |
| Furniture | Running header, footer, folio, and their typography |
| Table and figure | Headers, cells, row treatments, figure spacing, and captions |
| Callout, list, and code | Useful supporting components with a consistent voice |

Values use the native PDF style contract. Read the type definition and one selected theme rather than assuming browser CSS works. Standard role rules cover ordinary prose and tables; `components.tsx` supplies distinctive constructions such as a modular grid, spectrum rail, circular diagram, evidence chain or analytical exhibit. Export shared tokens from `index.ts` and import them into components. A preview uses these same reusable components. Explicit document/template choices may override a theme where their composition requires it; ordinary content consumes theme roles. Use OpenDoc `Page` and `Pages` for reliable page surfaces, with native Forme primitives inside them.

### Editable text in components

Readers correct document text in the browser, including text a theme component places. Bind each string the document passes, such as a `title`, `label`, `code`, or `children` prop, with `TextSlot` from `opendoc`, created in the exported component that receives the prop: `<Heading id={titleId}><TextSlot slot="title" from="title">{title}</TextSlot></Heading>`. A correction then saves at the document's call site. When one component composes another, create the slot in the outer component and pass the element down; a slot created inside the inner component looks for the prop in the theme file, which a document never edits. For an array of records, name the field with `path`: `[{ id: item.id }, 'text']`, or `[{}, 'text']` when records have no IDs, in which case the text is editable when its wording identifies one record.

Text the theme writes or derives stays read-only, and the reader explains why:

- Wrap counters, fixed prefixes, arrows, and similar generated marks in `Decoration`. Drawn as its own text, a decoration is never selectable text; inside a label such as `<Decoration>EXHIBIT </Decoration><TextSlot slot="number" from="number">{number}</TextSlot>`, it stays fixed while the document's part remains editable.
- Give a whole label the theme writes, or one it transforms with `toUpperCase()` or other code, a stated reason: `<TextSlot slot="label" reason="This label is generated by the theme. Ask your agent to change it, or comment instead.">`. A transformed value cannot be edited from its display.
- Where a prop has a theme default, bind the document's value when one is passed and give the default a reason.

Text a component places without a binding is read-only, and its tooltip names the theme file. `TextSlot` and `Decoration` add no PDF content; the specimen's PDF does not change. See [Selection](SELECTION.md#binding-reusable-content) for the binding rules.

Use local fonts and assets. The bundled typefaces are the default. Register custom TTF/OTF faces through `theme.fonts`, with workspace-relative `src` paths, family, numeric weight, and style; keep their license alongside. Then use the registered family in the appropriate type roles. A family may be a list of registered families, such as `'Acme Sans, Noto Naskh Arabic'`; declaring an unregistered family name does not embed a PDF font. For Arabic and other right-to-left documents, also set `direction`, `lang`, and `fontFallbacks`; see [Arabic and right-to-left text](AUTHORING.md#arabic-and-right-to-left-text). None of the bundled themes sets `direction`, so an Arabic document using one sets it on `Document`. Rows, list markers, table columns, and callout rules mirror on their own, but padding, margins, borders, and absolute positions stay physical. A component that puts something on one side should call `documentDirection()` from `opendoc` inside its render function and choose the side from it. Check actual PDF text extraction as well as appearance; see the package's [third-party notices](../THIRD_PARTY.md).

For reusable user-supplied logos and font families, prefer the shared asset library and optional theme defaults. Do not copy those families into every theme or document. The source-font registration below remains useful for a design system's own runtime typefaces and existing themes. Theme components should import `documentFont` from `opendoc` and call `documentFont('body')` or `documentFont('heading')` inside their render function when they explicitly need the document's semantic family. This lets saved font choices reach the component; deliberate code, caption, label, and furniture families can retain their own typefaces.

For example, after obtaining and checking these local font files, a theme could include:

```ts
// Properties inside the theme definition; replace with verified local assets.
body: 'Acme Sans',
heading: 'Acme Sans',
fonts: [
  { family: 'Acme Sans', src: 'themes/acme/assets/AcmeSans-Regular.ttf', fontWeight: 400, fontStyle: 'normal' },
  { family: 'Acme Sans', src: 'themes/acme/assets/AcmeSans-Semibold.ttf', fontWeight: 600, fontStyle: 'normal' },
  { family: 'Acme Sans', src: 'themes/acme/assets/AcmeSans-Italic.ttf', fontWeight: 400, fontStyle: 'italic' },
  { family: 'Acme Sans', src: 'themes/acme/assets/AcmeSans-SemiboldItalic.ttf', fontWeight: 600, fontStyle: 'italic' },
],
```

These paths are examples, not supplied assets. Register each weight/style combination the theme uses. Additional family declarations may be needed in specific typography roles; labels and code can deliberately retain the bundled fonts. Do not replace the reserved `OpenDoc` font families.

## What belongs in design.md

The guide is a concrete, opinionated design system. Include exact hex values and color roles; type sizes, weights and leading; margins, grid, gutters and spacing units; shape geometry and rule weights; supported compositions; treatment of evidence, imagery and branding; component names and inputs; and specific do/don’t rules. Keep it only as long as the system needs; favor concrete, scannable instructions.

Code executes the values; the guide makes them understandable and repeatable. Keep numeric tables synchronized with exported tokens. Do not duplicate component implementations. A short basis section identifies supplied requirements, inspected references, interpretations and font/asset substitutions. Do not claim an external brand’s authority for an inspired theme.

Original inspiration material remains in the surrounding project’s existing organization. Do not automatically copy or load reference archives. Record useful pointers and keep only necessary local runtime assets with the theme. A document agent ordinarily needs the selected guide, not the research that produced it.

## Specimen and verification

`preview.tsx` exports nonempty `meta.title`, `meta.description`, `meta.theme`, and a default pure component. Make an independent showcase that expresses this system: usually two to four pages combining identity, visible palette/type/geometry and a plausible applied document. Use theme-owned components and standard themed primitives. Distinction must extend into the interior composition and evidence treatment. The shared `ThemeSpecimen` demonstrates the simpler foundations; a new distinctive system should use its own showcase.

The catalog includes Civic Spectrum’s colored modular rail, Field Manual’s annotated evidence chain, McKinsey Consulting’s analytical exhibits, and the warm editorial house style of OpenDoc Neutral. Their guides describe each system and its reusable compositions. Neutral provides a simpler foundation and is the document fallback when no theme is supplied.

Run these commands from the workspace root:

```sh
npx opendoc themes list
npx opendoc themes inspect <id>
npx opendoc themes check <id>
npx opendoc themes preview <id>
```

`list` is compact discovery. `inspect` identifies the selected definition, guide, optional components, preview, and bounded design summary without rendering every theme. `check` validates and renders the selected specimen. `preview` exports `output/themes/<id>.pdf` with source freshness checks; an edit during rendering cannot silently replace the previous reviewed export. Themes use the same isolated rendering and layout checks as authored documents.

Run `npx opendoc check` after changing source. Review every exported specimen page at readable size and inspect representative extracted text. Long titles, dense tables, custom fonts, and altered page geometry deserve representative longer-content checks. A shared theme change can reflow every document that imports it. Review affected examples instead of treating a passing specimen as proof that all documents are unchanged.

## Organize the catalog

Folders and tags are optional, and the Themes view always lists every theme. Folders are single-level. When a workspace has folders, they appear beside **Filter by tag** as filter buttons: **All**, selected by default, then one button per folder with its theme count. Choosing a folder shows only that folder's themes and combines with the tag filter, so a folder and a tag together show the themes that match both. Choosing the selected folder again returns to **All**. The address keeps both filters (`#themes?folder=<folder-id>&tag=<tag>`), so Back and Forward step through them. The count above the gallery always describes the filtered list. While **All** is selected, each card shows its folder.

**Manage folders**, beside the folder buttons, offers **New folder…** and, for the selected folder, **Rename…** and **Delete…**; a workspace without folders shows **New folder** instead. Deleting a folder never deletes a theme; its themes are left outside any folder. An empty folder is deleted at once, and a folder with themes asks for confirmation first. A theme card's **…** menu and the theme's page offer **Move to folder…**; on desktop, a card can also be dragged onto a folder button. A theme is in at most one folder. Theme lists elsewhere, such as a project's default themes, show the folder after the theme name. Themes carry custom tags only, shared with documents and templates; they have no type or status, and their language is detected from `direction` and `lang` ([Tags](TAGS.md)). Theme cards do not show tags; a theme's page does. The tag filter lists custom tags and is hidden when no theme has one.

`themes/folders.json` stores folders separately from the theme bundles:

```json
{
  "version": 2,
  "folders": [
    { "id": "acme", "name": "Acme" },
    { "id": "starter", "name": "Starter" }
  ],
  "assignments": { "field-manual": "acme" }
}
```

Organizing never moves `themes/<id>/`, changes a theme ID, or edits theme source, so documents, project defaults, and imports are unaffected. Folder names are unique regardless of case and cannot contain `/`. Renaming a folder keeps its ID, so links and assignments still work. Theme tags live in the workspace's `tags.json`; a `tags` field left in this file by an earlier version is still read and moves to `tags.json` on the next tag change. Browser and command-line changes serialize through a local lock and atomically replace the file. Entries for themes whose folders no longer exist are ignored and dropped on the next change. An invalid file is reported without being overwritten, and the gallery lists every theme without folders until it is repaired. New workspaces start without this file.

### Folders from earlier versions

Earlier versions allowed nested folders (`"version": 1`, with a `parent` on each folder). OpenDoc flattens them whenever it reads the file, and the next folder or assignment change, in the browser or the command line, saves the flat `"version": 2` form; reading alone never rewrites it. Flattening loses no theme assignment:

- A nested folder keeps its own name and ID at the top level, so `Clients › Acme` becomes `Acme`, and its themes stay in it.
- A parent folder that held only subfolders, and no themes of its own, is removed. A parent that held themes stays as a folder.
- When two folders end up with the same name, folders nearer the top keep it and the others take the next free number, such as `Acme 2`.

`npx opendoc themes folders` shows the flattened folders and, until the flat form is saved, a `migration` report listing each flattened folder's former path and any renamed or removed folders.

```sh
npx opendoc themes list --folder Acme --tag technical
npx opendoc themes folders
npx opendoc themes folders create Acme
npx opendoc themes folders rename Acme "Acme Corp"
npx opendoc themes folders delete "Acme Corp"
npx opendoc themes assign field-manual Starter
npx opendoc tags add theme field-manual technical bold
```

`themes list` reports each theme's `folder` name, detected `language`, and `tags`; `--language arabic` narrows it. `--folder <name>` lists one folder's themes, `--folder none` lists themes outside every folder, and repeated `--tag` options must all match; folder, tag, and language filters combine. Folder names are matched without regard to case; quote names that contain spaces. `assign <theme-id> none` takes a theme out of its folder, and `folders delete` leaves the folder's themes outside any folder. Creating a folder with a `/` path, or passing `--parent`, is refused because folders cannot be nested; the message names the command to use instead. `folders update <name> --name <new-name>` from earlier versions still renames. `npx opendoc themes tags <theme-id> [--set "A, B"] [--add <tag>] [--remove <tag>]` remains available for theme tags. Folders belong to the user: change them only when asked. Add a custom tag to a new theme only when it will help find it, as described in [Tags](TAGS.md#tagging-by-agents), and leave existing tags unless asked.

## Themes, templates, and projects

The theme defines visual language. A template defines document-type architecture, such as an essay opening, a proposal structure, or invoice geometry. Content determines what is said. Media retains its meaning and evidence even when placed inside a new visual system.

Projects can provide a default theme for new documents and a different one for new presentations. A document can explicitly choose another. A theme's details page lists the projects that use it as a default and for which formats. Creating or refining a theme does not silently change a project default or reassign existing documents. Documents already importing a shared theme receive its source changes, so that change should be intentional and verified.

The theme detail's **Assets for new documents** section chooses an optional logo, body family, and heading family. **Keep theme font** preserves the source definition. Defaults live in `themes/<id>/assets.json`, separate from `index.ts`, and are captured as exact asset versions during creation. Changing a default does not rebind existing documents; moving, duplicating, or restoring one preserves its selections. A preferred logo is available to `Logo` and the agent but is never inserted automatically. Inspect or change defaults through `npx opendoc assets defaults <theme-id>`; see [Assets](ASSETS.md) for the guarded update command and file shape.

The app’s Themes view is for browsing real specimens, exact colors and geometry, reading the guide, seeing usage, and handing requests to the external agent. The current context identifies the active selection and its file paths so the agent can resolve “this theme.” It does not embed all guides or component bodies. Read the selected guide, then only the component source needed for the task. Re-read `.opendoc/current.json` when resolving a selection. Do not expose the local session token.

For the reference-to-theme workflow, use the [opendoc-create-theme skill](../.agents/skills/opendoc-create-theme/SKILL.md). For document creation, read [Authoring](AUTHORING.md) and resolve the destination [Project](PROJECTS.md).
