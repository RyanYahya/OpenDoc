# Tags

Tags help agents and people find, choose, and track documents (presentations included), templates, and themes. They are written mostly by agents through `npx opendoc tags`; the app shows them lightly. Tags never change source, files, IDs, rendering, or exports.

Each item has up to four facets:

| Facet | Applies to | Stored | How it is set |
| --- | --- | --- | --- |
| **Type** | Documents, templates | `tags.json` | One standard type, through `tags add` or **Details** |
| **Status** | Documents | `tags.json` | `tags status` or the document menu |
| **Language** | Everything | Never | Detected from the item |
| **Custom tags** | Everything | `tags.json` | Free text, through `tags add` or **Details** |

## Types

An item has one type. Typing a type's ID, label, or alias in any letter case selects it, and a new type replaces the old one. Themes have no type; a type word given to a theme becomes a custom tag with the type's label, such as *Report*.

| Type | Also selected by |
| --- | --- |
| `report` | case study, study, analysis, assessment, audit, evaluation, paper, research paper, white paper |
| `proposal` | plan, pitch, pitch deck, bid, tender, business case, business plan, roadmap |
| `brief` | memo, memorandum, one-pager, briefing, summary, executive summary, overview, fact sheet, profile, company profile |
| `minutes` | meeting minutes, meeting notes, MoM, agenda |
| `letter` | cover letter, correspondence, circular, notice |
| `guide` | manual, handbook, policy, procedure, SOP, training, tutorial, how-to, playbook, guidelines, brand guidelines |
| `article` | essay, feature, story, newsletter, blog post, op-ed, magazine, literary text |
| `cv` | resume, résumé, curriculum vitae, bio, biography |
| `invoice` | quotation, quote, estimate, receipt, bill, pro forma |

The format is already known, so presentation and document are never types.

## Status

A document has no status until one is set: `draft`, `in-review`, `final`, or `archived`. Labels and aliases also work in any letter case: *in review*, *review*, and *reviewing* select `in-review`, *done* and *delivered* select `final`, and *archive* selects `archived`. The app shows the status as a small badge on cards, list rows, and the reader title. Duplicating a document copies its tags but not its status.

## Language

`english`, `arabic`, or `bilingual` is derived on demand and never stored. OpenDoc counts Arabic-script and Latin letters, ignoring digits and symbols:

- At least 75% Arabic letters is `arabic`, below 15% is `english`, and anything between is `bilingual`. When the item declares Arabic (`direction="rtl"` or a `lang` starting with `ar`), the bounds are 60% and 5%.
- With fewer than 24 letters, the declaration decides. Substantial text outweighs it, so a right-to-left document written only in English is `english`.
- A document or template uses the prose in its source files: JSX text and string values containing a space or a non-ASCII letter. Media, history, asset bindings, theme files, guides, and schemas do not count. The app and the command line of both editions read the same source the same way, so an item has the same language everywhere, before and after it renders.
- A theme uses its declared `direction` and `lang`: Arabic is `arabic`, Arabic with `direction: 'auto'` is `bilingual`, and anything else is `english`.

Results are cached per source revision.

## Custom tags

Any other text is a custom tag, such as a client or programme name. Custom tags are trimmed and compared without regard to case; a tag already used elsewhere keeps its established capitalization, and the only item using it can correct it. They stay in the workspace vocabulary after the last item stops using them, until deleted. Status and language words cannot be custom tags. Each item has up to 20 tags of 40 characters or fewer, without commas.

## In the app

- Cards and list rows show the type beside the format, and the status badge. Custom tags appear only in **Details**.
- **Documents**, **Presentations**, and each project offer **Type**, **Status**, **Language**, and **Tag** under the filter bar's **Filter** button, each with item counts and only when it would narrow the list: a type or status when items differ in it, a language when items are in more than one, and a tag when some items carry it. Active filters show as removable chips beside **Filter**, and the address keeps them. Search also matches the type, status, and custom tags. See [Find work in the library](WORKSPACE.md#find-work-in-the-library).
- A document's **…** menu and the reader's options menu offer **Details…** (type, status, custom tags) and **Status**.
- **Templates** shows each template's type, filters by **Type**, **Language**, and **Tag**, and edits a template's details from its page.
- **Themes** filters by **Language** and **Tag** under **Filter**, beside the folder buttons, and folders and filters combine. Tags show on a theme's page, not its card, and each theme's menu keeps **Edit tags…**.

## Command line

```sh
npx opendoc tags                                        # types, statuses, languages, custom tags, with counts
npx opendoc tags show document q3-review                # type, status, language, and custom tags
npx opendoc tags add document q3-review report "Client Acme"
npx opendoc tags status q3-review draft                 # draft | in-review | final | archived
npx opendoc tags status q3-review --clear
npx opendoc tags remove document q3-review "Client Acme"
npx opendoc tags set template invoice invoice Finance
npx opendoc tags find --type minutes --status final
npx opendoc tags find "Client Acme" --language arabic --kind document
npx opendoc tags create "Project Phoenix"
npx opendoc tags delete "Project Phoenix" [--untag]
npx opendoc templates list --type invoice --language english
npx opendoc themes list --tag Minimal --language arabic
```

`<kind>` is `document`, `presentation`, `theme`, or `template`. A presentation is a document with a presentation format, so `document` and `presentation` are interchangeable and results report `"kind": "document"`. `tags` and `tags list` take `--kind` to count one kind. Tags may be separate arguments or comma-separated; a type spelling sets the type, and removing one clears it. `set` with no tags clears an item's type and custom tags. `tags status <id>` alone prints the status. `find` needs at least one tag or filter, and returns items that carry every listed tag and match each filter; `--status none` finds documents without a status. Documents in `find` also report their library name, format, and project. Every command prints JSON with `type` and `status` as `null` when unset. `npx opendoc themes tags <theme-id>` from earlier versions still edits a theme's tags.

## Tagging by agents

1. When you create a document or presentation, set one type when one fits and `draft`: `npx opendoc tags add document <id> <type>` and `npx opendoc tags status <id> draft`.
2. Set `final` with `npx opendoc tags status <id> final` once the reviewed files are delivered.
3. Give a new template its type. Themes take no type; add a custom tag to a theme only when it will help find it, such as a brand name.
4. Add a custom tag only for a name you will reuse, such as a client or programme; check `npx opendoc tags` first and reuse an existing spelling.
5. Never set a language: it is detected. Never remove or rename tags the user applied unless asked.

## Storage

`tags.json` in the workspace root holds the custom vocabulary, each item's type and custom tags, and each document's status:

```json
{
  "version": 2,
  "custom": ["Client Acme"],
  "documents": { "q3-review": ["report", "Client Acme"] },
  "themes": { "field-manual": ["Technical"] },
  "templates": { "invoice": ["invoice"] },
  "status": { "q3-review": "final" }
}
```

An item's list holds its type ID first, then its custom tags in their display spelling. Browser and command-line changes serialize through a local lock and atomically replace the file. Entries for items whose folders no longer exist are kept while reading and dropped on the next change. A deleted document's tags and status are kept with it in Trash and return when it is restored. An invalid file is reported without being overwritten; tags are unavailable until it is repaired, and everything else keeps working. New workspaces start without this file, and packages never include one.

### Earlier versions

Version 1 files are read as version 2 in memory and saved as version 2 on the next change; no information is lost:

| Version 1 tag | Becomes |
| --- | --- |
| First Type tag with a version 2 type (`memo`, `plan`, `policy`, …) | The item's type (documents and templates) |
| Later Type tags naming another type, Type tags on themes, and `contract` | Custom tags with their label, such as *Plan* or *Contract* |
| Status tags on a document | Its status; the most advanced wins (archived, final, in review, draft) |
| Status tags on themes and templates | Custom tags, such as *Draft* |
| Language tags | Dropped; language is now detected |
| Area, Audience, and Style tags | Custom tags with their label, such as *Finance* or *Minimal* |
| Custom tags | Unchanged; one spelled `article` becomes the type of an item without one |

Theme tags kept in `themes/folders.json` by even earlier versions are read the same way for any theme `tags.json` does not mention, and move into `tags.json` on the next tag change. Trash receipts from version 1 migrate when restored.
