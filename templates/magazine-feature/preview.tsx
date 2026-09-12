import * as F from '@formepdf/react';
import { Figure, Heading, Paragraph, Section } from 'opendoc';
import { neutral } from '../../themes';
import { type DocTheme } from 'opendoc/themes';
import { FeatureQuote, MagazineFeature } from './index';

export const meta = { title: 'Magazine feature', description: 'A neutral layout specimen. All text and visual areas are placeholders.', kind: 'article' as const, theme: 'neutral' };
const paragraph = 'This is placeholder text for the reading column. The feature opens across a broader measure, then settles into a narrower passage offset from the left margin. These words show the rhythm of a printed page: the space between paragraphs, the length of a line, and the return to ordinary prose after a visual pause. They report no findings and describe no real person or event.';

export function Specimen({ length = 'typical', theme = neutral }: { length?: 'sparse' | 'typical' | 'long'; theme?: DocTheme } = {}) {
  const sparse = length === 'sparse';
  const count = length === 'long' ? 16 : 3;
  return <MagazineFeature title={meta.title} theme={theme}
    kicker={sparse ? undefined : 'FEATURE / LAYOUT SPECIMEN'}
    author={sparse ? undefined : 'Author name · Illustrative placeholders'}
    standfirst={sparse ? undefined : 'An expansive opening gives the story a visual presence before the page settles into a quieter reading rhythm.'}
    hero={sparse ? undefined : <Figure id="specimen-hero" caption="Opening image position. This frame is a layout placeholder, not evidence.">
      <F.View style={{ height: 170, backgroundColor: theme.paper, borderWidth: 0.6, borderColor: theme.line, justifyContent: 'center', alignItems: 'center' }}>
        <F.Text style={{ fontSize: 10, color: theme.muted }}>Opening image · Full content width</F.Text>
      </F.View>
    </Figure>}>
    <Paragraph id="specimen-opening">{paragraph}</Paragraph>
    {!sparse && <>
      <FeatureQuote id="specimen-quote">A display quote creates a pause within the reading column.</FeatureQuote>
      {Array.from({ length: count }, (_, index) => <Paragraph key={index} id={`specimen-body-${index + 1}`}>{paragraph}</Paragraph>)}
      <Section id="specimen-section" title="A change of pace" lead="A short section opening stays with its heading. This text demonstrates placement, not a required outline.">
        <Paragraph id="specimen-closing">{paragraph}</Paragraph>
      </Section>
      <Heading id="specimen-reference-heading" style={{ fontSize: 11, marginTop: 24 }}>References</Heading>
      <Paragraph id="specimen-reference" style={{ fontSize: 9, color: theme.muted }}>Reference placement specimen. Real references appear here only when cited; no source is being claimed.</Paragraph>
    </>}
  </MagazineFeature>;
}
export default Specimen;
