import * as F from '@formepdf/react';
import { Paragraph, Figure, Heading } from 'opendoc';
import { neutral } from '../../themes';
import { type DocTheme } from 'opendoc/themes';
import { EditorialEssay } from './index';

export const meta = { title: 'Editorial essay', description: 'A neutral layout specimen with placeholder content.', kind: 'article' as const, theme: 'neutral' };
const paragraph = 'This is placeholder text for the reading column. Its purpose is to make the page’s proportions visible: the length of a line, the space between paragraphs, and the quiet area around the text. The words carry no argument and describe no findings. In a finished essay, the author’s own material occupies this space and continues naturally from one page to the next.';

export function Specimen({ length = 'typical', theme = neutral }: { length?: 'sparse' | 'typical' | 'long'; theme?: DocTheme } = {}) {
  const count = length === 'sparse' ? 1 : length === 'long' ? 28 : 5;
  return <EditorialEssay title={meta.title} theme={theme} author="Author name · Layout specimen" standfirst="A standfirst sits between the title and the essay: a larger, quieter passage with space to breathe before the reading column begins.">
    {Array.from({ length: count }, (_, index) => <Paragraph key={index} id={`specimen-paragraph-${index + 1}`}>{paragraph}</Paragraph>)}
    {length !== 'sparse' && <>
      <Figure id="specimen-visual" caption="An optional visual spans the reading column. Placeholder only.">
        <F.View style={{ height: 130, backgroundColor: neutral.paper, borderWidth: 0.6, borderColor: neutral.line, justifyContent: 'center', alignItems: 'center' }}>
          <F.Text style={{ fontSize: 10, color: neutral.muted }}>Full-width visual</F.Text>
        </F.View>
      </Figure>
      <Paragraph id="specimen-closing">{paragraph}</Paragraph>
      <Heading id="specimen-reference-heading" style={{ fontSize: 11, marginTop: 24 }}>References</Heading>
      <Paragraph id="specimen-reference" style={{ fontSize: 9.5, color: neutral.muted }}>Reference placement specimen. Real references appear here only when cited; no source is being claimed.</Paragraph>
    </>}
  </EditorialEssay>;
}
export default Specimen;
