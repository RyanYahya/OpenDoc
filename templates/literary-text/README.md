# Literary text

A flexible prose layout for stories, chapters, and longer creative writing. Native Forme handles wrapping and pagination. Defaults are A4 portrait with 112-point side and 64-point top/bottom margins, a 371-point reading column, 11.5/17.825-point body type, and 7-point paragraph gaps. The centered 26-point title has additional opening space above it. Page numbers sit centrally below the text.

`LiteraryText` accepts `title`, `theme`, and ordinary OpenDoc blocks as `children`. Optional `author` and inline `epigraph` supply opening material. `titleStyle` accepts native styles for smaller titles, alternate alignment, or different opening spacing. Fonts and colors come from the theme. Paragraphs begin flush; there is no indentation shim or custom typesetting. The layout is a starting point, not a prescribed literary style.

Use `<SceneBreak id="return-to-the-house" lead="The first short paragraph of the new scene." />` for a quiet three-asterisk marker. It keeps the marker with its short lead using a native unbreakable View. The lead is limited to 700 characters to keep this small group page-sized; place the rest in normal Paragraph blocks. Its comment targets are `<id>-marker` and `<id>-lead`. Keep these IDs stable when moving scenes. Omit scene markers when the writing does not need them.

Long titles and epigraphs remain breakable. If an opening becomes disproportionate, adapt it with ordinary styles after reviewing the PDF. Supply verified `references` and use existing Cite blocks if the work needs references; otherwise the reference section is omitted. No chapter order or content outline is imposed.

`preview.tsx` uses explicitly identified placeholder prose, not a fictional quotation attributed to a real author. Its Specimen accepts sparse, typical, and long lengths plus an optional theme for review. The default catalog proof stays Neutral. `starter.tsx` creates a normal linked document. See [AGENTS.md](AGENTS.md) for the intended flexibility and native-layout boundaries.
