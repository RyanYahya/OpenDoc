---
name: opendoc-create-template
description: Build or refine an OpenDoc reusable page layout, presentation skeleton, or data-report template when the user wants a catalog template or recurring structure. For a single document or deck using an existing template, use opendoc-create.
---

Use the user's OpenDoc workspace as the working directory. `documents/`, `templates/`, `themes/`, `assets/`, and `.opendoc/` are workspace paths; guide links are relative to this installed skill. Use `npx opendoc` for commands and keep authoring changes out of `node_modules/opendoc`. In Headless, follow [the remote workflow](../../../docs/HEADLESS.md); these commands and imports stay the same, and no browser or recipient-side installation is needed.

## 1. Choose the contract

Read [Templates](../../../docs/TEMPLATES.md), the workspace’s shared guidance at `templates/AGENTS.md`, and one relevant existing template. Keep shared layout in `templates/<id>/`, instance content in `documents/<id>/`, and catalog specimens outside the document library.

Choose the smallest contract that fits:

- **Narrative layout:** accept ordinary OpenDoc blocks and content-led composition.
- **Presentation skeleton:** use `Presentation` and explicit `Slide` components; set `documentFormat: "presentation"` in the catalog descriptor. Keep story content and image assignments in the instance starter, with researched structure explained in the guide. Use native editable content and review every 16:9 slide.
- **Repeated structured report:** use `DocumentTemplate<T>` and the [structured-report branch](references/structured-reports.md).

**Ready:** the reusable structure and varying content are identified, and the narrative/data branch is chosen.

## 2. Build an adaptable layout

Implement the catalog files and exact starter sentinels specified in Templates. Accept the caller's theme; use `themeType` and `themePage` for supported roles while preserving meaningful structural geometry. New instances must use the generated `theme.tsx` adapter and saved `assets.json` choices.

Write a brief `AGENTS.md` explaining the layout's character, useful defaults, and sensible variations. Design for long titles, optional covers, short content, and flowing prose. Preserve stable block identities. Keep one-document adaptations local; shared options must preserve existing defaults.

For visual assets, follow [Media](../../../docs/MEDIA.md) or [Assets](../../../docs/ASSETS.md) as applicable. Use Neutral for the catalog specimen so layouts remain comparable.

**Ready:** the template, starter, guide, and native PDF specimen implement the chosen contract without prescribing the document's argument.

## 3. Exercise the contract

Run `npx opendoc check` and focused tests for changed parsing or layout behavior. Use `npx opendoc templates check <template-id>` to validate and render the catalog specimen, or `npx opendoc templates preview <template-id>` to also export `output/templates/<template-id>.pdf`. Render sparse, typical, and long cases, plus a second theme. For data-bound reports, include the invalid-input cases specified in the structured-report branch.

In a disposable workspace, create an instance through the supported path:

```sh
npx opendoc create <document-id> --project <project-id> --template <template-id> --title "Document title"
```

Verify project membership, independent instance data where applicable, adapted theme, and provenance. Keep acceptance fixtures out of the user's document library.

For presentation templates, export that disposable instance as PDF and PPTX and follow [PowerPoint delivery](../../../docs/AUTHORING.md#powerpoint-delivery). Verify the template's fonts and effects support the default editable handoff; a working PDF specimen alone is insufficient.

**Ready:** normal creation works and the layout holds across the relevant content and theme variations.

## 4. Review and deliver

Use [opendoc-review-document](../opendoc-review-document/SKILL.md) on the rendered specimens. For a shared revision, include representative affected instances. In Headless, prepare page images/text with `npx opendoc review --template <template-id> --json`, inspect them, and confirm `npx opendoc templates inspect <template-id>` discovers the bundle and guide. In normal OpenDoc, also confirm the Templates page opens its PDF and guide.

**Done:** the reusable template and concise contract remain in the workspace, and reviewed specimen PDFs are delivered through accessible file links or the host agent's existing delivery channel, with any remaining limits identified. A remote recipient needs no OpenDoc installation. Include reusable source and required assets when a portable template is requested.
