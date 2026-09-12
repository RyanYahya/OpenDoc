# Editorial essay

A layout component for continuous, single-column essays. It sets A4 geometry, 105-point side margins, an open title/byline/standfirst arrangement, close 11/15.62-point body typography, and discreet page numbers. Openings are flush left; later paragraphs have a 1½-em first-line indent, with 6-point gaps between body paragraphs. Prose flows through as many pages as it needs. Fonts and colors come from the caller's theme.

Use `EditorialEssay` with `title`, `theme`, optional `author` and `standfirst`, and ordinary OpenDoc blocks as `children`. Supply verified `references` to the component and use `Cite` within the text; cited references appear at the end. There is no mandatory content outline or JSON schema. Content may use the document's own data contract when useful.

The template uses the [Prose compatibility helper](../../docs/PROSE.md) to indent body paragraphs after author components have expanded. It resets at headings and figures, leaves captions and reference entries alone, and preserves comment targets. Forme still handles line wrapping and pagination; source text contains no manually inserted whitespace or line breaks.

`preview.tsx` supplies a Neutral layout specimen with clearly identified placeholders, including visual and reference positions. Its `Specimen` export also accepts `length="sparse"` or `length="long"` for flow checks. Specimen-generated IDs belong only to the fixed proof; authored content must keep stable semantic IDs.

`starter.tsx` becomes a new ordinary document when the user chooses this template. Creation replaces the title/theme sentinels safely and imports the generated `./theme` adapter; layout imports remain linked to this folder. Preserve the adapter and `assets.json` in each instance. Changing an existing essay's theme must not change this template's geometry. Read `AGENTS.md` before altering its layout.
