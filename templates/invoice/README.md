# Invoice

A native Forme invoice with a prominent amount due, invoice references and dates, paired seller/customer details, line items, calculated totals, and optional payment instructions. Defaults are A4 portrait, 48-point top/side and 52-point bottom margins, 10.5/14.7-point body text, a 28-point title, and a larger opening balance. The caller's theme supplies appearance. Treat the composition as an adaptable starting point; no page count is enforced.

`invoiceTemplate(theme)` uses the existing `parse`, `meta`, and `render` contract. Bind it to the instance's `data.json` with `bindTemplate`. The catalog creates a separate data file for each invoice and records template/data provenance. Editing that file updates content, metadata, and calculations. `Invoice` accepts parsed `data`, `theme`, and optional native `titleStyle` for a local design variation. The catalog preview uses Neutral.

## Data contract

Required fields are `schemaVersion: 1`, `title`, `number`, `issuedOn`, `seller`, `customer`, `synthetic`, and `pricing`. Optional `dueOn` is a real date on or after the issue date. All dates use `YYYY-MM-DD`; dates and status are not inferred from today's clock. Optional `reference` can identify a supplied purchase order, quotation, or project reference.

Each party has a required single-line `name` of up to 180 characters and optional `details` of up to 700 characters and eight supplied lines. Names and address/contact details wrap naturally in the paired columns. Supplied registration or tax identifiers can appear in these details when appropriate. This generic format does not certify regulatory or electronic-invoicing compliance.

Optional `introduction`, `paymentInstructions`, and `paymentReference` provide supplied prose and remittance details. No bank account is invented. Optional `notes` is an array of `{ id, title, text }` with unique stable IDs. Notes have stable length-prefixed comment targets, while the item table remains one target through pagination. Unknown fields and unsupported amounts fail clearly.

`synthetic` must be explicit. All bundled examples mark their parties, prices, dates, payment details, and recorded payments as illustrative. Set it to false only after replacing the samples with real supplied material. The template does not send invoices or execute payments.

## Pricing and payments

The pricing contract and rounding rules are shared with [Quotation](../quotation/README.md): decimal-string quantities and amounts, explicit currency precision from 0 to 3, each line rounded half up, a fixed discount subtracted from the subtotal, then one supplied tax rate applied to that net subtotal and rounded half up. No tax rate is inferred. The example's 10% is illustrative only.

Optional `amountPaid` is the cumulative amount already received, as a nonnegative decimal string with no more fractional digits than the currency allows. Omission means no payment has been recorded for this new invoice; the payments row is omitted. An explicit `"0.00"` displays a zero-payment row. A supplied payment may cover the whole invoice but cannot exceed it. Amounts must fit within `Number.MAX_SAFE_INTEGER` minor units, although arithmetic uses BigInt throughout.

`calculateInvoice` returns the shared totals, `paidMinor`, and `balanceMinor`. Payments are subtracted **after** discounts and tax; they never change taxable pricing. The opening and final amount due use the same calculated balance. The typical example is USD 1,320.00 total − USD 320.00 received = USD 1,000.00 due. A full payment produces a zero balance without generating an unverified status, receipt, or payment date.

Credits, overpayments, multiple tax rates, inclusive tax, additional charges, and payment-history reconciliation are outside this version's data contract. Extend them explicitly rather than putting a contradictory total in a note. Long tables repeat headers, totals stay together, and long payment instructions or notes remain normal flowing paragraphs. See [AGENTS.md](AGENTS.md) for design flexibility and preservation requirements.

## Logo

The opening has a quiet, outlined **YOUR LOGO** placeholder at the upper right. It appears once, on the cover when present or at the start of the body. Replace it with supplied artwork through the optional `logo` prop, or pass `logo={null}` to omit it. The placeholder follows the selected theme; actual artwork retains its own colors. Keep logo dimensions bounded and preserve its aspect ratio; 88 × 28 points is a starting size, not a brand requirement.

Import reusable artwork into the shared [asset library](../../docs/ASSETS.md), inspect its variation guidance, and bind an exact version to the intended document:

```sh
pnpm assets -- inspect logo acme
pnpm assets -- bind my-document logo acme --variation default
```

Import `Logo` from `opendoc` and supply `<Logo width={88} height={28} />` through the `logo` prop. Choose a variation for the actual page background, preserve its proportions, and review the PDF. The existing logo block provides the feedback target; a decorative mark needs no figure caption. Artwork belongs in the layout, separately from commercial JSON.

The bound starter accepts `invoiceTemplate(theme, { logo: <Logo width={88} height={28} /> })`; use `{ logo: null }` to omit it. Pass the adapted document theme from `./theme` to this factory.
