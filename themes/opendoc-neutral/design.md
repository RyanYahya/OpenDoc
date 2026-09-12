# OpenDoc Neutral

The OpenDoc house style makes room for writing, evidence, and imagery. Warm paper and charcoal establish its character; scale, a flexible grid, fine rules, and one blue signal give it visual taste. It is a reusable everyday system, with expressive openings and dark surfaces available when the content benefits.

## Palette

| Role | Hex | Use |
| --- | --- | --- |
| Paper | #FCFBF8 | Ordinary reading pages |
| White | #FFFFFF | Charts and analytical tables |
| Ink / Night | #171A1D | Primary text; dark page surface |
| Muted | #62686D | Secondary copy |
| Blue | #3758F9 | Labels, citations, a chart focus, or one composition |
| Wash | #ECEEF9 | Occasional callout |
| Stone | #EAE7DF | Code panels and neutral diagrams |
| Rule | #D7D7D2 | Light-surface dividers |
| Inverse | #F7F6F2 | Primary text on charcoal |
| Inverse muted | #B6BABE | Secondary text on charcoal |
| Inverse rule | #41464B | Dark-surface dividers |

Use genuine white and charcoal page backgrounds, independent of the app's appearance. Keep charts on white. Use blue for a clear point of emphasis; ordinary pages should not become collections of colored boxes.

## Type and rhythm

The bundled OpenDoc Sans carries headings and body text. OpenDoc Serif italic supplies a deliberate editorial quotation or reflective passage; OpenDoc Mono identifies labels, page furniture, and code. All are embedded local faces. Saved body/heading bindings can replace semantic families; the intentional serif and monospace voices remain distinct.

| Role | Size / weight | Line height | Tracking |
| --- | --- | --- | --- |
| Display opening | 62 pt / 600 | 1.03 | -2.1 pt |
| Page opening | 34 pt / 600 | 1.08 | -1.1 pt |
| Section heading | 20 pt / 600 | 1.18 | -0.35 pt |
| Small heading | 12 pt / 600 | 1.25 | Normal |
| Body | 10.5 pt / 400 | 1.48 | Normal |
| Lead | 13 pt / 400 | 1.45 | Normal |
| Editorial quote | 28 pt / 400 italic | 1.2 | Normal |
| Label | 7.5 pt / 400 mono | Inherited | 0.7 pt |
| Caption / small | 8.5 / 8 pt | 1.4 | Normal |
| Table body / header | 9 / 8 pt | 1.35 / inherited | Normal |
| Code | 8 pt / 400 mono | 1.5 | Normal |
| Running furniture | 7 pt / 400 mono | Inherited | Normal |

Body paragraphs have 10 pt after-space. Ordinary h2 headings have 20 pt before and 10 pt after; h3 headings have 14 pt before and 8 pt after. Large openings use an 18 pt label gap, a 16 pt title-to-subtitle gap, and 24 pt below the composition. Use 6 pt as the spacing unit for custom arrangements; these optical type spacings are intentional exceptions.

## Grid and surfaces

A4 portrait has 48 pt top and side margins, 56 pt bottom, and a 499.28 pt content width. A 24 pt gutter gives two 237.64 pt columns, or a 158.43 / 316.85 pt asymmetric split. Use a 0.6 pt rule and square corners. Running labels sit above the reading field; a fine rule and actual folio close each page.

Use `NeutralPages` for flowing reading, white evidence, or charcoal pages. Its header/footer repeat on continuation pages. Ordinary prose must be allowed to flow. Use `NeutralColumns` for independent bounded material, not sequential story text. An opening may have a large deliberate gap; a long report should not be manually paginated paragraph by paragraph.

## Reusable compositions

See [components.tsx](components.tsx) for the executable implementations.

- `NeutralPages`: title, optional label, surface (`paper`, `white`, `dark`), optional header, and children. On dark surfaces, explicitly give standard headings, paragraphs, and captions the corresponding inverse color; their semantic theme colors otherwise remain dark ink.
- `NeutralOpening`: stable id, eyebrow, title, optional subtitle, surface, and optional display scale. Keeps the same title/subtitle identities when its text changes.
- `NeutralColumns`: left and right content, equal or narrow-left ratio, optional native style. Give each column its own reading path.
- `NeutralQuote`: stable id, authored quote, attribution, and surface. Uses a 2 pt leading rule and a real serif italic face. Attribute original house copy honestly.
- `PaperStudy`: stable id and surface. Three native page-like planes (114, 150, and 186 pt high, with 16 pt gaps) express the move from working material to a finished page. Use only as an opening or closing visual, not as repeated filler.

## Evidence, imagery, and identity

Tables have charcoal column headers, white labels, 8 pt cell padding, restrained alternating rows (#F1F1EE), and 0.5 pt bottom rules. Keep numeric columns right aligned. Captions and source notes stay close to figures. Use managed chart images, retain prepared data and recipes, and repeat the key values in selectable text or a native table. Clearly label synthetic demonstrations.

Images keep their aspect ratio. Favor a substantial image and an explanatory caption over a collage of tiny decorations. A dark gallery page can let a photograph carry the composition. Generated artwork must be labeled as such and retain its prompt/provenance; it is not documentary evidence.

The shared OpenDoc logo is the existing wordmark, imported from `assets/brand/wordmark.png`. Its dark variation belongs on light surfaces. Preserve the original proportions and transparency. Place it explicitly through a saved `Logo` binding; no mark is inserted automatically. The theme's specimen stays self-contained and does not rely on a document's private media.

## Basis

Original house system created for the user's OpenDoc Neutral brief: tasteful neutral styling, a welcome document that demonstrates varied layouts, detailed data graphics, generated imagery, identity, and light/dark pages. The existing OpenDoc wordmark and bundled local font families are retained. The composition and palette are original design interpretations, not an adaptation of an external brand. The independent specimen and the welcome document are the review surfaces.
