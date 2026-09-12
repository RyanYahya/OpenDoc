# Pitch deck

A clear venture story with visual conviction: large statements, before/after contrast, an expansive product position, honest evidence, a readable market calculation and a concrete funding ask. This is a replaceable placeholder skeleton, not a fictional company or a claim that every founder needs fourteen slides.

## Research basis

Primary sources read on September 11, 2026:

- [Kevin Hale, How to Design a Better Pitch Deck, Y Combinator](https://www.ycombinator.com/blog/how-to-design-a-better-pitch-deck/) (2015). The design uses large type, high contrast, one principal idea per slide and explicit takeaways. Product visuals should show a single understandable result; simplify or crop a complex screenshot. Hale's short Demo Day context calls for roughly five to seven remembered ideas, not a full investor-meeting deck. Select a short sequence for that use rather than presenting every slide here.
- [Team Sequoia, Writing a Business Plan](https://sequoiacap.com/article/writing-a-business-plan) (2019). The skeleton covers company purpose, customer pain, solution, timing, market, alternatives, business model, team, financials when available and future vision. Its distinctive concern is clarity about the company and opportunity. These subjects are starting questions; their order and depth should follow the actual venture.

The fourteen-slide meeting skeleton, evidence-chart frame, bottom-up market calculation, dedicated go-to-market slide, actuals/assumptions separation and milestone-based ask are this template's synthesis. Neither source prescribes this exact sequence, these layouts or a universal page count. No affiliation or endorsement is implied.

## Editable story and sensible variations

`starter.tsx` copies every slide, text prompt, image position and local layout choice into the instance. `index.tsx` supplies only native composition helpers. Change the story in `documents/<id>/index.tsx`; do not edit the shared template to correct one company.

The starting order is purpose → pain → solution → product → timing → evidence → market → model → acquisition → alternatives → team → financial position → ask → vision. Move exceptional traction or uniquely relevant founders earlier. Merge pain and solution for a simple product. An unlaunched venture should show customer learning, a test or a real commitment instead of pretending to have commercial traction. Remove unavailable financial history; make planning assumptions explicit. Add appendix slides for financial detail, cohort evidence, market calculations, technical diligence or source records when needed.

For a short stage pitch, select about five to seven key ideas, increase secondary copy sizes and remove footer detail that belongs in the leave-behind. For an investor meeting or emailed deck, keep the narrative understandable without a presenter and retain useful source notes. Avoid universal market-percentage claims and charts that imply observations where none exist.

## Composition contract

- `PitchDeck` wraps `Presentation`; `PitchSlide` is one explicit 960 × 540 page. Header titles generally use 38 pt; hero statements use 48–64 pt. These are adaptable presentation sizes, not automatic fitting rules.
- `PitchText` places a bounded native paragraph with a transparent `body` slot. Its `x`, `y`, `w`, `h`, `size` and color are ordinary caller-controlled choices. A long title may use a smaller explicit size, a wider measure or a different composition. Keep a readable hierarchy; split a crowded slide instead of shrinking all copy.
- `PitchPanel` supplies structural paper/dark surfaces and rules. `PitchImage` takes an optional managed `image={{item:'id',fit:'contain'}}` source. Use contain for charts and UI that must remain whole; cover with an intentional position for photography. Omitted media shows a labeled empty state; a named missing item is an error.
- Catalog artwork stays empty. Import each company's actual media into that document's managed library, following [Media](../../docs/MEDIA.md). Use permissioned portraits and product images, and label concepts. The template includes no bundled brand logos or invented customer endorsements.
- Caller theme fonts, paper, ink and role styles remain live. The geometry and explicit display sizes serve a slide canvas. Dark slides pair theme ink with theme paper; review contrast if adapting to an unusual palette.
- Keep slide IDs, block IDs and `TextSlot` names stable when reordering or rewriting the same idea. All actual narrative props belong to the instance. New ideas receive new IDs.
- Each bounded box declares clipping so excess content is rejected rather than silently discarded. Rendering must produce exactly one page per slide. Review every slide after substantial text or theme changes.

The Neutral specimen shows the complete layout family. Sparse and long-title render checks, a second McKinsey Consulting theme and disposable creation checks exercise the contract. The current PDF remains the authority for visual review.
