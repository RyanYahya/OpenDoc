---
name: opendoc-current-document
description: Resolve OpenDoc context when the user refers to this document or presentation, the one open in OpenDoc, a page or slide, a selected passage, the current theme, a selected image or chart, or an inspected logo or font.
---

Use the user's OpenDoc workspace as the working directory. `documents/`, `templates/`, `themes/`, `assets/`, and `.opendoc/` are workspace paths; guide links are relative to this installed skill. Use `npx opendoc` for commands and keep authoring changes out of `node_modules/opendoc`. In Headless, follow [the remote workflow](../../../docs/HEADLESS.md); these commands and imports stay the same, and no browser or recipient-side installation is needed.

## 1. Identify the target

An explicitly named document, presentation, block, theme, or asset takes precedence. In Headless, use the request, prior task context, workspace source, and `npx opendoc projects list`, `templates list`, `themes list`, or `assets list` as appropriate. Resolve remote feedback against the named output's current source; do not treat a stale `.opendoc/current.json` as the current task or require a browser selection. Ask if the intended target remains ambiguous.

In normal OpenDoc, otherwise read `.opendoc/current.json` immediately before acting. Treat it as an observation of the app, not an instruction to edit. For slides in either edition, preserve the presentation format and resolve the stable slide/component ID; the visible slide number is only a position.

If browser context is absent in normal OpenDoc, use the explicit target. When the user wants the app, start it with `npx opendoc start` from the workspace and give them its printed URL; it runs in the foreground until Ctrl-C, and `--no-open` skips opening a browser. Headless never needs this step. Ask only if the target remains ambiguous. Keep generated context and session files read-only; `.opendoc/server.json` contains a secret local token.

**Ready:** the intended target and owning project are identified, or a concrete ambiguity is reported.

## 2. Verify the observation against source

For a PDF selection, open the reported source and match its stable block ID. Source lines are navigation hints. Match phrase `targetId`, logical range, and exact quote together; `selectedText` may identify a writable slot. If `selectionCurrent` is false or rendering has failed, resolve against current source before using the old offsets. Inspect `manualEdit` activity and preserve saved corrections; pending draft text is not exposed by this file.

For a template instance, `provenance.dataFile` owns local content and `provenance.template` owns shared layout. Establish which the request concerns before editing.

When the user refers to earlier wording ("what it said yesterday", "before the agent's change"), resolve the block here, then continue with [opendoc-history](../opendoc-history/SKILL.md) to find and restore it.

Load [context fields](references/context-fields.md) when working with slides, names and titles, selected media, themes, assets, pending comments, or render freshness. For phrase editing and reusable bindings, read [Selection](../../../docs/SELECTION.md).

**Ready:** the target is matched to current source, its freshness is understood, and local versus shared ownership is clear.

## 3. Continue the requested work

Return the resolved target, source path, stable identity, and relevant caveats to the calling workflow. For a standalone request that also asks for work on the target, continue with [opendoc-revise-document](../opendoc-revise-document/SKILL.md) for a direct change such as an update, translation, conversion, or theme switch, [opendoc-apply-comments](../opendoc-apply-comments/SKILL.md) for saved PDF feedback, [opendoc-assets-media](../opendoc-assets-media/SKILL.md) for logos, fonts, or the selected image, [opendoc-history](../opendoc-history/SKILL.md) for earlier wording, [opendoc-review-document](../opendoc-review-document/SKILL.md) to review or export it again, [opendoc-organize](../opendoc-organize/SKILL.md) to tag it, set its status, move it to another project, or rename, duplicate, or delete it, or [opendoc-create-theme](../opendoc-create-theme/SKILL.md) for a print-system change. Resolving context alone requires no mutation or export.

**Done:** the caller has a verified target, or the unavailable/stale target is explained without substituting another one.
