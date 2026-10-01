# Version history

OpenDoc keeps a version history for every document and presentation, so you can go back to earlier wording without losing later work. You can restore a single paragraph or heading, one section with everything inside it, or a whole earlier version. Restoring only replaces what you choose; the rest of the document stays as it is.

History is recorded automatically and kept for 90 days. It is stored inside each document's own folder, so it travels with the document when the folder is synced, copied, or backed up.

## What is recorded

OpenDoc records a version whenever a document's text sources change. Each version carries a short label for where it came from:

- **You**: a text correction saved from the reader with Save all.
- **Undo**: Undo saved changes in the reader.
- **Agent**: any change made outside the reader, usually by your coding agent or an editor. While OpenDoc runs, it waits for writes to settle for a few seconds, so one save or one burst of agent writes becomes one version. Without a running service, the commands an agent runs after editing record the change instead (see below).
- **Restore**: a block, section, or version restored from history. The state being replaced is recorded first, so every restore can be undone.
- **First version**: the first state OpenDoc saw, recorded when the service starts, the document first appears, `npx opendoc create` makes it, or one of the commands below first sees it.

Changes made while OpenDoc is closed are recorded as one Agent version the next time it starts, or earlier by the first command below. In OpenDoc Headless, and in normal OpenDoc while the browser service is stopped, there is no file watcher. Instead `create`, `check`, `review`, `export`, `comments`, `documents`, and `history` record a document's text sources as an Agent version when they differ from its latest version, before doing their own work: `check` and `export --all` for every document, the others for the documents they name. Because agents run `check` and `review` after editing, each round of edits keeps its own version; edits made between two commands become one version. A running service records changes itself, so these commands leave its history to it.

Text sources are the files the document owns in `documents/<id>/`: `index.tsx`, `theme.tsx`, `assets.json`, and local data or code such as JSON, CSV, and TypeScript files. Feedback in `comments.json` keeps its own history and is not part of document versions. Files in `media/` and other binary or very large files are identified by their hash only: they are never copied into history, and restoring never changes them. Use [Media](MEDIA.md) to regenerate or replace visuals.

## Restore from the reader

Choose the **History** button in the reader toolbar to open the **History** tab of the side panel, which it shares with **Comments**: docked beside the pages on wide screens and a bottom sheet on narrow ones. Versions are listed newest first and grouped by day. Each row says what changed, naming blocks by their opening words (for example: Edited “Quarterly results”, “Budget”), with its time and where it came from. Consecutive You, Agent, or Undo versions within ten minutes, such as a burst of agent writes, share one row that opens to list each of them; restores and first versions keep their own rows. Times read “8:42 PM” today, “Yesterday 3:10 PM”, then “Oct 1, 3:10 PM”.

Select a version to see how it differs from the current source. Every changed block shows its kind, such as Paragraph, Title, or Table, and its earlier and current wording, with removed words struck through and added words underlined. Long paragraphs show only the changed passages until you choose **Show full text**. Each block's stable ID is under **Details**, ready to copy for your agent. Changed blocks are outlined on the page, one outline per block; hovering or focusing an entry outlines it more strongly, and **Show on page** scrolls to it.

- **Restore block** replaces one paragraph, heading, callout, table, or other block with its wording from that version.
- **Restore section only** (or slide, group, and so on) restores a container's own title or lead and keeps the current blocks inside it.
- **Restore section** restores a section, slide, or other container together with everything inside it.
- **Restore whole version**, below the changed blocks, returns every text source to that version. Files created since are kept, and media is not changed.

Each restore asks for confirmation and then offers **Undo**. To see one block's earlier wording, select it on the page and choose **History** in the selection bar. Each distinct earlier wording is listed once; restoring it replaces that block or section only.

Restoring changes the saved source, so OpenDoc asks you to save or discard unsaved text edits first, as Export does.

## When a restore is refused

OpenDoc identifies blocks by the literal `id` written in the source, such as `<Paragraph id="welcome-introduction">`. It checks every restore before writing anything and leaves the file untouched when the result would be unsafe:

- **Generated IDs.** A block whose ID is produced by code, for example inside a `map` over data, has no source position of its own. Restore its containing section or the whole version, or ask your agent to give it a literal ID. Child IDs created by composite blocks, such as `<id>-heading` from a `Section`, belong to the block that creates them.
- **Duplicate IDs.** When an ID appears more than once in either version, OpenDoc cannot tell which copy to restore.
- **Moved, added, or removed blocks.** A block that moved to another file, or did not exist in one of the versions, can be restored through its containing section or the whole version.
- **Changed contents.** Restore section only needs the same blocks inside the section; otherwise restore the whole section.
- **Rendering.** The restored source is rendered first. If it does not render, for example because a citation or media item it used no longer exists, nothing is written.
- **Newer changes.** If the document changes after you opened a version, OpenDoc asks you to review the latest changes before restoring.

## Recently deleted comments

Deleting a comment keeps its record and history. The **Comments** tab lists comments deleted in the last 90 days under **Recently deleted**, each with **Restore**, which brings it back with its identity, anchor, earlier open or resolved status, and history. From the command line, `npx opendoc comments delete <doc> <comment-id>` deletes a comment the same way and prints the command that restores it, and `npx opendoc comments restore <doc> <comment-id>` restores it; `comments list` includes deleted comments with their status, and `comments list <doc> --deleted` lists only those deleted in the last 90 days, newest first, as **Recently deleted** does.

## Commands

```sh
npx opendoc history list <doc> [--json]
npx opendoc history show <doc> <version> [--json]
npx opendoc history block <doc> <block-id> [--json]
npx opendoc history restore <doc> <version> [--block <id> | --section <id>] [--json]
```

Each command first records changes made since the latest version when no service is running. `list` prints versions newest first, grouped by day and by bursts as the History panel shows them, with the same labels and descriptions. `show` compares one version with the current source, block by block, naming each changed block by its kind and opening words and listing the changed words. `block` lists the earlier wording of one block. `restore` restores the whole version; `--block` restores one block's own content, and `--section` a section, slide, or other container with everything inside it. It prints the command that undoes it. Restore refuses while the running reader holds unsaved text edits for the document.

With `--json`, `list` gives each version a `description` and adds `groups`: one entry per day, whose `runs` each have an `origin`, `label`, `description`, `from` and `to` times, and the IDs of their `versions`. `show --json` adds `words`, a list of `{ removed, added }` passages, to each block whose wording exists in both versions.

## Storage

History lives in `documents/<id>/.history/`:

- `versions/` holds one small JSON manifest per version: its time, origin, the hash of each text source, the hash of each media file, and a summary of what changed. Manifests are written once and never edited.
- `blobs/` holds the text sources, compressed with gzip and named by the SHA-256 hash of their contents. Unchanged files are stored once, however many versions use them.
- `history.json` records the storage format.

A version of the welcome document whose `index.tsx` changed adds about 8 KB: a 6 KB compressed source and a 2 KB manifest. A restore back to earlier wording usually adds only the manifest.

Because manifests are never rewritten, two synced computers do not edit the same file. Sync conflict copies of a manifest are recognised by the version ID inside them, and a partially synced manifest is skipped until it is complete. Versions older than 90 days are removed when a version is recorded and when OpenDoc starts; the latest version is always kept. Compressed sources no longer used by any version are then removed, unless a manifest is still incomplete.

The `.history` folder is ignored by the renderer, the file watcher, exports, the media library, and packaging. Duplicating a document starts a new history; deleting it moves its history to the recovery folder with the rest of the document. Do not edit or delete history files by hand.
