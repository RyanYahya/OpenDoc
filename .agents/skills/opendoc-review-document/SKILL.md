---
name: opendoc-review-document
description: Review OpenDoc documents and presentations before delivery or when the user requests an audit, including PDF pages, editable PowerPoint exports, and theme or template specimens.
---

Use the user's OpenDoc workspace as the working directory. `documents/`, `templates/`, `themes/`, `assets/`, and `.opendoc/` are workspace paths; guide links are relative to this installed skill. Use `npx opendoc` for commands and keep authoring changes out of `node_modules/opendoc`. In Headless, follow [the remote workflow](../../../docs/HEADLESS.md); these commands and imports stay the same, and no browser or recipient-side installation is needed.

## 1. Establish the artifact

Resolve the requested document or specimen and verify it represents the current successful source revision. For active selections in normal OpenDoc, use [opendoc-current-document](../opendoc-current-document/SKILL.md). Headless resolves an explicit ID from task context and workspace source.

In Headless, use the matching review command; it also works in normal OpenDoc. It renders saved workspace source directly, so save pending browser text corrections first when those are intended for delivery. Reuse a just-produced review when its source is unchanged:

```sh
npx opendoc review <document-id> --json
npx opendoc review <document-id> --export --json
npx opendoc review --theme <theme-id> --json
npx opendoc review --template <template-id> --json
```

Use the successful result's returned PDF, page images, extracted text, issues, and manifest paths. The manifest identifies the exact PDF hash, page count/dimensions, stable blocks, and source locations. Exit code 0 and `status: "ready"` establish artifact preparation and technical render/layout checks only; `visualReview` and `factualReview` remain `"required"`. The agent must perform the review below. Failed commands preserve previous files, which must not be presented as the failed revision's output.

For documents and presentations, `--export` combines workspace typechecking, one render, page images/text, and PDF/PPTX preparation. Use its `outputs.pdf` and `outputs.pptx` after review; no separate export is needed when these files represent the final unchanged revision. PPTX-only warnings explain blocked styling and keep native appearance marked as requiring review. Use ordinary review to inspect PDF while correcting a PPTX failure. Specimens do not accept `--export`.

Use `pages[].elements` to inspect actual element bounds, parent coordinates, clipping ancestors, line counts, and block/source identity. Use `changes.changedPages` and `changes.removedPages` to focus a repeat review, including adjacent page breaks. First reviews mark every page changed. Page hashes compare review PNG/text at the same page position; they do not prove native PowerPoint fidelity or record a completed visual review.

- **Document:** export with `npx opendoc export <document-id>`.
- **Presentation:** export the PDF through the same command. When PowerPoint is included, also run `npx opendoc export <document-id> --format pptx`. Default delivery includes both; honor an explicit single-format request. Confirm one 960 × 540 PDF page per authored slide, in the intended order. Review every slide at a readable scale, including source/reference slides; text, images, and captions must fit without clipping or unintended continuation. Check comments and corrections against stable component identity after slide reordering.
- **Theme:** use `npx opendoc themes preview <theme-id>` and its `output/themes/<theme-id>.pdf`.
- **Template:** use `npx opendoc templates preview <template-id>` and `output/templates/<template-id>.pdf`, or the specimen review command above. A specimen is not an authored document and needs no library entry.
- **Supplied PDF:** inspect the caller's file directly with available PDF tools; it does not need importing into OpenDoc.

Read render warnings and relevant feedback. Reuse a just-produced export when its source is unchanged. Rendering/error states may leave an older PDF visible.

**Ready:** the exact current files, page/slide count, brief, and review scope are known.

## 2. Inspect every page

Inspect the review command's page images at legible scale, render pages with an available PDF tool, or use the normal OpenDoc reader. A contact sheet helps assess rhythm; review each page legibly as well. Check hierarchy, reading measure, spacing, page furniture, stranded headings, awkward endings, clipped figures, table continuation, and captions against the document's purpose. Generating page images is not inspection. If the agent cannot view images, state that visual review remains unverified; do not claim the manifest proves visual quality.

**Ready:** every page is accounted for and each material layout issue has a page and description.

## 3. Check content and extraction

Read the review command's extracted text or extract representative text with available PDF tools, including ligatures, symbols, mixed bold/italic boundaries, code, final table rows, and references where present. Verify link/bookmark destinations. Confirm the document addresses its brief and distinguishes evidence, inference, and illustrative material. When claim verification is in scope, compare citations with the underlying sources; a valid reference record alone does not establish support.

Load [Media](../../../docs/MEDIA.md) for managed images/charts: inspect labels, values, provenance, and the actual image. Load [Assets](../../../docs/ASSETS.md) for logos/fonts: compare saved choices with rendered use, inspect the chosen artwork on its page background, and verify copied text. Recorded hashes and isolated specimens are not substitutes for checking the delivered PDF.

**Ready:** relevant content, extraction, navigation, and asset checks have results or an explicit verification limit.

## 4. Check the PowerPoint handoff when included

Follow [PowerPoint delivery](../../../docs/AUTHORING.md#powerpoint-delivery). Confirm the PPTX opens as a valid presentation package, has the intended slide count/order, preserves text and images, and contains native text objects and embedded fonts. Compare slide text with the reviewed PDF or its captured layout; account for whitespace and ligature normalization. A ZIP containing font parts proves packaging, not correct rendering by PowerPoint.

When PowerPoint is available, open the export and inspect slides for font substitution, clipping, missing visuals, and unexpected line wrapping. Verify text remains editable without changing the delivered file; use a disposable copy if testing an edit/save. When native inspection is unavailable, finish available package/content checks and state that native appearance was not verified. This limitation alone does not prevent delivering a valid requested PPTX. Do not require the recipient to install OpenDoc, install fonts or software, rasterize the deck, or change the chosen design just to make a check pass.

If export rejects an unsupported effect or font, resolve it within the user's design direction. Ask when the remedy would change an explicit visual choice or reduce editability. Keep a successful PDF available and clearly identify an outstanding PPTX failure.

## 5. Close the review

For review-only requests, report findings without editing. When revision is in scope, fix material defects, re-export every requested format from the same final source, and inspect changed pages/slides and adjacent breaks. Repeat broader checks only when the change affects them. Shared themes/templates need representative short and long cases and affected-instance checks.

Return verified changes to the calling workflow, which owns feedback resolution. Preserve IDs and comment history during revisions.

**Done:** export the final unchanged revision and deliver the requested files (PDF for documents; PDF and PPTX for presentations by default) through accessible file links or the host agent's existing delivery channel, with the review result and concrete unresolved issues. The recipient needs no OpenDoc installation. A blocking defect means the affected format is not ready to share; identify it rather than claiming completion from a passing render alone.
