# Proposal deck

A client-facing decision deck with the character of a clear executive memorandum: a narrow navigation rail, large recommendation, evidence-led image pauses, precise ledgers and stage gates. The fourteen-slide specimen is a replaceable placeholder skeleton, not a fixed sales script or a contractual agreement.

## Adapt to the client

The default sequence is commission, recommendation, situation, outcomes, approach, workstreams, deliverables and acceptance, scope boundary, timeline, governance, relevant evidence, investment, dependencies and risk, next decision. Lead with the client's priorities. In an RFP, the required response order and evaluation criteria take precedence; add a compliance map if useful. A short proposal may need only recommendation, scope, delivery, price and decision. Move detailed schedules or terms to explicit appendix slides or a companion document. Do not force a proposal to contain a case study, three outcomes or two pricing options if it has none.

All starter copy is local TSX and editable. Use ordinary native text and keep stable slide/component IDs when adapting or reordering. The shell accepts caller themes; presentation sizes and canvas geometry are intentional local adaptations, with colors and families from the theme. Defaults are 960 × 540 and a 38 pt title. Reduce a long title explicitly, adjust geometry, or split a slide; do not hide overflow or shrink all content automatically. Most body copy is 16–24 pt. Footer notes are supporting material, never the only location for a material term.

`ProposalSlide` supplies the navigation and heading. `ProposalPanel`, `ProposalCopy`, `ProposalLabel`, `ProposalRule`, `ProposalPicture` and `ProposalLedgerRow` can be recombined locally. The ledger's four cells remain independently editable; keep meaningful row IDs. Text panels require an explicit height and ledger cells reserve 72 pt for copy (23 pt in the header). These bounds make excess content a preflight error before it can collide with another region. Adjust the height and neighboring geometry together, or split the content; do not disable clipping checks. Optional image props deliberately leave a visible labeled position. Supply `image={{item:'reviewed-local-image'}}`, with `fit:'contain'` for diagrams. `MediaFrame` preserves the native text around the image. The cover's portrait crop, approach's wide visual and case story's tall evidence panel serve different purposes. Use approved, relevant artwork and inspect its crop, contrast and provenance. No fabricated stock case results or implicit endorsement logos.

## Research behind the skeleton

Research checked 11 September 2026. These sources inform our independent structure; this is not an official Shipley or government template.

- [Shipley Proposal Writer Playbook](https://digital.shipleywins.com/view/320547/i/): organize around client issues and benefits, connect features to their value, and support differentiation with evidence and risk mitigation. Applied here to the opening recommendation, benefit-linked approach, specific proof story and an explicit next decision. Research rationale is in this guide rather than pretending to be evidence for the future client's claims.
- [Shipley: Winning Executive Summaries](https://digital.shipleywins.com/view/1002657341/30-31): executive summaries should be organized around the customer's important issues. Applied as a concise, self-contained decision memo before company credentials.
- [FAR Subpart 37.6: Performance-Based Acquisition](https://www.acquisition.gov/far/subpart-37.6): outcome descriptions, measurable performance standards and assessment methods provide a useful structure for delivery clarity. Applied as separate outcome measures, deliverable acceptance evidence, named approval roles and stage gates. This is a structural reference; US procurement rules are not asserted to govern a general client engagement.

The optional commercial comparison, scope boundary and dependencies are design judgments for decision clarity. They do not supply legal or commercial terms: replace every amount, currency, tax treatment, payment condition, validity period, date, allocation, client name and claim with actual agreed or explicitly proposed material. Distinguish expected benefits from proven results. Case results need a source, measurement window, attribution, permission and transferability limits. If evidence is unavailable, omit the slide or state a planned validation approach.

## Finish

Create through the presentation template catalog so project membership, format, theme adapter and assets are recorded. Review every slide after changes: these are bounded slides, not flowing pages. Confirm title fit, ledger row endings, contrast on the two dark slides, all commercial assumptions and the closing decision. Keep proofs outside the user's document library.
