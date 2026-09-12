# Quotation

A native Forme quotation with an opening reference and dates, paired seller/client details, line items, calculated totals, and optional terms and acceptance. Defaults are A4 portrait, 48-point top/side margins and 52-point bottom margin, 10.5/14.7-point body type, and a 28-point title. The caller's theme supplies appearance. The design is an adaptable starting point, not a fixed page count or commercial writing method.

`quotationTemplate(theme)` supplies the existing `parse`, `meta`, and `render` contract. Bind it to local JSON with `bindTemplate`. For a local design variation, `Quotation` accepts parsed `data`, `theme`, and a native `titleStyle`. Keep input parsing at the document boundary before metadata or rendering. `preview.tsx` offers sparse, typical, and long specimens; the catalog proof uses Neutral.

## Instance data

Creation copies this folder's `data.json` into the new document and safely fills the initial title. Each document then edits its own data. Its TSX entry exports template and data provenance; changing `data.json` changes the content and metadata. Existing quotations and template examples do not share mutable input.

Required fields are `schemaVersion: 1`, `title`, `number`, `issuedOn`, `seller`, `client`, `synthetic`, and `pricing`. Dates use real `YYYY-MM-DD` values. Optional `validUntil` cannot precede the issue date. Each party has a required `name` (one supplied line, up to 180 characters) and optional `details` (up to 700 characters and eight supplied address/contact lines). Both wrap naturally within the columns. Longer background belongs in the flowing introduction or terms.

Optional `introduction` and `acceptance` are prose. Acceptance adds blank name, signature, and date lines, not an assertion that anyone has signed. Optional `terms` is an array of `{ id, title, text }`; each ID must be unique and stable when reordered. Term comment targets include a length-prefixed ID. The pricing table is a single stable comment target across pages. Unknown fields fail rather than silently disappearing.

Set `synthetic: true` for illustrative data. All bundled examples identify fictional parties, dates, prices, rates, and terms in the PDF and each footer. Set it to false only after replacing the samples with actual supplied material. This is a generic quotation format; no jurisdiction-specific tax or legal certification is claimed.

## Pricing contract

`pricing.currency` requires a three-letter uppercase `code` and an explicit `decimals` integer from 0 to 3. Currency precision is supplied, not guessed. All prices, quantities, discounts, and percentages are decimal **strings**, never floating-point numbers, signed values, exponents, or formatted values with commas.

- Each of 1–500 `items` has a unique stable `id`, a `description` of at most 600 characters and eight supplied lines, positive `quantity` with up to three decimal places, and nonnegative `unitPrice` with up to the currency's declared decimal places. Optional single-line `unit` describes the quantity. Decimal inputs allow up to nine integer digits.
- Optional `discount` is a fixed monetary amount and cannot exceed the subtotal. Omit it when unused.
- Optional `tax` has a supplied `label` and `ratePercent` from 0 to 100, with up to two decimal places. Omission means no tax calculation was supplied; it does not classify the transaction as exempt. No rate is inferred. The example's 10% is illustrative only.

The shared `templates/_shared/commerce.ts` uses integer arithmetic: quantity × unit price is rounded to the currency precision **for each line, half up**; those rounded lines form the subtotal; the fixed discount is subtracted; the supplied tax rate is applied to that net amount and rounded half up once; the quoted total is net plus tax. Both subtotal and total must fit within `Number.MAX_SAFE_INTEGER` minor units, although calculations themselves use BigInt. The typical example is 1,225.00 − 25.00 + 120.00 = USD 1,320.00.

This version supports one currency and one tax rate applied to the whole discounted subtotal. Inclusive tax, line-specific rates, percentage discounts, credits, and additional charges need an explicit contract extension. Do not work around validation by typing different totals into prose. `templates/_shared/Pricing.tsx` provides the native line-item and totals display for the quotation, invoice, and proposal layouts.

## Logo

The opening has a quiet, outlined **YOUR LOGO** placeholder at the upper right. It appears once, on the cover when present or at the start of the body. Replace it with supplied artwork through the optional `logo` prop, or pass `logo={null}` to omit it. The placeholder follows the selected theme; actual artwork retains its own colors. Keep logo dimensions bounded and preserve its aspect ratio; 88 × 28 points is a starting size, not a brand requirement.

Import reusable artwork into the shared [asset library](../../docs/ASSETS.md), inspect its variation guidance, and bind an exact version to the intended document:

```sh
pnpm assets -- inspect logo acme
pnpm assets -- bind my-document logo acme --variation default
```

Import `Logo` from `opendoc` and supply `<Logo width={88} height={28} />` through the `logo` prop. Choose a variation for the actual page background, preserve its proportions, and review the PDF. The existing logo block provides the feedback target; a decorative mark needs no figure caption. Artwork belongs in the layout, separately from commercial JSON.

The bound starter accepts `quotationTemplate(theme, { logo: <Logo width={88} height={28} /> })`; use `{ logo: null }` to omit it. Pass the adapted document theme from `./theme` to this factory.
