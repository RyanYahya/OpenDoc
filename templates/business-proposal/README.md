# Business proposal

A flexible narrative proposal layout with an optional cover, client/team context, broad body column, and optional calculated pricing and acceptance. Defaults are A4 portrait with 54-point side/top and 58-point bottom body margins, 11/15.95-point body text, and 10-point paragraph gaps. The opening title is 30 points on the body page or 40 points on a separate cover. The caller's theme supplies visual hierarchy, rhythm, and component treatments.

`BusinessProposal` requires `title`, `theme`, and ordinary OpenDoc `children`. Optional `subtitle`, `preparedFor`, `preparedBy`, `date`, `reference`, and `openingNote` supply opening content. These are authored text, not inferred facts or dates. `cover` defaults to false; set it to true for a separate title page. `titleStyle` accepts native Forme overrides. A short optional `runningTitle` repeats above body pages. Page numbers follow physical PDF order, including any cover pages.

The document imposes no section outline. Add scope, deliverables, schedule, evidence, or exhibits where they help. `ProposalHeading` supplies 16-point section defaults and accepts a stable `id`, children, and native `style`. Keep a heading and a genuinely short lead together with a native unbreakable View; leave longer passages in normal flow. The specimen deliberately starts commercial details on a new page, but the layout component imposes no such break.

Optional verified `references` use the existing Cite/References system and appear after the body. Optional inline `acceptance` supplies authored wording followed by blank name, signature, and date lines. Omit it when acceptance is recorded elsewhere. Neither an acceptance process nor legal terms are fabricated by the template.

## Optional pricing

Pricing is a component, not a required document structure. `ProposalPricing` accepts a unique stable `id`, parsed `data`, and the same `theme` as the proposal. Its input is `{ synthetic: boolean, pricing: ... }`, validated with `parseProposalPricing` at module load before metadata/rendering. Prose remains in TSX; only commercial data uses JSON. Unknown input fields fail clearly, and missing or invalid pricing does not silently generate a total.

The starter includes a sample pricing section and owns a copied `data.json`. Editing that file changes only its commercial data; its title and narrative remain in the document's TSX. To make an unpriced proposal, omit ProposalPricing and its input/binding and remove the unused data provenance. No separate data file is required by BusinessProposal itself. For alternative commercial options, use distinct component IDs and separately validated pricing objects. IDs preserve table and totals comment targets when sections move.

Pricing uses the same [contract and rounding](../quotation/README.md) as Quotation: decimal strings, explicit currency precision, each line rounded half up, an optional fixed discount, and one supplied tax rate on the discounted subtotal. Totals are calculated with integer arithmetic. No tax rate, payment terms, or commercial claim is inferred. Multiple tax rates, inclusive tax, other discount models, and additional charges need an explicit contract extension. An invoice's payment balance does not belong in proposed pricing.

The required `synthetic` flag keeps sample amounts visibly identified in the pricing section. Set it to false only after substituting real supplied material. The sample's 10% rate and all prices are illustrative. The typical total is USD 1,320.00. Any proposed commitment, exclusions, schedule, acceptance wording, and other conditions remain authored content outside the calculation.

`preview.tsx` supports sparse, typical, and long specimens, optional cover and pricing, and a second theme for review. The catalog defaults to a Neutral, no-cover proposal. See [AGENTS.md](AGENTS.md) for design freedom and functional requirements.

## Logo

The opening has a quiet, outlined **YOUR LOGO** placeholder at the upper right. It appears once, on the cover when present or at the start of the body. Replace it with supplied artwork through the optional `logo` prop, or pass `logo={null}` to omit it. The placeholder follows the selected theme; actual artwork retains its own colors. Keep logo dimensions bounded and preserve its aspect ratio; 88 × 28 points is a starting size, not a brand requirement.

Import reusable artwork into the shared [asset library](../../docs/ASSETS.md), inspect its variation guidance, and bind an exact version to the intended document:

```sh
pnpm assets -- inspect logo acme
pnpm assets -- bind my-document logo acme --variation default
```

Import `Logo` from `opendoc` and supply `<Logo width={88} height={28} />` through the `logo` prop. Choose a variation for the actual page background, preserve its proportions, and review the PDF. The existing logo block provides the feedback target; a decorative mark needs no figure caption. Artwork belongs in the layout, separately from commercial JSON.

Pass the artwork directly to `BusinessProposal` through its `logo` prop. Use the adapted document theme from `./theme`.
