# Brand guidelines

An identity handbook with the rhythm of a design presentation: oversized type, generous image fields, opposing mark variants, annotated specimens, contact sheets, and application galleries. Neutral is the catalog appearance, not a proposed brand. Every bracketed text or artwork area is a replaceable placeholder. Never turn these prompts into invented company facts, approved rules, or licensing claims.

## Structure and useful variations

The eighteen-slide starter moves from purpose, voice, and visual world to marks, measured usage, color, accessibility, typography, imagery, graphic language, applications, and ownership. This is an adaptable collection, not a required outline. A small identity may omit motion, physical applications, or alternate marks. A complex one may add subbrands, partnerships, multilingual specimens, packaging, data visualization, or motion sequences as separate slides.

Show real examples beside rules. A clear-space page needs an approved annotated diagram and actual measurements, not a decorative grid mistaken for a specification. The sample swatch widths are a composition, not palette ratios. Display the verified color values for every medium the brand uses. Record actual tested text/background combinations, their sizes and target standard; a dark/light specimen is not an accessibility certification. Use written labels or other cues alongside color.

The image-rich spreads should do different jobs: the expression board communicates a world; photography defines the point of view; crop variants preserve the subject across formats; application galleries show the system operating. Replace image briefs with meaning-bearing artwork and retain concise captions explaining the choices. The graphics slide supports icons, illustration, pattern, or a static motion storyboard only when relevant.

Typography and geometry are starting values. A long title receives an explicit smaller opening size; shorten further or adapt its field when needed. Rebalance an image or omit an optional caption when the material benefits. Each slide remains one 960 × 540 page; preserve stable slide and component IDs when reordering. `BrandText` binds its caller's `children` through `TextSlot`, so edits belong to the instance. All visible starter copy is local; the shared layout has no brand argument or rule set.

## Artwork and appearance

`BrandImage` accepts `image={{item:'document-media-id',fit:'cover',position:{x:0.5,y:0.5}}}` for managed `MediaFrame` artwork. Use `fit:'contain'` for a diagram or mark that must remain complete. A missing image is intentional; a supplied missing media item must fail. Import and review document-owned images according to [Media](../../docs/MEDIA.md), keeping provenance and original source records.

Reusable logos belong in the shared [asset library](../../docs/ASSETS.md). After binding the intended family/version, use `logo={{variation:'approved-variation'}}` or `logo={{name:'partner',variation:'approved-variation'}}`. Bind the correct light/dark variation for the actual PDF surface. The template does not recolor, distort, or fabricate a logo. Choose either `image` or `logo` for a slot. Saved fonts come from the instance's generated theme adapter; retain that import and `assets.json`.

The starter passes its caller's theme into every slide and specimen. Its presentation sizes are deliberately local, while font family, semantic title styling, paper, line, and ink follow the theme. Catalog imagery remains empty because a generic brand manual should not imply ownership of stock pictures or resemble an existing brand.

## Research and rationale

Reviewed official sources on 11 September 2026. These sources inform the categories and the usefulness of the skeleton; their own brand-specific aesthetic rules are not imposed on another brand.

- [Adobe Express: How to create brand guidelines](https://www.adobe.com/uk/express/discover/examples/brand-guidelines) covers brand foundations, approved logo variations, color specifications, typography, image/icon guidance, and voice. This informed the foundation-to-application coverage and the paired voice example. Its mood-board and contextual-example guidance informed the expression board.
- [IBM Design Language: Color](https://www.ibm.com/design/language/color/) treats colors as roles and discusses contrast, background variations, and avoiding reliance on color alone. This informed the role-based palette specimen and a separate evidence-oriented pairing page, without claiming the placeholders meet a specific standard.
- [IBM Design Language: Photography tips and techniques](https://www.ibm.com/design/language/photography/tips-and-techniques/) explains perspective, framing, focal points, aspect ratio, lighting, and purposeful imagery. This informed separate art-direction and crop compositions. IBM's specific lens, lighting, and filter preferences remain IBM's rules; authors supply the rules for their own identity.
- [IBM Design Language: Resources](https://www.ibm.com/design/language/resources/) connects identity components to source tools, font repositories, logo permissions, photography, and motion resources. This informed a practical handoff slide with asset access, ownership, permissions, versions, and a review path.

Review every native PDF slide, including labels and the final ownership slide, after replacing copy or images. Check actual crop visibility, text extraction, image contrast, and the intended variant on its background. Keep catalog specimens and acceptance fixtures outside the user document library.
