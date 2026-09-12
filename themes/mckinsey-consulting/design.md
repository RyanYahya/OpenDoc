# McKinsey Consulting

Answer-first analytical editorialism: one conclusion, one exhibit that proves it, one explicit implication. This independent OpenDoc system applies analytical publication conventions to flowing A4 pages. It is suited to executive decisions, operating reviews and business cases. It does not use McKinsey logos or claim affiliation.

## Palette

The executable tokens are `colors` in `index.ts`; keep this table synchronized when refining them.

| Role | Hex | Use |
| --- | --- | --- |
| Deep blue | `#051C2C` | Text, structure, dark covers |
| Electric blue | `#2251FF` | The focal datum or governing conclusion |
| White | `#FFFFFF` | Analytical canvas, inverse copy |
| Gray | `#4D4D4D` | Secondary copy and source notes |
| Rule | `#D0D0D0` | Axes, dividers and table rules |
| Soft | `#F0F0F0` | Context bands and alternate rows |
| Pale blue | `#AAE6F0` | Implication field or selected row |
| Cyan | `#00A9F4` | Secondary emphasis, used sparingly |
| Series 1–4 | `#034B6F`, `#027AB1`, `#39BDF3`, `#71D2F1` | Ordered dark-to-light series |
| Positive | `#3C96B4` | Favorable movement when direction is defined |
| Caution | `#FAA082` | A watch item |
| Negative | `#E5546C` | Adverse variance or exception |

Keep most analytical content deep blue, gray and white. Electric blue earns attention by being scarce. Semantic warning colors require a meaningful exception; they are never decoration. The cover may combine the ordered blues in an abstract rectangular field, but charts use color to explain evidence.

## Type, space and geometry

Use the embedded **OpenDoc Sans** regular and semibold faces. This is a deliberate substitute for proprietary McKinsey Sans. There is no CSS fallback stack and no external font request. OpenDoc Mono appears only in the system specimen’s hex values.

| Role | Size / leading |
| --- | --- |
| Cover | 62 pt / 1.01 |
| Answer or exhibit heading | 31 pt / 1.10 |
| Section | 19 pt / 1.15 |
| Subheading | 12 pt / 1.20 |
| Body | 10.5 pt / 1.42 |
| Table | 9 pt |
| Source | 8 pt / 1.35 |

Use sentence case and restrained semibold emphasis. Keep the answer to two or three short lines on A4. Do not bold a whole paragraph. Keep numerical labels flush right and use a shared comparison scale.

The page is A4 portrait with 48 pt left/right/top margins and 52 pt below. Build from a 12-column construction with 12 pt gutters; use 4 pt spacing increments. All analytical containers have square corners. Rules are 0.5 pt. Gaps and aligned edges separate groups; avoid boxed cells, rounded dashboards, shadows, gradients and decorative icons.

## Composition and evidence

An analytical page follows **exhibit marker → answer → metric frame → evidence → implication → source**. The metric frame defines unit, population, period and comparison basis. Give the evidence the largest area. A title claiming “three levers account for 82%” requires those three contributions and their sum to be immediately inspectable.

Sort bars to expose the pattern and directly label values. Begin bars at zero; show a benchmark in the same field when relevant. Use exact-value tables when precision matters more than shape. Use a dark header and fine horizontal rules; select at most one row or decisive range. Source notes disclose limitations without hiding them in microscopic text. Synthetic data is labeled as illustrative at the exhibit and page footer.

Long prose and tables flow normally. Do not put an entire report in an unbreakable container or force every section onto a hand-positioned page. Reserve the separate dark cover for a substantial publication; a short memo starts directly with its answer.

## Reusable components

Import the theme from `./index` and the components below from `./components` (use the corresponding relative paths in a document). Pass this theme to the enclosing OpenDoc `Document`.

| Component | Inputs and purpose |
| --- | --- |
| `ConsultingCover` | `id`, `title`, `subtitle`, optional `label`; dark cover with a rectangular field and automatic folio |
| `ExhibitTitle` | `id`, `number`, `topic`, `metric`, conclusion as children; keeps the claim with its measurement definition |
| `RankedBars` | `id`, rows of `{label, detail?, value}`, optional `max`, `suffix`, `highlight`; common zero scale and direct labels |
| `Implication` | `id`, optional `label`, text children; pale-blue decision field |
| `SourceNote` | `id`, text children; a readable caveat and source line |

Use standard OpenDoc `Pages`, `Paragraph`, `DataTable`, `Figure` and citation primitives for the rest; the theme’s native role styles already govern them. Retain stable IDs. The three-page `preview.tsx` demonstrates the cover, exact system grammar and an applied analytical exhibit through these same reusable components.

## Basis

This is an independent implementation using OpenDoc primitives, a deep-blue/electric-blue palette, answer-first exhibits, and square geometry. It uses bundled OpenDoc Sans instead of proprietary fonts and includes no McKinsey artwork. The theme does not claim affiliation or endorsement.
