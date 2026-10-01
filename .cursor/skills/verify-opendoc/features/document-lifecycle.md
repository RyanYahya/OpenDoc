# Document lifecycle

A user renames, duplicates, deletes, and restores a document from its **…** menu, or with `npx opendoc documents` in either edition. Delete moves the folder to Trash with its history, comments, tags, and status; restore brings it back under the same ID.

## Sub-features

- `doc-rename` changes the library name; source and PDF title are unchanged.
- `doc-duplicate` copies saved source, media, comments, and tags into a new ID with fresh history and no status; options choose `--id`, `--title`, and `--project`.
- `doc-delete` moves the document to `.opendoc/trash/<restore-id>/` and prints `npx opendoc documents restore <restore-id>`.
- `doc-trash` lists deleted documents, most recent first.
- `doc-restore` restores by restore ID, or by document ID when Trash holds one copy.

## How to get to it (user POV)

- In the browser, a card's or the reader's **…** menu: **Rename**, **Duplicate**, **Delete** (with **Undo**).
- Installed workspace, either edition: `npx opendoc documents rename|duplicate|delete|trash|restore`.
- Checkout with the server running: `pnpm documents -- <action> ...`; the service picks up the change through its file watcher.

## Driving it with the Headless CLI

Preconditions:

- A throwaway Headless workspace (see [Headless init](headless-init.md)); never the checkout's Welcome documents.

- **Tag the source.** `npx opendoc tags add document welcome report --json` and `npx opendoc tags status welcome final --json`.
- **Rename.** `npx opendoc documents rename welcome "Workspace guide" --json` prints `{ "id": "welcome", "name": "Workspace guide" }`; `projects list --json` shows `names.welcome`.
- **Duplicate.** `npx opendoc documents duplicate welcome --id welcome-copy --title "Verify copy" --json` prints the copy's `id`, `projectId`, and `entry`. `tags show document welcome-copy --json` has type `report` and `status: null`; `history list welcome-copy --json` has one version.
- **Delete.** `npx opendoc documents delete welcome-copy --json` prints `restoreId` and `restore`. `documents/welcome-copy/` is gone; `documents trash --json` lists it.
- **Restore.** `npx opendoc documents restore welcome-copy --json` returns the same `id`, `projectId`, and `name`; `documents trash --json` is empty again.
- **Proof.** Save each JSON result and the before/after `projects list --json`.

## Gotchas

- Never move folders in or out of `.opendoc/trash/` by hand; the receipt holds the project, name, tags, and status.
- Restore refuses when the ID is in use again or the original project no longer exists; nothing is overwritten.
- Duplicate does not include unsaved browser text drafts; save them first.
- With two deleted copies of one ID, restoring by document ID is refused and lists both restore IDs.
