# Civic Spectrum

Warm civic modernism: lucid public information, compact grotesk type, square signals, and generous asymmetric space. Its signature is the **unequal six-color rail**, not a collection of interchangeable accent colors. Use it for community and cultural reports, public-information pages, and editorial explainers.

## Palette and meaning

| Role | Hex | Use |
| --- | --- | --- |
| Signal blue | `#2F7EA5` | Orientation, primary emphasis, arrival |
| Sky | `#7ABED0` | Supporting information and shared activity |
| Leaf | `#5F9D7A` | Participation, progress, positive movement |
| Sun | `#E3C84F` | Attention and selected evidence; use dark text |
| Flame | `#E27D47` | Action, urgent emphasis, a next step |
| Violet | `#7D6FA6` | Context and reflection |
| Stock | `#FFFFFF` | White page background |
| Ink | `#17232B` | Primary text and optional inverse surface |
| Muted | `#68747A` | Secondary text and annotations |
| Rule | `#C9CEC7` | Quiet boundaries and alignment marks |
| Inverse text | `#F8F5EC` | Text on the ink surface |
| Inverse notes | `#B9C2C3` | Secondary text on dark |
| Inverse rule | `#516068` | Boundaries on dark |

Use one dominant signal in a passage. The entire spectrum belongs on an identity rail or in an explicit palette legend. On an applied page, two or three colors are acceptable only when they identify distinct categories. Preserve those assignments throughout a document. Sun is a good note surface; it is not a universal highlight pen. Use Ink text on the light signal fields. White text is reserved for sufficiently dark fields such as Signal blue or Ink.

## Page geometry and shapes

The print grid is A4 portrait, **48 pt top/side margins and 56 pt bottom margin**. The approximately 499 pt field has six columns separated by **12 pt gutters**. `CivicSplit` assigns **328 pt** to the main reading field and the remaining approximately 159 pt to supporting material, with a 12 pt gap. This creates a four-column reading field and a two-column supporting field.

Work from a **4 pt baseline** and prefer 8, 12, 16, 24, and 32 pt spacing. The unequal rail is **12 pt high** with the invariant proportion **2 : 1 : 3 : 1.5 : 2 : 1**, in blue, sky, leaf, sun, flame, violet order. Its lengths are an identity device, never quantitative data. An 8 pt rail is available for a secondary signature.

Wayfinding markers are **8 × 8 pt squares**. Badges are **132 × 132 pt squares**, outlined with a 0.75 pt rule or filled with a meaningful color. Category modules start with a **4 pt top rule** and 12 pt inset. Corners are square. Do not introduce shadows, gradients, rounded cards, glass surfaces, or ornamental circles. Large empty areas are deliberate: keep one side of a reading spread quieter rather than filling every cell.

## Typography

The local print family is **OpenDoc Sans**, the bundled Source Sans 3 derivative. It substitutes for the slide theme's Archivo. Use the real 600 face for emphasis and display; body is 400. The substitution preserves a clear grotesk voice but does not claim identical Archivo letterforms. OpenDoc Mono is used only for exact hexadecimal labels in the specimen.

| Role | Size / line height | Notes |
| --- | --- | --- |
| Cover display | 52 pt / 1.02 | Tight, confident; identity specimen uses 54 pt / 0.98 |
| Main title | 42 pt / 1.04 | Tracking −0.8 pt; flush left |
| Section | 23 pt / 1.10 | Tracking −0.35 pt; 24 pt before, 12 after |
| Subheading | 14 pt / 1.20 | 20 pt before, 8 after |
| Lead | 16 pt / 1.40 | Muted, short measure |
| Body | 11 pt / 1.50 | 12 pt paragraph gap |
| Caption | 9 pt / 1.40 | Keep close to its figure |
| Label | 8 pt | Uppercase only for short wayfinding labels |

Sentence case is the default. Do not make body passages uppercase. Long text flows; do not shrink the type to preserve a fixed page count.

## Reusable components

Import `theme` from `themes/civic-spectrum` and the components from its `components.tsx`. Use them inside an OpenDoc `Document` receiving that theme.

- `CivicPages({title, section?, footer?, rail?, children})` supplies white stock, real repeating furniture, and optional opening rail. Its content flows naturally across pages.
- `CivicOpening({id, kicker, title, subtitle?, color?})` couples the square signal to the title and lead.
- `CivicSplit({id, main, aside})` establishes the four/two-column relationship. Use independent supporting material in the aside; do not rely on it for sequential prose continuation.
- `SquareSignal({id, label, color?})`, `CivicBadge({id, value, label, color?, filled?})`, and `SignalBlock({id, code, title, color?, children})` are reusable wayfinding elements.
- `SpectrumRail({height?})` carries the identity. `SpectrumLegend({id})` displays exact palette values when explaining the system.

Pass unique, stable IDs. Native `Heading`, `Paragraph`, `DataTable`, `Figure`, and `Callout` also consume this theme's rules; do not recreate their styling in each document.

## Evidence, imagery, and application

Use direct labels, explicit units, and rectangular partitions when the data supports them. The specimen's 120 m² room is synthetic; its areas and percentages are selectable in the accompanying table. Native tables use an Ink header, inverse labels, 10 pt cell padding, and 0.5 pt horizontal rules. Captions describe the exhibit, and source notes identify its basis. Real evidence keeps its meaning even when it uses additional colors.

Images may fill the reading field or a deliberate wider band; preserve aspect ratio and use a nearby caption. A photograph can carry a public story, but it must not be filler. Logos retain supplied proportions and clear space. Do not invent a transit map, civic crest, or institutional endorsement.

## Implementation and review

The system combines a six-color rail, square signals, asymmetric composition, and the Orient / Explain / Move structure. It uses bundled OpenDoc fonts and native page primitives. `index.ts` and reusable components are executable; keep these concrete specifications synchronized when changing them. Review every specimen page, narrow-column wraps, exact palette text, and table/figure labels in the exported PDF.
