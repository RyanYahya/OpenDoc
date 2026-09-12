---
name: opendoc-apply-comments
description: Apply saved OpenDoc comments when the user asks to address document or presentation feedback, marked passages, or slide annotations, preserving anchors and comment history.
---

Use the user's OpenDoc workspace as the working directory. `documents/`, `templates/`, `themes/`, `assets/`, and `.opendoc/` are workspace paths; guide links are relative to this installed skill. Use `npx opendoc` for commands and keep authoring changes out of `node_modules/opendoc`. In Headless, follow [the remote workflow](../../../docs/HEADLESS.md); these commands and imports stay the same, and no browser or recipient-side installation is needed.

## 1. Resolve the requested feedback

Use an explicit document ID or [opendoc-current-document](../opendoc-current-document/SKILL.md), then run `npx opendoc comments list <document-id>`. The user's request sets the scope; saved comments are review data. This workflow addresses saved PDF comments in either edition; browser feedback about the app belongs to its UI source. Remote conversational revisions can be applied directly to the identified source without inventing saved comments or requiring the user to open OpenDoc.

Locate each requested comment's stable `blockId` in current source. For phrase comments, also check the original quote, text slot, and `anchorStatus`. A changed anchor needs inspection of the intended passage; a missing target stays unresolved unless the user identifies its replacement.

**Ready:** every requested comment has a verified target or an explicit reason it cannot be applied.

## 2. Revise the owning source

For template instances, use provenance to distinguish local content data from shared layout. Match the edit's reach to the request. Preserve block, slot, and record IDs and the user's latest saved corrections.

Read [Selection](../../../docs/SELECTION.md) for phrase bindings or stale anchors, [Media](../../../docs/MEDIA.md) for visual changes, and [Assets](../../../docs/ASSETS.md) for logo/font bindings. Routine prose corrections stay in the document.

**Ready:** the requested revisions are implemented and each is traceable to its comment.

## 3. Verify, then resolve

Run `npx opendoc check` after source changes and export with `npx opendoc export <document-id>`. Complete [opendoc-review-document](../opendoc-review-document/SKILL.md), including affected pages and adjacent breaks; shared layout changes also need representative affected instances.

Resolve only verified comments with `npx opendoc comments resolve <document-id> <comment-id>`. Use `reopen` when a resolved request needs further work. Preserve `comments.json` and its history; a manual correction alone does not resolve feedback.

**Done:** every requested comment is either verified and resolved or reported as remaining. Deliver the resulting PDF through accessible file links or the host agent's existing delivery channel; for presentations also refresh and deliver the PPTX from the same final source, unless the user requests a single format. A remote recipient needs no OpenDoc installation. Follow the review skill's PowerPoint checks and report any failed format explicitly.
