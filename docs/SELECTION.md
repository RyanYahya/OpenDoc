# Selection and quick corrections

OpenDoc uses stable component selection for text editing and feedback. A fixed-width bottom bar offers Edit and Comment for the selection; both use the same panel above it. Saved comments have their own bottom-right dock. Hover outlines identify components before clicking. Text selection and copying stay inside the editor; the PDF itself supports component selection, links, navigation, and reading.

## Correcting text

Click a component to select it without opening a panel. Choose the Edit icon to edit its full text value, or the Comment icon to write feedback. The bar keeps the same dimensions when either panel opens or closes. Valid changes enter a browser draft and update a separately rendered PDF preview. Moving to another component, clicking outside, **Done**, Cmd/Ctrl+Enter, and Escape keep those changes without writing source. A change that crosses source values or generated content must be corrected or reset before leaving the editor. Formatting and structural changes remain agent work.

The floating bar keeps the pending count, Undo, Redo, Discard, and Save all together. Consecutive typing in one source value coalesces into history steps; native textarea undo remains available, while Cmd/Ctrl+Z and Shift+Cmd/Ctrl+Z operate on draft history outside text fields. Save all or Cmd/Ctrl+S validates the combined candidate and writes the group. Save errors retain the draft. A successful source save then updates the canonical PDF; only a ready result displays the saved confirmation. Export stays paused while text changes remain unsaved.

Drafts and their bounded history survive document navigation and reloads in the same browser tab. If source changes elsewhere, Refresh draft carries forward only edits whose original values and identities still match. Conflicts keep the draft for review. Storage failures retain the in-memory draft and warn before a reload can lose it. The latest saved group has one guarded, server-session-local Undo; later source changes invalidate it instead of overwriting newer work.

Open editors remember the source version they came from. Untouched text follows source updates; modified text from an older or unknown version stays available for review without silently becoming a new draft change.

A correction replaces text within one proven writable source value and preserves surrounding structure and formatting. Shared local constants update every occurrence, and the draft count counts that shared value once. Mixed formatting stays intact: individual changes must stay inside one existing source value. Imported, computed, and unsupported expressions are available for feedback rather than guessed from their displayed wording.

The renderer issues writable targets. Requests do not choose arbitrary files or source spans. The server checks the baseline document revision, PDF hash, source digests, and source ownership; validates all candidate files; and renders a real draft PDF through isolated source overrides. Previewing never changes document source or canonical artifacts. Save stages the validated replacements and uses guarded rollback on a write failure, preserving intervening external changes. These safeguards do not imply a filesystem-wide atomic rename across independent files.

## Binding reusable content

Native OpenDoc blocks provide content slots. Shared components can declare a caller-owned prop with the transparent `TextSlot` helper:

```tsx
import { Paragraph, TextSlot } from 'opendoc';

export function Byline({ author }: { author: string }) {
  return <Paragraph id="byline">
    <TextSlot slot="author" from="author">{author}</TextSlot>
  </Paragraph>;
}
```

For a validated data template, bind a string in the instance's `provenance.dataFile`:

```tsx
<TextSlot slot="client-name" field={['client', 'name']}>
  {data.client.name}
</TextSlot>

{data.terms.map(term => <Paragraph id={`term-${term.id}`} key={term.id}>
  <TextSlot slot="text" field={['terms', { id: term.id }, 'text']}>
    {term.text}
  </TextSlot>
</Paragraph>)}
```

Slots and record IDs must remain stable through edits and reordering. TextSlot adds no PDF node, style, or text. Bind the original string, not a formatted or computed representation. Data corrections run the existing template parser before saving; import `bindTemplate` from `opendoc/template` for template instances, or `validateTemplateInput` from the same module to wrap an existing parser for optional data components.

DataTable accepts transparent TextSlot content within cells. Supply `rowIds` for stable row identities when data can reorder. Cell values without a proven binding remain readable and commentable. Never bind a calculated total to an unrelated raw field merely to enable editing.

## Comments and agent context

Select any component and choose the Comment icon in the bottom bar to leave feedback. Switching between Edit and Comment keeps their drafts; an unfinished component comment also survives text-preview updates. Submitting closes the composer and leaves a marker. The bottom-right button opens all document comments; markers open comments for a component. Pencil and trash icons edit or delete feedback, and a comment row navigates to its selected component. Clicking outside closes the dock. Edits and deletion check versions; deleted feedback retains its history. Comments persist independently and are anchored against the saved document, even while a text draft is being previewed. New text comments attach to the whole text component; earlier phrase comments retain their anchors.

Phrase feedback records the stable block and text slot, original quote, and nearby text. Reflow changes geometry rather than identity. Wording changes relocate a quote only when it remains unambiguous in that same target; otherwise the original feedback stays visible with a changed-text indication. Anonymous multi-field compositions and duplicate slots retain the selected quote as block-level feedback, because their positional identities cannot safely follow reordering. Give reusable fields unique TextSlot names for durable phrase feedback. Existing whole-block comments keep working, and editing never resolves feedback automatically.

Read `.opendoc/current.json` immediately before working from a selection. `selection` contains its exact quote and logical range; `selectionCurrent` says whether it matches the current ready revision. `selectedText` identifies its slot and writable source when known. `manualEdit` reports editing activity, the pending edit count, whether a draft is being previewed, the latest saved group, and render status without exposing draft text. Pending comments include `anchorStatus` and their currently resolved selection when available.

Treat this as observed context. The user's request authorizes the work. Preserve local corrections, source identities, reference records, and comment history. If the current source has moved on, resolve the intended target before changing it. Do not infer that an agent is running merely because the app is connected.
