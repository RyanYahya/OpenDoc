---
name: opendoc-revise-document
description: Revise an existing OpenDoc document or presentation directly, without saved comments, when the user asks to update its content or figures, shorten or expand it, translate it or convert it to Arabic or right-to-left, turn a document into a deck or a deck into a document, switch its theme, or change its logo or fonts, then review it again and redeliver the PDF and PowerPoint.
---

Use the user's OpenDoc workspace as the working directory. `documents/`, `templates/`, `themes/`, `assets/`, and `.opendoc/` are workspace paths; guide links are relative to this installed skill. Use `npx opendoc` for commands and keep authoring changes out of `node_modules/opendoc`. In Headless, follow [the remote workflow](../../../docs/HEADLESS.md); these commands and imports stay the same, and no browser or recipient-side installation is needed.

## 1. Resolve the document and the change

Use an explicitly named document, or resolve "this document" or a selection through [opendoc-current-document](../opendoc-current-document/SKILL.md). `npx opendoc tags show document <document-id>` gives its type and status. Saved comments belong to [opendoc-apply-comments](../opendoc-apply-comments/SKILL.md), earlier wording to [opendoc-history](../opendoc-history/SKILL.md), and a new deliverable to [opendoc-create](../opendoc-create/SKILL.md).

In normal OpenDoc, read `manualEdit.pendingEdits` in `.opendoc/current.json` first; when the user has unsaved text corrections in the reader, ask them to save or discard them before you edit the same document. When a translation or conversion could replace work the user still needs, ask whether to change the document in place or make a new one. A copy keeps the original intact:

```sh
npx opendoc documents duplicate <document-id> --id <new-id> --title "New title"
```

`--title` names the copy in the library; change `meta.title` in its source for the PDF title.

**Ready:** the target, the scope of the change, and whether it happens in place or in a copy are clear.

## 2. Make the change in source

Edit the owning source: `index.tsx`, or a template instance's local data file named by `provenance.dataFile`; never the shared template or theme for one document. Keep block, slide, text-slot, and `rowIds` identities for content that remains, so comments and history stay attached; give new blocks new unique IDs. Keep visible wording literal ([Selection](../../../docs/SELECTION.md)). Distinguish supplied facts from inference, and never invent figures or citations to fill a gap.

Load only the branch needed:

- **Content and data updates:** replace the stated text, figures, and tables. A chart built from prepared data needs its image regenerated, reviewed, and recorded through [opendoc-assets-media](../opendoc-assets-media/SKILL.md).
- **Shortening or expanding:** cut or add within the existing structure, and remove blocks rather than hiding them. Report removed blocks that had open comments. In a deck, each slide must still fit one 960 × 540 page; add an explicit slide rather than shrinking text.
- **Translation and right-to-left:** translate every visible string, including captions, table headings, and alt text, and keep the IDs. For Arabic, set the base direction once (`<Document direction="rtl" lang="ar">`, or the same props on `Presentation`), and bind the bundled family with `npx opendoc assets bind <document-id> body-font noto-naskh-arabic` (and `heading-font` when headings are Arabic). Write mixed Arabic, English, and numbers naturally; never reverse words or insert directional marks. Give an English paragraph `style={{ direction: 'ltr' }}`, remove `Em` and italics from Arabic text, and check custom compositions that rely on physical `paddingLeft` or `left`. Read [Arabic and right-to-left text](../../../docs/AUTHORING.md#arabic-and-right-to-left-text). Language is detected; do not tag it.
- **Document to deck, or deck to document:** the format is fixed at creation, so create the new item in the same project and theme, then move the content across:

  ```sh
  npx opendoc create <new-id> --project <project-id> --title "Title" --format presentation --theme <theme-id>
  ```

  Omit `--format presentation` for a document. Restructure rather than paste: one idea per `Slide` with explicit slides and no flow ([presentations](../../../docs/AUTHORING.md#presentations)), or flowing `Pages` for a document. Reuse block IDs for content that carries over. Bring visuals across with `npx opendoc media import`, and rebind the original's logo and fonts from its `assets.json` with `npx opendoc assets bind`. Tag the new item with its type and `draft`. Leave the original unchanged unless the user asks to delete it (`npx opendoc documents delete <document-id>`).
- **Switching theme:** inspect the new theme with `npx opendoc themes inspect <theme-id>` and read its `design.md`. In the document's `theme.tsx`, change only the base import (`../../themes/<old-id>` to `../../themes/<theme-id>`), set `meta.theme` to the new ID, and keep `assets.json`, whose exact logo and font choices carry over. Replace imports of the old theme's components or tokens with the new theme's equivalents or standard primitives. The new theme's asset defaults apply only to new documents: read them with `npx opendoc assets defaults <theme-id>` and bind them explicitly when the user wants its fonts or logo.
- **Logos and fonts:** rebind or unbind with `npx opendoc assets bind|unbind`, and place logos explicitly; [opendoc-assets-media](../opendoc-assets-media/SKILL.md) covers the workflow.

**Ready:** the requested change is in the owning source, with identities preserved and any removed or new blocks known.

## 3. Check and review

Run `npx opendoc check`; without a running service it records this round of edits as an Agent version. Then run `npx opendoc review <document-id> --json` and complete [opendoc-review-document](../opendoc-review-document/SKILL.md). Inspect changed pages and their neighbors (`changes.changedPages`); a translation, conversion, or theme switch changes every page, so inspect them all, including the right-to-left checks. `npx opendoc comments list <document-id> --anchors` shows open comments whose passages changed or disappeared; report them and leave them to [opendoc-apply-comments](../opendoc-apply-comments/SKILL.md), never resolving them as a side effect.

**Ready:** the current source renders and every affected page has been inspected, with material defects fixed.

## 4. Re-export and deliver

Export the reviewed, unchanged revision: `npx opendoc export <document-id>`, and for a presentation also `npx opendoc export <document-id> --format pptx`, or use the outputs of `npx opendoc review <document-id> --export --json`. Deliver every requested format from the same final source through the host agent's existing channel; earlier exports do not change. Once delivered, set `npx opendoc tags status <document-id> final` unless the user keeps it `in-review` or `archived`; keep its type and tags. If the user wants the change undone, use [opendoc-history](../opendoc-history/SKILL.md).

**Done:** the revised files are reviewed and delivered (PDF for documents; PDF and PPTX for presentations unless the user chose one), with the change summarized and any unverified rendering or remaining limit stated.
