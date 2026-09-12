# Themes

A theme is OpenDoc’s reusable document design system. It controls more than fonts and colors: opening hierarchy, page rhythm, component treatments, tables, captions, asides, and running matter share one executable definition. A short design guide explains how to use those decisions. A real PDF specimen makes the result inspectable in the app.

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

Use local fonts and assets. The bundled typefaces are the default. Register custom TTF/OTF faces through `theme.fonts`, with workspace-relative `src` paths, family, numeric weight, and style; keep their license alongside. Then use the registered family in the appropriate type roles. Declaring an unregistered family name or CSS fallback stack does not embed a PDF font. Check actual PDF text extraction as well as appearance; see the package's [third-party notices](../THIRD_PARTY.md).

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

Run `npx opendoc check` after changing source. Review every exported specimen page at readable size and inspect representative extracted text. Long titles, dense tables, custom fonts, and altered page geometry deserve representative longer-content checks. Existing usage matters: a shared theme change can reflow documents that import it. Review affected examples instead of treating a passing specimen as proof that all documents are unchanged.

## Themes, templates, and projects

The theme defines visual language. A template defines document-type architecture, such as an essay opening, a proposal structure, or invoice geometry. Content determines what is said. Media retains its meaning and evidence even when placed inside a new visual system.

Projects can provide a default theme for new documents. A document can explicitly choose another. Creating or refining a theme does not silently change a project default or reassign existing documents. Documents already importing a shared theme receive its source changes, so that change should be intentional and verified.

The theme detail's **Assets for new documents** section chooses an optional logo, body family, and heading family. **Keep theme font** preserves the source definition. Defaults live in `themes/<id>/assets.json`, separate from `index.ts`, and are captured as exact asset versions during creation. Changing a default does not rebind existing documents; moving, duplicating, or restoring one preserves its selections. A preferred logo is available to `Logo` and the agent but is never inserted automatically. Inspect or change defaults through `npx opendoc assets defaults <theme-id>`; see [Assets](ASSETS.md) for the guarded update command and file shape.

The app’s Themes view is for browsing real specimens, exact colors and geometry, reading the guide, seeing usage, and handing requests to the external agent. The current context identifies the active selection and its file paths so the agent can resolve “this theme.” It does not embed all guides or component bodies. Read the selected guide, then only the component source needed for the task. Re-read `.opendoc/current.json` when resolving a selection. Do not expose the local session token.

For the reference-to-theme workflow, use the [opendoc-create-theme skill](../.agents/skills/opendoc-create-theme/SKILL.md). For document creation, read [Authoring](AUTHORING.md) and resolve the destination [Project](PROJECTS.md).
