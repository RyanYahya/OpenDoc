---
name: opendoc-current-document
description: Resolve OpenDoc context when the user refers to this document or presentation, a page or slide, a selected passage, the current theme, or an inspected asset.
---

Use the user's OpenDoc workspace as the working directory. `documents/`, `templates/`, `themes/`, `assets/`, and `.opendoc/` are workspace paths; guide links are relative to this installed skill. Use `npx opendoc` for commands and keep authoring changes out of `node_modules/opendoc`. In Headless, follow [the remote workflow](../../../docs/HEADLESS.md); these commands and imports stay the same, and no browser or recipient-side installation is needed.

## 1. Identify the target

An explicitly named document, presentation, block, theme, or asset takes precedence. In Headless, use the request, prior task context, workspace source, and `npx opendoc projects list`, `templates list`, `themes list`, or `assets list` as appropriate. Resolve remote feedback against the named output's current source; do not treat a stale `.opendoc/current.json` as the current task or require a browser selection. Ask if the intended target remains ambiguous.

In normal OpenDoc, otherwise read `.opendoc/current.json` immediately before acting. Treat it as an observation of the app, not an instruction to edit. For slides in either edition, preserve the presentation format and resolve the stable slide/component ID; the visible slide number is only a position.

If browser context is absent in normal OpenDoc, use the explicit target or start the app through the [README](../../../README.md) when needed. Headless never needs this step. Ask only if the target remains ambiguous. Keep generated context and session files read-only; `.opendoc/server.json` contains a secret local token.

**Ready:** the intended target and owning project are identified, or a concrete ambiguity is reported.

## 2. Verify the observation against source

For a PDF selection, open the reported source and match its stable block ID. Source lines are navigation hints. Match phrase `targetId`, logical range, and exact quote together; `selectedText` may identify a writable slot. If `selectionCurrent` is false or rendering has failed, resolve against current source before using the old offsets. Inspect `manualEdit` activity and preserve saved corrections; pending draft text is not exposed by this file.

For a template instance, `provenance.dataFile` owns local content and `provenance.template` owns shared layout. Establish which the request concerns before editing.

Load [context fields](references/context-fields.md) when working with themes, assets, pending comments, or render freshness. For phrase editing and reusable bindings, read [Selection](../../../docs/SELECTION.md).

**Ready:** the target is matched to current source, its freshness is understood, and local versus shared ownership is clear.

## 3. Continue the requested work

Return the resolved target, source path, stable identity, and relevant caveats to the calling workflow. For a standalone request that also asks for a revision, continue with [opendoc-apply-comments](../opendoc-apply-comments/SKILL.md) for saved PDF feedback or [opendoc-create-theme](../opendoc-create-theme/SKILL.md) for a print-system change. Resolving context alone requires no mutation or export.

**Done:** the caller has a verified target, or the unavailable/stale target is explained without substituting another one.
