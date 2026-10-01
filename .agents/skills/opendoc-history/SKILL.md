---
name: opendoc-history
description: Review and restore earlier OpenDoc versions when the user asks what changed, wants to undo their own or the agent's change, go back to an earlier version of a paragraph, section, slide, or document, restore old wording, or bring back a deleted comment.
---

Use the user's OpenDoc workspace as the working directory. `documents/`, `templates/`, `themes/`, `assets/`, and `.opendoc/` are workspace paths; guide links are relative to this installed skill. Use `npx opendoc` for commands and keep authoring changes out of `node_modules/opendoc`. In Headless, follow [the remote workflow](../../../docs/HEADLESS.md); these commands and imports stay the same, and no browser or recipient-side installation is needed.

## 1. Identify the target

Use an explicitly named document and block, or resolve "this paragraph", "this slide", or a selection through [opendoc-current-document](../opendoc-current-document/SKILL.md). History is kept per document and follows stable block IDs; page numbers, slide positions, and visible wording are only clues. Read [Version history](../../../docs/HISTORY.md) for what is recorded and when a restore is refused.

**Ready:** the document is identified, with the block or section when the request names one.

## 2. Find the intended version

```sh
npx opendoc history list <document-id>
npx opendoc history block <document-id> <block-id>
npx opendoc history show <document-id> <version-id> --json
```

`list` prints versions newest first with their time, origin (Your edit, Agent change, Restored, Undo, or Earliest saved state), and a change summary. `block` lists each distinct earlier wording of one block, or of the authored block that contains it. `show` compares one version with the current source, block by block, and reports for each changed block whether a block or section restore is available and why not. To see what one change did, show the version listed just before it; the comparison also includes any later changes.

Without a running service, as in Headless, versions are recorded when commands run: `history` first records edits made since the latest version, so the newest agent edits appear as their own Agent change.

Match "yesterday", "before your change", or similar to version times and origins. When more than one version fits, or the recorded wording differs from the user's description, show the candidate wording and confirm before restoring.

**Ready:** one version is confirmed as holding what the user wants back.

## 3. Restore the narrowest scope

Restore only what was asked for, preferring one block, then one section, then the whole version:

```sh
npx opendoc history restore <document-id> <version-id> --block <block-id>
npx opendoc history restore <document-id> <version-id> --section <block-id>
npx opendoc history restore <document-id> <version-id>
```

`--block` restores one block's own content; on a section, it restores only the section's title or lead and keeps the current blocks inside. `--section` restores a section, slide, or other container with everything inside it. Without either flag, every text source returns to that version; files created since are kept and media is unchanged. Each restore first records the state it replaces and prints the command that undoes it.

A refused restore writes nothing. Act on its reason:

- **Generated, duplicate, moved, added, or removed block, or changed section contents:** offer the containing section or the whole version when that still matches the request; otherwise explain what cannot be restored and ask.
- **Unsaved text edits in the reader:** ask the user to save or discard them in OpenDoc; never discard a draft yourself.
- **Restored source does not render:** report the render error, such as a citation or media item that no longer exists; do not edit the document to force the restore.
- **Source changed during the restore:** list the history again and repeat from the latest state.

**Ready:** the requested content is restored at the narrowest working scope, or the refusal and available alternatives are explained.

## 4. Bring back deleted comments

Comments keep their own history, separate from document versions. `npx opendoc comments list <document-id>` includes comments deleted in the last 90 days with their status. Restore one with `npx opendoc comments restore <document-id> <comment-id>`; it returns with its identity, anchor, earlier open or resolved status, and history.

**Ready:** each requested comment is restored, or none was requested.

## 5. Verify and report

After restoring source, run `npx opendoc check` and complete [opendoc-review-document](../opendoc-review-document/SKILL.md) on the affected pages or slides. Restoring changes saved source, not earlier exports; re-export the requested PDF, and the PPTX for presentations, when the restored revision is being delivered.

Never edit, prune, or delete `documents/<document-id>/.history/`, and restore only on the user's request; answering "what changed" needs no restore.

**Done:** the user has the requested comparison, or the restored content is verified in the rendered output and reported with its source version and the printed Undo command; anything that could not be restored is identified with its reason.
