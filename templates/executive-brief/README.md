# Executive brief

A flexible, compact layout for updates, briefings, and decision notes. Defaults are A4 portrait, 52-point side and 48-point top/bottom margins, a 491-point reading column, 11/15.4-point body type, and 8-point paragraph gaps. A 26-point title opens the same page as the body. The optional 14-point takeaway gives the opening emphasis. Page numbers sit at the bottom right.

`ExecutiveBrief` accepts `title`, `theme`, and ordinary OpenDoc blocks as `children`. Optional `label`, `author`, and `date` add small opening details; `date` is supplied display text. `takeaway` accepts inline text and formatting, with no mandatory label or content formula. `titleStyle` accepts native styles for a longer title or an adapted opening. Fonts and colors come from the theme. Optional verified `references` work with the existing Cite blocks and appear after the body.

`BriefHeading` accepts a stable `id`, `children`, and optional native `style`; its starting size is 12.5 points. Use a native `<F.View wrap={false}>` around a heading and a short lead when they need to stay together. Keep the rest in normal flow. Tables and figures use existing OpenDoc blocks with captions and accurate source notes.

One or two pages is an editorial aim, not an enforced limit. Titles, takeaways, and body prose remain breakable, and longer material can continue across pages. There is no custom layout engine, automatic fitting, or required section outline. Adapt the defaults to the content and review the result. See [AGENTS.md](AGENTS.md) for the intended freedom and functional boundaries.

`preview.tsx` supplies sparse, typical, and long specimens, with optional theme selection for review. The catalog uses Neutral; all sample values are explicitly synthetic. `starter.tsx` creates an ordinary linked document, with no extra data format or runtime.
