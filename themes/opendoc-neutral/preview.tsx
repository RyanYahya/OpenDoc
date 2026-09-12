import { Document, Paragraph, Heading, DataTable, Strong, View } from 'opendoc';
import { theme, colors } from './index';
import { NeutralPages, NeutralOpening, NeutralColumns, NeutralQuote, PaperStudy } from './components';

export const meta = { title: 'OpenDoc Neutral', description: 'A three-page house-style specimen: typographic identity, a working report, and a charcoal closing.', theme: theme.id };
export default function Specimen() {
  return <Document title={meta.title} theme={theme}>
    <NeutralPages title="The house style" header={false}>
      <Paragraph id="specimen-wordmark" style={{ fontSize: 18, fontWeight: 600, letterSpacing: -0.5, marginBottom: 72 }}>OpenDoc</Paragraph>
      <NeutralOpening id="specimen-opening" eyebrow="A HOUSE STYLE / 01" title={'Clarity has\ncharacter.'} subtitle="OpenDoc Neutral brings a considered visual language to everyday work." display />
      <Paragraph id="specimen-intent" style={{ width: 365, marginTop: 8, marginBottom: 42 }}>Warm paper. Confident typography. A precise blue signal. A flexible grid that gives words, images, and evidence room to do their work.</Paragraph>
      <PaperStudy id="specimen-paper-study" />
      <Paragraph id="specimen-caption" role="small" style={{ marginTop: 18 }}>One visual language, from a short working note to a substantial publication.</Paragraph>
    </NeutralPages>
    <NeutralPages title="Applied / a working report" surface="white">
      <NeutralOpening id="specimen-report" eyebrow="A WORKING REPORT / 02" title="Make the decision easy to find." subtitle="A fictional studio review shows the system at reading scale." />
      <NeutralColumns left={<>
        <Heading id="specimen-principle" level={2} style={{ marginTop: 0 }}>Start with the reader</Heading>
        <Paragraph id="specimen-reading">A useful report gives the reader a clear reason to continue. Put the decision near the beginning, develop the evidence, and keep qualifications close to the claim they affect.</Paragraph>
        <Paragraph id="specimen-long-reading">This column is ordinary selectable text. It can be revised without redrawing the page, and longer sections can continue naturally. The grid supplies structure while the content determines how much space is needed.</Paragraph>
      </>} right={<>
        <Heading id="specimen-evidence" level={2} style={{ marginTop: 0 }}>Keep the basis visible</Heading>
        <Paragraph id="specimen-evidence-copy">Every number below is <Strong>illustrative</Strong>. A restrained header, aligned values, and a nearby source note make the comparison easy to inspect.</Paragraph>
        <Paragraph id="specimen-review-copy">Use fine rules instead of a dense cage. Keep labels short and units explicit. Preserve the data and record identities when an agent prepares the next edition.</Paragraph>
      </>} />
      <DataTable id="specimen-table" caption="Illustrative studio allocation" columns={[{ label: 'Workstream', width: 2 }, { label: 'Hours', align: 'right' }, { label: 'Share', align: 'right' }]} rows={[["Research", 24, '20%'], ["Drafting", 48, '40%'], ["Design", 30, '25%'], ["Review", 18, '15%']]} rowIds={['research', 'drafting', 'design', 'review']} sourceNote="Synthetic specimen values, totaling 120 hours. No work was measured." />
      <NeutralQuote id="specimen-quote" attribution="OpenDoc / house principle">Give the page a clear purpose, then give it room.</NeutralQuote>
    </NeutralPages>
    <NeutralPages title="A change of pace" surface="dark">
      <NeutralOpening id="specimen-dark" eyebrow="THE INVERSE SURFACE / 03" title={'Quiet pages.\nStrong ideas.'} subtitle="Charcoal creates a deliberate pause for an opening, a large image, or a final thought." surface="dark" display />
      <NeutralQuote id="specimen-dark-quote" attribution="Original OpenDoc house copy" surface="dark">The craft is in what the reader can see, understand, and use.</NeutralQuote>
      <View style={{ marginTop: 32 }}><NeutralColumns left={<>
        <Paragraph id="specimen-dark-grid" role="label" style={{ color: colors.inverseMuted }}>GRID</Paragraph>
        <Paragraph id="specimen-dark-grid-copy" style={{ color: colors.inverse }}>A4 portrait. 48 pt side margins. 24 pt gutters. Equal columns or a one-to-two split.</Paragraph>
      </>} right={<>
        <Paragraph id="specimen-dark-type" role="label" style={{ color: colors.inverseMuted }}>VOICE</Paragraph>
        <Paragraph id="specimen-dark-type-copy" style={{ color: colors.inverse }}>Sans for clarity, serif italic for reflection, monospace for labels. Real local faces, embedded in the PDF.</Paragraph>
      </>} /></View>
      <View style={{ marginTop: 36, flexDirection: 'row', gap: 12 }}>{[colors.paper, colors.stone, colors.muted, colors.blue].map(color => <View key={color} style={{ height: 42, flex: 1, backgroundColor: color }} />)}</View>
      <Paragraph id="specimen-dark-end" role="small" style={{ marginTop: 18, color: colors.inverseMuted }}>The guide and reusable source components live with the theme. The finished welcome document shows the same system with real media and shared assets.</Paragraph>
    </NeutralPages>
  </Document>;
}
