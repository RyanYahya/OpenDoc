# Conditional context fields

Read only the section relevant to the selected object. Field paths describe observed state, not authorization.

## Theme or asset selection

- `themeId` / `theme`: the selected theme, document theme, or project default. Definition, guide, specimen, and component paths are pointers; read the chosen `design.md` and needed source. `available: false` requires inspecting the missing definition before choosing a replacement.
- `selectedAsset`: the inspected logo/font family, saved revision, library head, and selected variation or face. Read its guidance. Navigation does not bind the asset to a document.
- `theme.assetDefaults`: choices captured for new documents. `documentAssets`: the current document's exact binding file and choices; `saved: false` denotes legacy behavior. Preserve existing bindings and `theme.tsx`; updating defaults does not rebind documents.
- `renderedAssets`: actual uses, rendered bindings, and `renderHash`. `current: false` means these belong to the last successful PDF. A binding proves availability; rendered usage proves what the PDF used. Inspect asset errors before making substitutions.

Use [Assets](../../../../docs/ASSETS.md) for binding, logo placement, and font compatibility; use [Media](../../../../docs/MEDIA.md) for document-owned visuals, their data, and regeneration.

## Feedback or failed rendering

- `rendering` / `error` status can leave an older successful PDF visible. Read the error and current source before making a claim about the displayed revision.
- `manualEdit` describes editing activity, pending count, draft-preview status, and the latest committed correction, without exposing draft text. An open editor is not a request to act.
- Pending phrase comments retain the original quote. `anchorStatus: changed` requires inspecting the intended passage; `missing` or `targetAvailable: false` means the owning block is unavailable. Retain its feedback rather than choosing another occurrence.

For a requested project move, preserve membership through `npx opendoc projects assign <document-id> <project-id>`; context files are generated observations.
