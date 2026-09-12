import { Document, Pages, Heading, Paragraph, DataTable, Text, View } from 'opendoc';
import { theme, colors as c } from './index';
import { ConsultingCover, ExhibitTitle, RankedBars, Implication, SourceNote } from './components';

export const meta = { title: 'McKinsey Consulting — Make the answer visible', description: theme.description, theme: theme.id };

export default function Preview() {
  return <Document title={meta.title} theme={theme}>
    <ConsultingCover id="consulting-identity" title={'Make the\nanswer visible.'} subtitle="A disciplined system for conclusions, comparisons and decisions." />
    <Pages title="McKinsey Consulting / The system" footer="Design grammar / Independent adaptation">
      <ExhibitTitle id="consulting-system" number="01" topic="Visual grammar" metric="A4 portrait / all dimensions in points / embedded local typography">Structure stays quiet. The answer carries the color.</ExhibitTitle>
      <View style={{ flexDirection: 'row', gap: 20 }}>
        <View style={{ width: 198 }}>
          <Heading id="consulting-palette-title" level={3} style={{ marginTop: 0 }}>A semantic palette</Heading>
          {theme.palette!.map(color => <View key={color.name} style={{ flexDirection: 'row', gap: 8, alignItems: 'center', marginBottom: 6 }}>
            <View style={{ width: 22, height: 22, backgroundColor: color.value, borderWidth: color.value === c.white ? 0.5 : 0, borderColor: c.rule }} />
            <View><Text style={{ fontSize: 8.5, fontWeight: 600 }}>{color.name}</Text><Text style={{ fontSize: 7.5, fontFamily: 'OpenDoc Mono', color: c.muted }}>{color.value}</Text></View>
          </View>)}
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 48, fontWeight: 600, lineHeight: 1.05, letterSpacing: -1, marginBottom: 8 }}>Aa 82%</Text>
          <Paragraph id="consulting-type" style={{ fontSize: 9 }}>OpenDoc Sans is the embedded substitute. The original McKinsey Sans is proprietary; no brand font or logo is redistributed.</Paragraph>
          <DataTable id="consulting-type-scale" columns={[{ label: 'Role', width: 1.7 }, { label: 'pt / leading', width: 1 }]} rows={[
            ['Cover', '62 / 1.01'], ['Conclusion', '31 / 1.10'], ['Section', '19 / 1.15'], ['Body', '10.5 / 1.42'], ['Source', '8 / 1.35'],
          ]} />
          <Heading id="consulting-geometry-title" level={3}>Geometry is analytical</Heading>
          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-end', marginBottom: 12 }}>
            <View style={{ width: 40, height: 40, backgroundColor: c.ink }} /><View style={{ width: 64, height: 24, backgroundColor: c.focus }} /><View style={{ width: 84, height: 8, backgroundColor: c.pale }} />
          </View>
          <Paragraph id="consulting-geometry" style={{ fontSize: 9 }}>Square corners. A 4 pt spacing unit. A 12-column construction with 12 pt gutters inside 48 pt page margins. Fine 0.5 pt rules separate comparisons.</Paragraph>
          <Paragraph id="consulting-composition" style={{ fontSize: 9 }}>Give the evidence most of the page. Use one assertive title, define the metric, directly label the marks, then state the implication and source.</Paragraph>
        </View>
      </View>
      <SourceNote id="consulting-basis">An independent OpenDoc interpretation of analytical publication conventions, without affiliation. Detailed palette roles and component guidance are in this theme’s design guide.</SourceNote>
    </Pages>
    <Pages title="McKinsey Consulting / Applied exhibit" footer="Illustrative analysis / No empirical claim">
      <ExhibitTitle id="consulting-applied" number="02" topic="Value pool" metric="Share of identified opportunity by lever, % of total / illustrative scenario">Three levers account for 82% of the opportunity.</ExhibitTitle>
      <RankedBars id="consulting-bars" max={40} rows={[
        { label: 'Simplify intake', detail: 'Reduce repeated entry', value: 32 },
        { label: 'Balance capacity', detail: 'Match effort to demand', value: 28 },
        { label: 'Shorten handoffs', detail: 'Clarify the next owner', value: 22 },
        { label: 'Improve routing', detail: 'Reduce avoidable loops', value: 11 },
        { label: 'Other changes', detail: 'Remaining opportunity', value: 7 },
      ]} />
      <View wrap={false} style={{ flexDirection: 'row', gap: 16, alignItems: 'center', marginTop: 4, marginBottom: 12 }}>
        <Text style={{ width: 124, fontSize: 48, fontWeight: 600, color: c.focus, lineHeight: 1 }}>82%</Text>
        <Text style={{ flex: 1, fontSize: 12, lineHeight: 1.35 }}>The first three levers contain most of the modeled value. Start there, then test whether the assumptions hold.</Text>
      </View>
      <Implication id="consulting-next">Prioritize validation of the three largest levers before funding a wider transformation. An attractive estimate becomes a decision only after its assumptions survive scrutiny.</Implication>
      <SourceNote id="consulting-source">Source: synthetic example created to demonstrate this theme. Values total 100%; the first three sum to 82%. Bars share a zero baseline and a 40% maximum. These figures describe no organization.</SourceNote>
    </Pages>
  </Document>;
}
