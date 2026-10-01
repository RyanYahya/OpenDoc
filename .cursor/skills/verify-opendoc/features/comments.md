# Comments

A user leaves feedback on a specific block, lists it, applies the intended revision outside this skill, and resolves the comment. Verification uses a disposable duplicate so the shipped Welcome document stays clean.

## Sub-features

- `comment-copy` duplicates a ready document into a new id.
- `comment-add` attaches an open comment to a real block.
- `comment-list` returns that comment with stable `id` and `blockId`.
- `comment-phrase` anchors a command-line comment to exact words with `--phrase` (and `--target` for one field).
- `comment-anchors` reports `anchorStatus` and `targetAvailable` with `list --anchors`; `list --deleted` shows Recently deleted.
- `comment-resolve` marks the comment resolved and keeps history.
- `comment-cleanup` deletes the disposable document.

## How to get to it (user POV)

- In the reader, select a passage and write a comment (`aria-label="Comment"`).
- From a checkout with the server running: `pnpm comments -- add <doc> <block-id> "text" --json`, then `list` and `resolve`.
- In Headless: `npx opendoc comments add|list|resolve` (direct render, no server).
- Applying the written change is the authoring/apply-comments path. This feature proves the comment records, not the prose edit.

## Driving it with HTTP and checkout CLIs

Preconditions:

- Normal server started by this run; `welcome` is `ready`.
- No leftover disposable document from a previous failed run (delete it first).
- Never add comments to `welcome` or `welcome-presentation`.

- **Duplicate.** `POST <origin>/api/documents/welcome/duplicate` with headers `Content-Type: application/json`, `Origin: <origin>`, `X-OpenDoc-Token: <token>`. Status `201`. Remember `id` (example: `welcome-copy`). `pnpm documents -- duplicate welcome --json` is the CLI equivalent.
- **Wait.** `GET <origin>/api/documents/<copy-id>` until `status` is `ready`. Confirm block `welcome-introduction` exists on the artifact.
- **Add.** `pnpm comments -- add <copy-id> welcome-introduction "Verification: clarify the opening sentence." --json`. Exit 0. The printed list includes an open comment on `welcome-introduction`.
- **List.** `pnpm comments -- list <copy-id>` returns JSON containing that `id`, `blockId`, and `status: "open"`.
- **Phrase.** `pnpm comments -- add <copy-id> welcome-introduction "Verification: phrase." --phrase "<words from that block>" --json` records an `anchor` with that `quote`; `pnpm comments -- list <copy-id> --anchors` reports `anchorStatus: "attached"` for it.
- **Resolve.** `pnpm comments -- resolve <copy-id> <comment-id> --json`. The comment `status` is `resolved`.
- **Second view.** `pnpm comments -- list <copy-id>` still contains the resolved comment (history is kept).
- **Delete the copy.** `DELETE <origin>/api/documents/<copy-id>` with the same write headers, or `pnpm documents -- delete <copy-id> --json`. Status `200` (or exit 0). `GET /api/documents?view=summary` no longer includes `<copy-id>`.
- **Proof.** Save the duplicate id, add/list/resolve JSON, and the post-delete library list. Confirm `documents/welcome/comments.json` was not created or changed.

## Gotchas

- In Normal, `comments add` verifies the block through the live server when one runs; with no server, or a stale `.opendoc/server.json`, it renders saved source directly. Headless always renders directly. Say which mode a proof used.
- `comments delete` and `comments restore` act on one comment, not the document. Remove the disposable document over HTTP or with `documents delete`, not by deleting folders.
- If duplicate/delete fails, stop and clean the copy up before another run. Do not resolve the leftover by commenting on Welcome.
- Applying the comment's wording is out of scope here; use the apply-comments authoring skill after this record exists.
