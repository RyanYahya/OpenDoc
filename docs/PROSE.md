# Continuous prose

`Prose` is an optional OpenDoc region for continuous reading text. The Editorial essay template uses it for its body. Existing documents retain their paragraph behavior unless they explicitly use this region.

It leaves the first paragraph flush left and indents subsequent paragraphs by 1½ em. Paragraph gaps default to zero; set `paragraphGap` to a non-negative number of points for extra spacing. Editorial essay uses `<Prose paragraphGap={6}>`. Headings, section starts, figures, tables, callouts, lists, and explicit breaks restart the reading sequence. Section lead paragraphs stay flush; their following paragraphs indent. Captions, tables, and reference entries do not receive body formatting. Pure author components and fragments expand before formatting, so their paragraph IDs and source locations remain available for comments.

## Forme compatibility

Forme 0.20.1 has no native first-line-indent style. OpenDoc uses an isolated inline U+2003 em-space run, sized to the requested indent. Its measured advance is fixed; an ordinary leading whitespace string is stretchable glue in this engine and does not reliably preserve its width. This is a compatibility shim, not a native Forme feature. No word joiner, tabs, manual line splitting, dependency patch, or full-paragraph padding is involved.

The body uses greedy line breaking by default to keep measured text within the column in this renderer. An explicit paragraph `lineBreaking` choice takes precedence. The spacer appears only at the paragraph's beginning; Forme handles all subsequent lines and page fragments. It leaves the body line height unchanged. Searchable and copied text retain the authored words; layout-oriented extraction may include normal indentation spaces.

This helper deliberately supports one measured 1½-em indent. Do not generalize it to arbitrary spacing without new PDF coordinate checks: Forme can merge a spacer run that has the same font size as the body and treat it as stretchable whitespace. Do not nest `Prose` regions; sibling regions start separate paragraph sequences. Keep regions within a single document's body. Use a separate region or a structural break to begin a new passage, not blank paragraphs.

Regression checks read actual PDF coordinates with the bundled Sans and Serif fonts, check continuation lines across pages, verify heading/figure/section resets, and preserve mixed inline formatting, citations, source locations, and existing non-Prose paragraphs. Recheck the spacer advance and extraction before using a new font or upgrading Forme. Replace this shim with native first-line indentation when the engine supports it and those checks pass.
