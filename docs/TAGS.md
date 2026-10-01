# Tags

Tags label documents (presentations included), themes, and templates so they can be filtered across every project and theme folder. OpenDoc ships a standard vocabulary that covers most work; a workspace adds custom tags only for what the vocabulary does not name, such as a client or programme. Tags never change source, files, IDs, rendering, or exports.

## Standard vocabulary

Standard tags have a stable lowercase ID and a display label. Typing an ID, label, or listed alias in any letter case selects the standard tag.

| Group | Tags | Usually fits |
| --- | --- | --- |
| Type | `report`, `proposal`, `brief`, `plan`, `minutes`, `memo`, `letter`, `policy`, `guide`, `invoice`, `quotation`, `contract`, `cv`, `profile`, `newsletter`, `case-study`, `pitch`, `training` | Documents, themes, templates |
| Area | `finance`, `operations`, `strategy`, `marketing`, `sales`, `product`, `research`, `hr`, `legal`, `technical` | Documents, themes, templates |
| Audience | `internal`, `client`, `executive`, `public` | Documents, templates |
| Language | `english`, `arabic`, `bilingual` | Documents, themes, templates |
| Status | `draft`, `in-review`, `final`, `archived` | Documents |
| Style | `formal`, `minimal`, `editorial`, `bold`, `playful` | Themes, templates |

Aliases include *manual* and *handbook* for `guide`, *quote* for `quotation`, *agreement* for `contract`, *resume* for `cv`, *human resources* for `hr`, *customer* for `client`, *leadership* and *board* for `executive`, and *review* for `in-review`. `npx opendoc tags` lists them all. The document or presentation format is already known, so it is never a tag.

An item has at most one **Status**: adding `final` to a draft replaces `draft`. Other groups accept several tags. Each item can have up to 20 tags of 40 characters or fewer, without commas.

## Custom tags

Any other text becomes a custom tag. Custom tags are trimmed and compared without regard to case; a tag already used elsewhere keeps its established capitalization, and the only item using a custom tag can correct it. Custom tags stay in the workspace vocabulary after the last item stops using them, so they remain suggestions until deleted.

## In the app

- **Documents**, **Presentations**, and each project show tags on cards and list rows. Their **Filter by tag** control lists the tags in use, grouped like the vocabulary, with counts; search also matches tag labels.
- A card's **…** menu and the reader's options menu offer **Edit tags…**. The editor shows the standard groups suited to the item, then custom tags; choose a tag to add or remove it, or type a new one and press Enter.
- **Themes** shows tags on cards and on a theme's page, filters across every folder, and keeps **Edit tags…** in each theme's menu.
- **Templates** shows tags on cards, filters both the Documents and Presentations tabs, and offers **Edit tags…** on a template's page.

## Command line

```sh
npx opendoc tags                                   # vocabulary and custom tags, with counts
npx opendoc tags --kind template                   # counts for one kind
npx opendoc tags show document q3-review
npx opendoc tags add document q3-review report finance executive english draft
npx opendoc tags add presentation board-deck final # replaces its previous status
npx opendoc tags remove theme field-manual "Old brand"
npx opendoc tags set template invoice invoice finance
npx opendoc tags find finance client --kind document
npx opendoc tags create "Project Phoenix"
npx opendoc tags delete "Project Phoenix" [--untag]
npx opendoc themes list --tag minimal
npx opendoc templates list --tag invoice
```

`<kind>` is `document`, `presentation`, `theme`, or `template`. Tags may be given as separate arguments or comma-separated. `set` with no tags clears an item. Removing a tag an item does not have is not an error. `find` requires every listed tag and reports each document's library name, format, and project. `delete` refuses a custom tag still in use unless `--untag` also removes it from those items; standard tags cannot be deleted. Every command prints JSON. `npx opendoc themes tags <theme-id> --add <tag>` remains available and uses the same store.

## Tagging by agents

Agents apply tags whenever they create a document, presentation, theme, or template, so new work is filterable from the start:

1. Choose two to five fitting standard tags: one **Type** when one applies, the **Area**, the **Audience** for documents and templates, the **Language** (`arabic` or `bilingual` when the text is not only English), **Style** for themes and templates, and `draft` for a new document.
2. Add a custom tag only when no standard tag fits and the label will be reused, such as a client or programme name. Check `npx opendoc tags` for existing custom tags first and reuse their spelling.
3. Run `npx opendoc tags add <kind> <id> <tag>...` once the item exists. Add `final` when a document is delivered; it replaces `draft` or `in-review`.
4. Never remove or rename tags the user applied unless asked.

## Storage

`tags.json` in the workspace root holds the custom vocabulary and each item's tags:

```json
{
  "version": 1,
  "custom": ["Project Phoenix"],
  "documents": { "q3-review": ["report", "finance", "executive", "draft", "Project Phoenix"] },
  "themes": { "field-manual": ["technical", "bold"] },
  "templates": { "invoice": ["invoice", "finance"] }
}
```

Standard tags are stored by ID and custom tags by their display text. Browser and command-line changes serialize through a local lock and atomically replace the file. Entries for items whose folders no longer exist are kept while reading and dropped on the next change. A deleted document's tags are kept with it in Trash and return when it is restored; a duplicate starts with the original's tags. An invalid file is reported without being overwritten; tags are unavailable until it is repaired, and everything else keeps working. New workspaces start without this file, and packages never include one.

Earlier versions stored theme tags in `themes/folders.json`. They are still read for any theme `tags.json` does not mention, and the next tag change moves them into `tags.json` and removes them from the folders file. Theme folders stay in `themes/folders.json`.
