import * as F from '@formepdf/react';
import { DataTable, Figure, Paragraph } from 'opendoc';
import { neutral } from '../../themes';
import { type DocTheme } from 'opendoc/themes';
import { BriefHeading, ExecutiveBrief } from './index';

export const meta = { title: 'Executive brief', description: 'A Neutral brief specimen with illustrative placeholders only.', kind: 'report' as const, theme: 'neutral' };
const paragraph = 'This is placeholder prose for the brief. It demonstrates a compact reading rhythm and the relationship between a section heading, supporting detail, and a small exhibit. In an authored document, the reader’s needs and the available evidence determine what belongs here. No business result or recommendation is being claimed.';

export function Specimen({ length = 'typical', theme = neutral }: { length?: 'sparse' | 'typical' | 'long'; theme?: DocTheme } = {}) {
  const sparse = length === 'sparse';
  return <ExecutiveBrief title={meta.title} theme={theme}
    author={sparse ? undefined : 'Author or team'} date={sparse ? undefined : 'Date placeholder'}
    takeaway={sparse ? undefined : 'A short opening takeaway receives emphasis while the supporting detail remains easy to scan. This is a layout specimen, not a finding.'}>
    <Paragraph id="specimen-opening">{paragraph}</Paragraph>
    {!sparse && <>
      <F.View wrap={false}>
        <BriefHeading id="specimen-detail-heading">A compact section</BriefHeading>
        <Paragraph id="specimen-detail-lead">A short lead stays with its heading. Section names and order belong to the writer; this specimen does not prescribe a briefing method.</Paragraph>
      </F.View>
      {length === 'long' && Array.from({ length: 9 }, (_, index) => <Paragraph key={index} id={`specimen-detail-${index + 1}`}>{paragraph}</Paragraph>)}
      <DataTable id="specimen-table" caption="Synthetic values for layout review"
        columns={[{ label: 'Item', width: 2 }, { label: 'Value (a.u.)', width: 1, align: 'right' }, { label: 'Status', width: 2 }]}
        rows={Array.from({ length: length === 'long' ? 24 : 3 }, (_, index) => [`Example ${index + 1}`, 10 + index, 'Illustrative only'])}
        sourceNote="All values are synthetic. a.u. means arbitrary units; no measured outcome is claimed." />
      {length === 'long' && <Figure id="specimen-figure" caption="A small exhibit can follow the narrative in normal flow." sourceNote="Illustrative placeholder only; no data or source is claimed.">
        <F.View style={{ height: 95, backgroundColor: theme.paper, borderWidth: 0.6, borderColor: theme.line, justifyContent: 'center', alignItems: 'center' }}><F.Text style={{ fontSize: 10, color: theme.muted }}>Figure area · Illustrative placeholder</F.Text></F.View>
      </Figure>}
      <F.View wrap={false}>
        <BriefHeading id="specimen-closing-heading">A closing section</BriefHeading>
        <Paragraph id="specimen-closing">This final passage shows the spacing after an exhibit. The actual brief may end here or continue with further material. Its length follows the content, without shrinking type to meet a page count.</Paragraph>
      </F.View>
      <Paragraph id="specimen-reference-note" style={{ fontSize: 9, color: theme.muted, marginTop: 10 }}>Reference placement specimen. Verified references appear after the body when cited; no source is being claimed here.</Paragraph>
    </>}
  </ExecutiveBrief>;
}
export default Specimen;
