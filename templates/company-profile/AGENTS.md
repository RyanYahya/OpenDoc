# Company profile

A credible introduction to an organization, designed like an architectural portfolio: a strong left edge, long rules, generous photographs, numbered capability rows, and a clear shift from identity to proof. The catalog is a neutral skeleton with replaceable placeholders. It makes no claims about any real business.

## What the sequence is for

The twelve-slide specimen is a starting conversation, not a mandatory corporate history. Start with a plain-language company introduction and facts the reader needs; give purpose a practical consequence; explain capabilities and relevant sectors; show how work gets done; then demonstrate one project, the people, presence, and documented assurances behind it. End with a real contact and a useful next conversation. It deliberately excludes the funding ask of a pitch and the buyer-specific scope, price, and acceptance of a proposal.

1. **Cover:** company identity, audience/edition, short positioning, and a tall signature image.
2. **Snapshot:** what the company does beside four substantiated facts. Prefer relevant capacity over vanity metrics.
3. **Point of view:** one belief paired with a decision or behavior it changes.
4. **Capabilities:** three distinct capabilities, each tied to a customer need and deliverable. Repeat the ledger if necessary.
5. **Sectors:** an unequal image spread that shows real contexts and applications.
6. **Operating model:** four stages, each with a concrete output. Rename, remove, or change the number of stages to fit the actual organization.
7. **Selected work — context:** a large project image, client/context, specific company role, period, and status.
8. **Selected work — evidence:** challenge, company contribution, observed result, and an explicit evidence/method note. A qualitative result is preferable to an invented metric.
9. **Presence:** a location ledger with truthful delivery reach. An office, a partner, a former project, and remote coverage are different facts; never imply a map of owned offices without evidence.
10. **People:** portraits with relevant expertise and accountability. One founder or a working team may be more relevant than a leadership parade.
11. **Credentials and responsibility:** optional documentary register; exact issuer, scope, status/date, and evidence. Remove rows or the slide when nothing relevant is substantiated.
12. **Contact:** a named person, direct contact information, and a useful invitation.

For a short introduction, keep slides 1, 2, 4, 7–8, and 12. A small or new company may replace corporate past performance with honestly attributed prior work of team members, a disclosed demonstration, or relevant expertise. Do not relabel prior-employer work as company delivery. A product business can replace the method slide with a product-system overview; an established group may replace purpose with a brief milestone timeline when history explains its present capability. These are content-led variations, not universal requirements.

## Research behind the skeleton

Read September 11, 2026. The structure is a synthesis, not a claim that these organizations endorse a twelve-slide deck. No source company facts, identities, artwork, or claims are copied into the specimen.

- [U.S. Small Business Administration — How to Prepare a Winning Capability Statement](https://legacy.sba.gov/event/85955): the SBA's published workshop outline identifies company profile, competencies, differentiated value, past performance, industries, credentials, company facts, clients, and contact. This informed the profile's buyer-useful content and evidence sequence. A capability statement is usually shorter; this deck expands those questions into visual presentation space. Government procurement identifiers belong only in a relevant local adaptation.
- [DHL Group — About us](https://group.dhl.com/en/about-us.html): this official profile separates a concise organizational description, current figures, service portfolio, operating structure, commitments, and fact-sheet downloads. That separation informed the snapshot, capabilities, method, and assurance slides. The deck asks authors to specify the period/scope behind their own figures.
- [Turner & Townsend — Who we are](https://www.turnerandtownsend.com/who-we-are/): the official profile brings people, leadership, key facts, purpose, values in practice, and corporate responsibility together. It informed the connection between purpose and actual behavior, the people slide, and a documented responsibility section. Photography is a primary storytelling surface, paired with concrete content.

## Authoring contract

Create through `pnpm run create -- <id> --project <project-id> --template company-profile --title "Company name"`. The descriptor records presentation format. Keep the generated theme adapter and saved asset bindings. All initial story content lives in the instance's `index.tsx`; shared `index.tsx` supplies composition primitives. A template revision changes shared layout, so keep adaptations for one company local.

`CompanyProfile` is the native `Presentation` root. `ProfileSlide` takes a stable `id`, caller `theme`, native `title`, optional `eyebrow`, `folio`, `footer`, and content; `cover` uses a narrower title region and large type. `titleSize` is an explicit local adjustment for long names. `ProfileRegion` is a bounded rectangle (`x`, `y`, `width`, `height`) for ordinary content. `ProfileText`, `ProfileRow`, `ProfileRule`, and `ProfileImage` are small reusable primitives. Text remains native and IDs remain stable when slides move. Folios are visual labels: update them after reordering, never use them as IDs.

Every slide is 960 × 540. Default title regions occupy y=72–188, ordinary content y=196–482, and the footer starts at y=496. The large cover title occupies x=40–504, y=142–344; its content starts at y=354. Keep these regions separate. Adjust title size, image balance, or column measures when useful; add a slide when content outgrows its region. There is no automatic shrinking or hidden overflow. A clipping/preflight error requires an explicit revision. Fonts, colors, and page treatment come from the caller's theme; presentation sizes remain intentional so document-size roles do not make slides illegible.

## Photographs and evidence

`ProfileImage` shows a labelled placeholder when `image` is omitted. Supply `image={{item:'local-media-id',fit:'cover',position:{x:0.5,y:0.5}}}` to use a managed `MediaFrame`. Broken named media fails visibly rather than becoming a placeholder. Use `contain` for product screens or diagrams whose edges carry information. Replace placeholder captions with accurate descriptions and attribution as appropriate. No stock photography or source company artwork is bundled.

Import actual imagery into the instance's `media/<id>/` folders through [Media](../../docs/MEDIA.md). A full photo, a technical detail, and a portrait carry different information; use the deliberately unequal frames to express that hierarchy. Review actual crops, image visibility, captions, and contrast on every affected slide. A short deck should remove unnecessary image slots rather than fill them with decoration.

Never invent client names, testimonials, metrics, certifications, awards, geographic presence, or sustainability achievements. Ask for evidence or use explicit placeholders. Distinguish a target from a result, a registration from a certification, and a capability from past delivery. Use accurate approved anonymization where confidentiality requires it. The bracketed text is drafting guidance, not finished business copy; replace or remove it before sharing externally.

Review every rendered PDF slide after adaptation, extract representative native text, and verify one page per slide. The automated tests exercise normal creation, independent editable instance content, selected themes, bounded sparse/long cases, and explicit overflow rejection. Catalog specimens and acceptance proofs stay outside the user's document library.
