import * as F from '@formepdf/react';
import { DataTable, Figure, Paragraph } from 'opendoc';
import { neutral } from '../../themes';
import { type DocTheme } from 'opendoc/themes';
import { PaperHeading, ScientificPaper } from './index';

export const meta = { title: 'Scientific paper', description: 'A Neutral manuscript specimen with illustrative placeholders only.', kind: 'research' as const, theme: 'neutral' };
const paragraph = 'This is placeholder text for the manuscript. It demonstrates the length of a line, the space between paragraphs, and the relationship between headings and continuous prose. No study was conducted and no findings are reported. In an authored paper, the research question, methods, and evidence would determine the organization and the level of detail needed by the reader.';

export function Specimen({ length = 'typical', theme = neutral }: { length?: 'sparse' | 'typical' | 'long'; theme?: DocTheme } = {}) {
  const sparse = length === 'sparse';
  return <ScientificPaper title={meta.title} theme={theme}
    authors={sparse ? undefined : 'Author name · Coauthor name'}
    affiliations={sparse ? undefined : 'Department and institution · Affiliation placeholder'}
    correspondence={sparse ? undefined : 'Correspondence details, when needed'}
    abstract={sparse ? undefined : 'This abstract is a layout specimen. It shows a compact summary set apart from the main reading column. The text describes no real research, data, or conclusions. Its length and structure can be adapted to the paper and any applicable publisher instructions.'}
    keywords={sparse ? undefined : 'manuscript; formatting; illustrative specimen'}>
    <F.View wrap={false}>
      <PaperHeading id="specimen-opening-heading">A manuscript section</PaperHeading>
      <Paragraph id="specimen-opening-lead">A short opening stays with its heading. Section names and their order belong to the writer.</Paragraph>
    </F.View>
    <Paragraph id="specimen-opening">{paragraph}</Paragraph>
    {!sparse && <>
      {Array.from({ length: length === 'long' ? 12 : 1 }, (_, index) => <Paragraph key={index} id={`specimen-body-${index + 1}`}>{paragraph}</Paragraph>)}
      <Figure id="specimen-figure" caption="Illustrative figure position. Captions identify the visual; labels and units belong where they can be read." sourceNote="Placeholder only. No measured data or source is claimed.">
        <F.View style={{ height: 135, backgroundColor: theme.paper, borderWidth: 0.6, borderColor: theme.line, justifyContent: 'center', alignItems: 'center' }}>
          <F.Text style={{ fontSize: 10, color: theme.muted }}>Figure area · Illustrative placeholder</F.Text>
        </F.View>
      </Figure>
      <F.View wrap={false}>
        <PaperHeading id="specimen-subheading" level={3}>A subordinate heading</PaperHeading>
        <Paragraph id="specimen-detail">The smaller heading marks a change within the passage. This text demonstrates hierarchy without prescribing a research outline.</Paragraph>
      </F.View>
      <DataTable id="specimen-table" caption="Synthetic values for layout review" columns={[{ label: 'Sample', width: 1.5 }, { label: 'Value (a.u.)', width: 1, align: 'right' }, { label: 'Status', width: 1.4 }]}
        rows={Array.from({ length: length === 'long' ? 25 : 4 }, (_, index) => [`Example ${index + 1}`, 10 + index, 'Illustrative only'])}
        sourceNote="All values are synthetic; a.u. means arbitrary units. No research finding is claimed." />
      <Paragraph id="specimen-closing">This closing passage follows the table in normal flow. The manuscript can continue with any sections the material requires.</Paragraph>
      <PaperHeading id="specimen-reference-heading">References</PaperHeading>
      <Paragraph id="specimen-reference" style={{ fontSize: 9.5, color: theme.muted }}>Reference placement specimen. Real references appear here only when cited; no source is being claimed.</Paragraph>
    </>}
  </ScientificPaper>;
}
export default Specimen;
