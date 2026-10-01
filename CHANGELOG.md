# Changelog

## Unreleased

### Arabic and right-to-left text

- PDFs, presentations, and PowerPoint exports support Arabic and mixed Arabic and English text. Set `direction` and `lang` on a theme or `Document`. The repaired Forme engine (core `0.20.1-opendoc.4`) lays out each line with the Unicode Bidirectional Algorithm, joins Arabic letters, and mirrors rows, lists, and tables.
- Noto Naskh Arabic 2.021 is bundled as a shared font asset, and Arabic text that a document's fonts cannot draw falls back to it automatically. A character that no font covers prints as `?` and is reported as a `missing-glyphs` issue.
- PowerPoint exports mark right-to-left paragraphs, follow the engine's resolved line direction, and align each paragraph as its PDF lines are aligned.
- Comments, text corrections, search, and name fields in the app follow the direction of the typed text.

### Version history

- Each document keeps 90 days of versions in `documents/<id>/.history/`. The app records saved edits, agent writes, and restores. Without a running service, as always in Headless, `create`, `check`, `review`, `export`, `comments`, `documents`, and `history` record agent edits first.
- The reader's **History** tab names changes by block and opening words, groups versions by day and by ten-minute bursts, marks changed words, and restores one block, one section, or a whole version, each with Undo.
- `npx opendoc history list|show|block|restore` works in both editions. `list --json` adds `groups` and each version's `description`; `show --json` adds `words` to changed blocks.
- Deleted comments stay restorable for 90 days under **Recently deleted**, `comments list --deleted`, and `comments restore`. `comments delete` is available from the command line.

### Organization

- Tags use a version 2 model: one of nine types for documents and templates, one status per document (`draft`, `in-review`, `final`, `archived`), a language derived from source text, and custom tags. `npx opendoc tags` sets, shows, and finds them, with `--type`, `--status`, and `--language` filters. Version 1 `tags.json` files are read as version 2 and saved in the new form on the next change.
- Theme folders are single-level and appear as filter buttons on the Themes tab. Nested folders from earlier versions are flattened, and the flat form is saved on the next folder or assignment change.
- Projects can set separate default themes for documents and presentations with `--document-theme` and `--presentation-theme`. Earlier versions report a `projects.json` with different defaults as invalid.
- `npx opendoc documents rename|duplicate|delete|trash|restore` manages documents from the command line in both editions. Deleted documents keep their history, comments, tags, and status in Trash.

### Reader and feedback

- Comments and History share one side panel, docked beside the pages on wide screens and a bottom sheet on narrow ones. The reader toolbar's **Comments** and **History** buttons open its tabs; **Comments** shows the number of open comments. The selection bar holds Edit, Comment, and History; a separate save bar appears only while there are changes to save.
- Comments can target a phrase within a paragraph or table cell. `comments add --phrase "words"` does the same from the command line, with `--target <field-id>` when the words appear in more than one field, and `comments list --anchors` reports whether each comment still finds its text. `comments add` works without a running service.
- Double-clicking text opens the editor. List items, plain `DataTable` cells and column headings, text passed through local helper components, and literal text a document passes to theme components are editable. Labels a theme or template generates explain why they cannot be edited.
- The document menu groups Rename, Duplicate, Move to project, Details, and Status, then Previous exports with its own archive icon, then Delete. Appearance moved into a submenu of the reader's options menu.
- Each comment shows when it was created, and deleting one offers Undo. Export suggests the document title as the filename.
- Each reader page is one tab stop, with arrow keys moving in reading order. Text fields share the buttons' focus ring, badge text meets WCAG AA contrast, the type scale is larger, and keyboard hints are hidden on touch screens.

### PowerPoint export

- Every exported object has a unique, descriptive name.

### Agent skills

- Workspaces include ten skills. New: `opendoc-revise-document`, `opendoc-assets-media`, `opendoc-history`, and `opendoc-organize`. The existing skills cover Arabic text, table rows, projects, phrase comments, and re-export.

## 0.5.0 — 2026-09-16

### Document review and authoring

- `opendoc review <id> --export` prepares PDF and editable PowerPoint from one captured presentation render. Failed preparation preserves the previous complete output set.
- Review reports include element bounds, parent coordinates, clipping ancestors, source locations, and line counts, plus changed and removed pages compared with the previous review.
- Layout warnings identify overlapping text, footer-area intrusion, split callouts, oversized keep-together blocks, and explicit paragraph line-limit violations.
- `Paragraph maxLines` expresses a review expectation without truncating text. `Block` and `Callout` accept `keepTogether`.

### PowerPoint export

- Uniform rounded panels export as editable rounded rectangles.
- Unsupported styling is reported during PDF review before PowerPoint export. Rounded containers that clip children are explicitly rejected for PowerPoint because separate child shapes cannot preserve that clipping; PDF output remains available.

### Reliability and contributor tooling

- Media freshness detects same-size source rewrites on filesystems with coarse timestamp resolution.
- Contributor verification helpers exercise the running application, exports, and review output. Startup requires an authenticated session handshake, cleans up failed launches, and supports linked checkout paths.
- Update acceptance uses the tested release's version instead of assuming a fixed baseline.

### Install or update

Both npm editions use version `0.5.0`: `@ryanyahya/opendoc` and `@ryanyahya/opendoc-headless`.

For an existing initialized workspace, stop its browser service first, then run:

```sh
npx opendoc update --version 0.5.0
```

The explicit version is necessary when moving from `0.4.x`, because the default updater stays within the current minor version before `1.0`. Restart the normal edition with `npx opendoc start` afterward.

Native PowerPoint appearance still requires inspection in PowerPoint; package and content checks do not establish visual equivalence.

## 0.4.0

Initial public npm release of the normal and Headless editions, including PDF production, editable PowerPoint export, shared themes and templates, and workspace-preserving updates.
