import * as F from '@formepdf/react';
import { DataTable, Figure, Heading, Paragraph, Section } from 'opendoc';
import { neutral } from '../../themes';
import { type DocTheme } from 'opendoc/themes';
import { ConsultingReport } from './index';

export const meta = { title: 'Consulting report', description: 'A Neutral formatting specimen with illustrative placeholders only.', kind: 'report' as const, theme: 'neutral' };
const paragraph = 'This paragraph demonstrates the reading measure and spacing of the report. Its content is illustrative: it describes no client, market, or finding. In an authored document, the material would determine the section order and the evidence needed. The layout gives prose, headings, and exhibits a shared alignment while leaving room to adapt their size and emphasis.';

export function Specimen({ length = 'typical', theme = neutral }: { length?: 'sparse' | 'typical' | 'long'; theme?: DocTheme } = {}) {
  const sparse = length === 'sparse';
  return <ConsultingReport title={meta.title} theme={theme} cover={!sparse}
    subtitle={sparse ? undefined : 'A clear structure for reading, comparing evidence, and finding the next passage.'}
    author={sparse ? undefined : 'Author or team name'} date={sparse ? undefined : 'Month / Year'}
    coverNote={sparse ? undefined : 'Illustrative formatting specimen. All prose, exhibit areas, and table entries are placeholders; no business findings are claimed.'}>
    <Section id="specimen-opening" title="A clear section opening" lead="A short opening sits with the heading. This is a placement example, not a prescribed report section.">
      <Paragraph id="specimen-first-paragraph">{paragraph}</Paragraph>
    </Section>
    {!sparse && <>
      {Array.from({ length: length === 'long' ? 9 : 1 }, (_, index) => <Paragraph key={index} id={`specimen-body-${index + 1}`}>{paragraph}</Paragraph>)}
      <Section id="specimen-exhibit" title="Give the exhibit a useful headline" lead="This heading introduces an illustrative visual area. In a real report, its wording should reflect the evidence presented.">
        <Figure id="specimen-figure" caption="Exhibit position. Labels, units, and legends belong inside the visual where they can be read." sourceNote="Source note position. Placeholder only; no source is claimed.">
          <F.View style={{ height: 155, backgroundColor: theme.paper, borderWidth: 0.6, borderColor: theme.line, justifyContent: 'center', alignItems: 'center' }}>
            <F.Text style={{ fontSize: 10, color: theme.muted }}>Full-width exhibit · Illustrative placeholder</F.Text>
          </F.View>
        </Figure>
      </Section>
      <Section id="specimen-comparison" style={{ breakBefore: true }} title="Make comparisons easy to follow" lead="Tables share the reading width. The example below uses synthetic labels and repeats its header if it continues.">
        <DataTable id="specimen-table" caption="Illustrative comparison rows" columns={[{ label: 'Item', width: 1 }, { label: 'Description', width: 2 }, { label: 'Note', width: 1.4 }]}
          rows={Array.from({ length: length === 'long' ? 30 : 5 }, (_, index) => [`Example ${index + 1}`, 'Placeholder entry for layout review', 'Illustrative only'])}
          sourceNote="Synthetic table for formatting review. No measured or client data." />
      </Section>
      <Paragraph id="specimen-closing">The report continues in the author's chosen order. This closing placeholder checks that text after a table remains available and readable.</Paragraph>
      <Heading id="specimen-reference-heading" style={{ fontSize: 14, marginTop: 26 }}>References</Heading>
      <Paragraph id="specimen-reference" style={{ fontSize: 9, color: theme.muted }}>Reference placement specimen. Real references appear here only when cited; no source is being claimed.</Paragraph>
    </>}
  </ConsultingReport>;
}
export default Specimen;
