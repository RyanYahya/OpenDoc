# Conditional context fields

Read only the section relevant to the selected object. Field paths describe observed state, not authorization.

## Document, slide, or selection

- `documentId`, `projectId`, and `project`: the open document and its project, with the project's resolved `themeDefaults`. Outside a document, `projectId` is the project being browsed, or `null`.
- `format`: `document` or `presentation`. For a presentation, `slides` lists the stable slide IDs in order; `page` is only the visible position.
- `title` is the authored PDF title from `meta.title`; `name` is the library name, which a rename can change without touching source. Match the user's wording against both.
- `status`, `error`, and `revision`: the render state and its counter; `status` is `idle` when no document is open. `renderHash` identifies the last successful PDF, which `status: rendering` or `error` can leave visible.
- `provenance`, `source`, `blockId`, `selectedBlock`, `selection`, `selectionCurrent`, and `selectedText` locate the selected block or phrase; verify them against source as described in step 2.
- The **Templates** view writes no template context: a template being viewed never appears here. Resolve it from the request or `npx opendoc templates list`.

## Media selection

- `selectedMedia`: the media item chosen in **Media & Assets → Media**, with its `folder`, `meta`, and `freshness` (`original`, `current`, `stale`, or `unrecorded`) plus any `changedInputs`; `mediaId` names it. `error` reports an unreadable item. The owning document is `documentId`.
- `materials`: the document's `media` folder and the `usedMedia` items its current render uses, by item and block.

Use [Media](../../../../docs/MEDIA.md) to replace, regenerate, or record a visual; selecting an item never authorizes changing it.

## Theme or asset selection

- `themeId` / `theme`: the selected theme, document theme, or project default (for a presentation, the project's presentation default); `project.themeDefaults` gives the project's document and presentation defaults. Definition, guide, specimen, and component paths are pointers; read the chosen `design.md` and needed source. `available: false` requires inspecting the missing definition before choosing a replacement.
- `selectedAsset`: the inspected logo/font family, saved revision, library head, and selected variation or face. Read its guidance. Navigation does not bind the asset to a document.
- `theme.assetDefaults`: choices captured for new documents. `documentAssets`: the current document's binding `file` and exact `bindings`; `saved: false` means a legacy document has no binding file. Preserve existing bindings and `theme.tsx`; updating defaults does not rebind documents.
- `renderedAssets`: actual uses, rendered bindings, and `renderHash`. `current: false` means these belong to the last successful PDF. A binding proves availability; rendered usage proves what the PDF used. Inspect asset errors before making substitutions.

Use [Assets](../../../../docs/ASSETS.md) for binding, logo placement, and font compatibility, and [opendoc-assets-media](../../opendoc-assets-media/SKILL.md) for the full logo, font, and media workflow.

## Feedback or failed rendering

- `rendering` / `error` status can leave an older successful PDF visible. Read the error and current source before making a claim about the displayed revision.
- `manualEdit` describes editing activity, pending count, draft-preview status, and the latest committed correction, without exposing draft text. An open editor is not a request to act.
- `pendingComments` lists open comments. Pending phrase comments retain the original quote. `anchorStatus: changed` requires inspecting the intended passage; `missing` or `targetAvailable: false` means the owning block is unavailable. Retain its feedback rather than choosing another occurrence. `commentsError` means the comments file could not be read; report it rather than treating the document as having no feedback.

A requested project move goes through `npx opendoc projects assign <document-id> <project-id>` ([opendoc-organize](../../opendoc-organize/SKILL.md)); context files are generated observations, never edited by hand.
