# Magazine feature

A native Forme layout for illustrated features, profiles, and interviews. A4 pages have 48-point top and side margins and a 58-point bottom margin. The opening uses the full 499-point content width; body text is inset 96 points from the left, leaving a 403-point reading column. The headline is 52 points. Body text is 11/16.5 points with 10-point paragraph gaps and no indents. Fonts and colors come from the caller's theme.

`MagazineFeature` takes `title`, `theme`, and ordinary OpenDoc blocks as `children`. Optional `kicker`, `standfirst`, `author`, and `hero` supply opening material. Omit them when they are not needed; there are no empty reserved panels or mandatory content sections. Pass verified `references` and use `Cite` in the body for the usual reference list.

For `hero`, supply an existing `Figure` containing local `Media` or a native Forme image. Its available width is approximately 499 points; body visuals have approximately 403 points. Preserve the image's aspect ratio and leave enough height for its caption. `Figure` keeps the image and caption together, so the complete group must fit on a page. See [the media guidance](../../docs/MEDIA.md).

Use `<FeatureQuote id="a-stable-quote-id">…</FeatureQuote>` for an optional display quote. It inherits the body font and color, uses 24/30-point text, and remains breakable in normal reading order. The writer supplies the quotation and attribution; this component does not invent either. Use ordinary paragraphs for nearby attribution when needed.

The implementation uses existing OpenDoc blocks backed by Forme's native `Page`, `Fixed`, `View`, and text primitives. There is no custom typesetting, indentation shim, page splitting, or simulated multi-column flow. Long titles, decks, body text, and quotes remain breakable. Keep headings with a short opening using OpenDoc `Section` where appropriate, rather than wrapping large passages in an unbreakable group.

`preview.tsx` contains clearly marked layout placeholders. `Specimen` accepts `length="sparse"`, `"typical"`, or `"long"`, plus an optional theme for review. The default catalog proof stays Neutral. `starter.tsx` creates an ordinary document linked to this folder. Keep authored IDs stable across revisions; preview sequence IDs belong only to its fixed specimen.
