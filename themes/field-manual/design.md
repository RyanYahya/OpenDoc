# Field Manual

**Evidence before ornament.** Field Manual is a technical publishing system with warm stock, dense ink, a safety-orange spine, coded annotations, and visible revision information. Use it for manuals, evidence dossiers, decision records, and operational handovers. Every line identifies, divides, connects, or measures something. It is not a nostalgic imitation of an agency document.

## Palette and function

| Role | Hex | Use |
| --- | --- | --- |
| Safety orange | `#F05A28` | Priority, active reasoning step, revision, change |
| Ink | `#16191B` | Main copy and strong structure |
| Stock | `#F2F0E8` | Warm technical-paper page |
| Paper | `#FCFAF4` | Lifted evidence field, without a shadow |
| Panel | `#E5E3DB` | Supporting modules and table headers |
| Rule | `#BFC2BC` | Quiet borders and technical structure |
| Muted | `#656B6E` | Qualifiers, annotations, and secondary labels |
| Dark | `#171A1C` | A directive or revision page |
| Inverse | `#F6F3EA` | Main text on dark |
| Inverse notes | `#AEB4B5` | Supporting text on dark |
| Inverse rule | `#4B5154` | Structure on dark |

Orange has a job. Use it for one active step, a meaningful priority, or a revision signal. Routine prose remains Ink. Do not color every number orange or use warning symbolism for ordinary content. On orange fields, use Ink text. Dark pages use Inverse and Inverse notes, with the same orange retained as a signal.

## Print grid and geometry

Use **A4 portrait**, **44 pt top/side margins**, and a **52 pt bottom margin**. The content field is approximately 507 pt wide. Use a **4 pt baseline** and prefer 12, 16, 24, and 32 pt gaps. Ordinary explanatory text can occupy a **328 pt field**, leaving a structured annotation strip. A deliberate opening can use a wider display span while keeping metadata in a narrow field.

The signature is a **6 pt vertical orange spine** with an **18 pt content inset**. It introduces an opening or a major directive. Do not replace it with caution stripes. Fine structural rules are **0.75 pt**; evidence modules use **4 pt top rules**. Corners are square, with no shadows or rounded-card treatment. A light Paper field can distinguish a source or method without implying elevation.

The three-step evidence chain is **Source → Reason → Act**: equal-width modules, **20 pt connector fields**, **12 pt internal padding**, and straight arrows. Source names an observation, record, or constraint; Reason explains the transformation or judgment; Act states the result, owner, and next condition. Orange marks Reason in the standard demonstration. It may identify another active step only when the content makes that status explicit.

## Type system

Use **OpenDoc Sans**, the local Source Sans 3 derivative, for display and prose. It substitutes for the original Public Sans. Use **OpenDoc Mono**, the local Source Code Pro derivative, for codes, revision labels, units, and annotations. Both are already embedded by OpenDoc. Mono has a real regular face; keep it at 400 instead of requesting an unavailable bold face. Display and emphasis use the real Sans 600 face.

| Role | Size / line height | Treatment |
| --- | --- | --- |
| Identity display | 52 pt / 0.98 | Tracking −1.2 pt; compact and declarative |
| Main title | 38 pt / 1.02 | Tracking −0.75 pt; 20 pt after |
| Directive title | 48 pt / 1.02 | Inverse on Dark; orange spine |
| Section | 21 pt / 1.10 | 24 pt before, 12 after |
| Subheading | 13 pt / 1.20 | 20 pt before, 8 after |
| Lead | 14 pt / 1.45 | Muted; short measure |
| Body | 10.5 pt / 1.50 | 12 pt paragraph gap |
| Caption/code label | 8 pt / 1.40 | Mono; concrete information only |
| Running note | 7.5 pt / 1.40 | Mono; use sparingly, never for the main argument |

Use sentence case for claims. Uppercase belongs to short document codes, revisions, classifications, and units. Do not invent tiny decorative labels to make an empty page look technical. Long content flows; a manual is not a stack of fixed-position posters.

## Reusable component API

Import `theme` from `themes/field-manual`, and import the following from `components.tsx`. Place the components inside an OpenDoc `Document` using that theme.

- `ManualPages({title, code?, revision?, surface?, children})` supplies flowing pages and actual repeating header/footer records. `surface` is `light` or `dark`.
- `ManualCode({id, code, label, surface?})` pairs an orange code badge with a mono classification.
- `ManualSpine({id, children})` provides the exact 6/18 pt opening geometry.
- `ManualOpening({id, code, label, title, subtitle?, surface?})` keeps the title and its supporting line with the code.
- `SpecRows({id, rows, surface?})` takes `{label, value}` records. Labels occupy 68 pt; values flow beside them. Use real metadata, definitions, or revision information.
- `EvidenceChain({id, steps})` takes exactly three `{title, detail}` entries in source/method/action order.
- `ManualAnnotation({id, code, surface?, children})` separates a quiet explanatory note from the main reading field.
- `DirectivePage({id, code, revision, title, lead, rows})` creates a full dark closing/revision page with an orange rule and spine. It is reusable publication content, not a preview-only graphic.

Preserve stable IDs and real record identity. Avoid wrapping a whole long section in an unbreakable component. Normal `TitleBlock`, headings, tables, figures, lists, code, and callouts also receive executable theme styles.

## Evidence and image rules

Tables expose units in headers, align numbers, use 9 pt cell padding, and favor horizontal rules. Header borders paint through cells because the current PDF engine ignores borders on a table row. Put sources and qualifications close to the exhibit. The demonstration handover is illustrative; it claims no operational findings.

Charts stay mostly monochrome unless orange identifies the one comparison that matters. Diagrams name inputs, methods, outputs, and evidence links; use straight connectors. Images retain their aspect ratio and readable detail. Add a crop only when it preserves the relevant evidence. Brand marks use supplied assets and real provenance. Avoid gradients, grunge, faux stamps, agency insignia, ornamental coordinates, and automatic warning icons.

## Implementation and review

The system combines an orange spine, mono record labels, the Source / Reason / Act chain, and a dark directive composition. It uses flowing A4 pages and bundled OpenDoc Sans and Mono. Keep this specification synchronized with `index.ts` and the theme components. Review every page, dark-background visibility, repeated revision furniture, narrow metadata values, table continuation, and copied PDF text.
