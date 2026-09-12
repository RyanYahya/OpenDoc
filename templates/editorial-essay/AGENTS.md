# Editorial essay

Use this template as a soft foundation for the essay, with room for variation and creativity. It suggests a narrow, continuous literary reading column, never an argument or writing method. Its measurements are starting values: reduce the title size for a long title, rebalance the opening space, or adjust the measure and paragraph rhythm to suit the text. Preserve a readable hierarchy and sustained flow rather than every specimen detail.

Close leading, first-line indents, and modest 6-point paragraph gaps are the current baseline. Flush openings after headings or visual breaks, a quiet byline, and a distinct standfirst support that character. Adapt or omit these treatments when another choice better serves the document; long prose must still flow naturally.

Headings can be sparse or more frequent according to the material. Occasional visuals may span the text width, with a caption beneath. References normally sit quietly at the end. The starting design is restrained, but it does not prohibit a purposeful departure or impose a mandatory outline.

The layout wraps body blocks in `Prose`, which expands author components before applying paragraph flow. Keep ordinary `Paragraph` blocks and their IDs; don't add leading spaces to content or manually split lines. `Prose` inserts a measured em-space run for the first line and leaves continuation lines flush across page breaks. Keep it scoped to body prose, never captions or references. Do not nest `Prose` regions. Read `docs/PROSE.md` before changing this compatibility helper.

The caller supplies the theme; the template's type sizes and spacing remain adaptable. Preview the catalog specimen with the shared Neutral theme. Keep document-specific variations local so other documents retain their existing layout. Preserve stable content IDs and review all pages after a layout change; shared changes need sparse and long specimens as well. Do not change unrelated templates or documents.
