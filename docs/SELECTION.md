# Selection and quick corrections

OpenDoc uses stable component selection for text editing and feedback. A compact selection bar at the bottom of the reader offers Edit, Comment, and History for the selected component. Edit and Comment open beside the selection, and a separate save bar appears only while there are changes to save. Saved comments and version history share one side panel. Hover outlines identify components before clicking. Dragging across words in a text component selects that phrase for feedback; copying stays inside the editor. The PDF otherwise supports component selection, links, navigation, and reading.

From the keyboard, each page or slide is a single Tab stop. Arrow keys move between its components in visual reading order (down each column, across table rows), Home and End reach the first and last, and Enter or Space selects, exactly as a click does. When a component's text is selectable on its own, the arrow keys visit the text; Alt+Up Arrow (Option+Up Arrow on a Mac) moves to the enclosing component and Alt+Down Arrow back to its contents. Escape clears the selection. Skip links at the top of the reader jump to the document and to comments. Component names come from their kind and visible text, never from block IDs.

## Correcting text

Click a component to select it without opening a panel. Choose **Edit** in the selection bar to edit its full text value, or **Comment** to write feedback. Double-clicking (or double-tapping) text selects it and opens the editor directly, with the clicked word selected. Where text cannot be edited, a double-click only selects it. The editor opens just below the selected text, or above it when only that side has room, and the page scrolls to keep the text in view; on narrow screens it is a bottom sheet above the bars. Valid changes enter a browser draft and update a separately rendered PDF preview. Moving to another component, clicking outside, **Done**, Cmd/Ctrl+Enter, and Escape keep those changes without writing source. A change that crosses source values or generated content must be corrected or reset before leaving the editor. Formatting and structural changes remain agent work.

The save bar keeps the pending count, Undo, Redo, Discard, and Save all together. It appears beside the selection bar while changes are unsaved or saving, while Redo is available, or when an editing message needs attention, and it briefly confirms **All changes saved** before leaving; Undo saved changes stays in the document options menu. Consecutive typing in one source value coalesces into history steps; native textarea undo remains available, while Cmd/Ctrl+Z and Shift+Cmd/Ctrl+Z operate on draft history outside text fields. Save all or Cmd/Ctrl+S validates the combined candidate and writes the group. Save errors retain the draft. A successful source save then updates the canonical PDF; only a ready result displays the saved confirmation. Export stays paused while text changes remain unsaved.

Drafts and their bounded history survive document navigation and reloads in the same browser tab. If source changes elsewhere, Refresh draft carries forward only edits whose original values and identities still match. Conflicts keep the draft for review. Storage failures retain the in-memory draft and warn before a reload can lose it. The latest saved group has one guarded, server-session-local Undo; later source changes invalidate it instead of overwriting newer work. Every saved group is also recorded in [version history](HISTORY.md), where the earlier wording of blocks with literal IDs stays restorable for 90 days.

Open editors remember the source version they came from. Untouched text follows source updates; modified text from an older or unknown version stays available for review without silently becoming a new draft change.

A correction replaces text within one proven writable source value and preserves surrounding structure and formatting. A plain quoted prop such as `title="Programme lead"`, or plain JSX text, stays plain when the new wording fits; wording with a line break, a quote of the same kind, braces, angle brackets, or `&` is written as an expression such as `title={"Say \"hi\""}`. Shared local constants update every occurrence, and the draft count counts that shared value once. Mixed formatting stays intact: individual changes must stay inside one existing source value. Imported, computed, and unsupported expressions are available for feedback rather than guessed from their displayed wording. When Edit is unavailable, its tooltip says why and suggests a comment.

The renderer issues writable targets. Requests do not choose arbitrary files or source spans. The server checks the baseline document revision, PDF hash, source digests, and source ownership; validates all candidate files; and renders a real draft PDF through isolated source overrides. Previewing never changes document source or canonical artifacts. Save stages the validated replacements and uses guarded rollback on a write failure, preserving intervening external changes. These safeguards do not imply a filesystem-wide atomic rename across independent files.

## Binding reusable content

Prefer literal text: children such as `<Paragraph id="intro">Text</Paragraph>`, string props, and local `const` strings are editable where they are written. Helper components declared in the same document file also stay editable without extra markup:

```tsx
function Entry({ id, title, dates }: { id: string; title: string; dates?: string }) {
  return <Block id={id}>
    <Paragraph id={`${id}-title`}>{title}</Paragraph>
    {dates && <Paragraph id={`${id}-dates`}>{dates}</Paragraph>}
  </Block>;
}

<Entry id="role" title="Project lead" dates="2024 to present" />
```

The renderer follows each rendered string back through the component instance that produced it, to a literal prop, child, constant, or array element in the same file. A correction changes that instance's call site. Values passed through `props.title`, destructured props with literal defaults, `.map`, `.filter`, `.slice`, literal array indexes, and same-file helper functions are followed. When a mapped array contains the same wording twice, neither copy is editable, because the rendered text cannot identify its source.

`List` items follow the same rules. Each item's text saves to its own record, which is found by its `id`, so two literal items with the same wording stay separately editable:

```tsx
const steps = [{ id: 'draft', text: 'Draft the plan' }, { id: 'review', text: 'Review it' }];

<List id="actions" items={[{ id: 'call', children: 'Call the vendor' }, { id: 'sign', children: <>Sign <Strong>both</Strong> copies</> }]} />
<List id="steps" ordered items={steps.map(step => ({ id: step.id, children: step.text }))} />
```

Bullets and numbers are generated markers, never text of their own: selecting one selects its item, and Edit opens the item's text. An item whose text is computed, imported, also used as an ID or in logic, or repeated within a mapped array stays read-only, and the Edit tooltip says so.

`DataTable` column headings work the same way, each saving to its own column record. A column with an `id` is found by it; without one, a heading is editable when its wording identifies one column, so two columns labeled alike need IDs to be editable:

```tsx
<DataTable id="costs" columns={[{ id: 'item', label: 'Item', width: 2 }, { id: 'cost', label: 'Cost' }]} rows={rows} />
```

Plain `DataTable` cells save to their own value in `rows`. With `rowIds`, each row is found at the position of its ID, so rows with the same wording stay separately editable; without them, a cell is editable when its row's wording identifies one written row. A cell's column is its position in the row:

```tsx
<DataTable id="hours" columns={[{ label: 'Stage' }, { label: 'Hours' }]}
  rows={[['Research', 24], ['Drafting', 48]]} rowIds={['research', 'drafting']} />
```

A number written as a number literal takes a plain number such as `1250`, `-3`, or `12.5`, without commas, spaces, units, or trailing zeros, and saves as a number literal; anything else shows an inline message and keeps the draft. A cell written as a string, such as `'20%'`, edits as text. Rows in a local constant array or a `.map` over one follow the same rules, and a mapped cell is editable when its wording identifies one value. A cell stays read-only, and its Edit tooltip says why, when it is computed or formatted (a total, or a percentage built in code), when its value is also used in calculations, or when its row repeats another row's wording and the table has no `rowIds`; that tooltip suggests adding them.

Text stays read-only, with a reason in the Edit tooltip, when its value is computed or transformed, imported from another file, forwarded with a spread, reaches a component or helper that is also used another way, or is also used as an ID, key, link, lookup, comparison, or other logic. A presence check such as `{dates && …}` and reading `.length` are allowed. Keep IDs as separate props instead of deriving them from visible text.

Shared components in other files, such as templates, declare a caller-owned prop with the transparent `TextSlot` helper:

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

A component that displays records from a caller-owned prop names the record and field with `path`, as `List` does: `<TextSlot slot="children" from="items" path={[{ id: item.id }, 'children']}>{item.children}</TextSlot>`. For records without IDs, `{}` stands for any record: the text is editable only when its wording identifies one written value. An optional `readOnlyReason` replaces the general Edit tooltip when the slot's text cannot be traced to one written value. Text placed by a theme, template, or other shared file is never edited from a document; its tooltip names that file.

Wrap marks a component generates, such as counters, fixed prefixes, and arrows, in `Decoration`. Drawn as its own text, a decoration is never a text target, like a list bullet; inside other text it stays a fixed, read-only part, and an optional `reason` replaces its Edit tooltip. Give a label the component writes or transforms a `TextSlot` with a `reason`, which keeps it read-only and becomes its Edit tooltip. [Themes](THEMES.md#editable-text-in-components) shows these patterns in theme components.

Slots and record IDs must remain stable through edits and reordering. TextSlot adds no PDF node, style, or text. Bind the original string, not a formatted or computed representation. Data corrections run the existing template parser before saving; import `bindTemplate` from `opendoc/template` for template instances, or `validateTemplateInput` from the same module to wrap an existing parser for optional data components.

DataTable also accepts transparent TextSlot content within cells, such as a data template's field binding or a `reason` for a calculated value. Never bind a calculated total to an unrelated raw field merely to enable editing.

## Comments and agent context

Select any component and choose **Comment** in the selection bar to leave feedback. To comment on part of a paragraph, drag across its words on the page, which selects whole words within that one text component, or select the words in the text editor, then choose **Comment**. Without a selected phrase, feedback covers the whole component. Switching between Edit and Comment keeps their drafts; an unfinished component comment also survives text-preview updates. The composer opens beside the selection, next to a selected phrase's own lines. Submitting closes it and leaves a marker. The **Comments** button in the reader toolbar, beside **History**, opens the **Comments** tab of the side panel with every comment, and its badge counts open comments; a marker opens it on that component's comments, with a way back to all of them. Pencil and trash icons edit or delete feedback, and a comment row navigates to its selected component while the panel stays open. The tab shows the count of open comments. The side panel docks beside the pages on wide screens, which move over to make room, and becomes a bottom sheet on narrow screens, where it takes turns with the editor and composer. It reopens on its last tab; Escape or its close button closes it and returns focus to the control that opened it. Edits and deletion check versions; deleted feedback retains its history, and Undo restores the same comment and anchor. After the Undo notice closes, **Recently deleted** at the end of the comments panel still restores comments deleted in the last 90 days. Comments persist independently and are anchored against the saved document, even while a text draft is being previewed. A phrase that includes unsaved draft wording therefore comments on its whole component, and the composer says so. Open phrase comments underline their phrase on the page; the comment list quotes it, and choosing the comment selects and scrolls to the phrase.

Phrase feedback records the stable block and text slot, original quote, and nearby text. Reflow changes geometry rather than identity. Wording changes relocate a quote only when it remains unambiguous in that same target; otherwise the original feedback stays visible, and its list entry marks the text as changed. Anonymous multi-field compositions and duplicate slots retain the selected quote as block-level feedback, because their positional identities cannot safely follow reordering. Give reusable fields unique TextSlot names for durable phrase feedback. A `DataTable` cell takes phrase feedback when the table has `rowIds`, which give each row a durable identity; column `id`s also keep it with its column if columns reorder. Without `rowIds`, a cell's quote stays block-level feedback on the table. Existing whole-block comments keep working, and editing never resolves feedback automatically.

The command line uses the same anchors, with or without a running service:

```sh
npx opendoc comments add <doc> <block-id> "Shorten this claim." --phrase "exact words"
npx opendoc comments add <doc> <block-id> "Check this figure." --phrase "1250" --target <field-id>
npx opendoc comments list <doc> --anchors
npx opendoc comments list <doc> --deleted
```

`--phrase` anchors the comment to one occurrence of those words in the block's current wording, such as one table cell. When the words appear more than once, quote more of them, or add `--target` with the text field the error message names. As in the app, a phrase in a field without a durable identity, such as a cell in a table without `rowIds`, is saved as block-level feedback that quotes it. `--anchors` checks every comment against the current render and adds `anchorStatus` (`attached`, `changed`, or `missing`) and `targetAvailable`. `--deleted` lists comments deleted in the last 90 days, newest first, as **Recently deleted** does; `comments restore <doc> <comment-id>` brings one back.

Read `.opendoc/current.json` immediately before working from a selection. `selection` contains its exact quote and logical range; `selectionCurrent` says whether it matches the current ready revision. `selectedText` identifies its slot and writable source when known. `manualEdit` reports editing activity, the pending edit count, whether a draft is being previewed, the latest saved group, and render status without exposing draft text. Pending comments include `anchorStatus` and their currently resolved selection when available.

Treat this as observed context. The user's request authorizes the work. Preserve local corrections, source identities, reference records, and comment history. If the current source has moved on, resolve the intended target before changing it. Do not infer that an agent is running merely because the app is connected.
