import * as F from '@formepdf/react';
import { DataTable, Document, Heading, Paragraph, Strong } from 'opendoc';
import { DirectivePage, EvidenceChain, ManualAnnotation, ManualCode, ManualOpening, ManualPages, ManualSpine, SpecRows } from './components';
import { colors, theme } from './index';

export const meta = { title: 'Field Manual — Evidence before ornament', description: theme.description, theme: theme.id };

function Identity() {
  const neutrals = [
    { name: 'Ink', value: colors.ink }, { name: 'Stock', value: colors.stock },
    { name: 'Paper', value: colors.paper }, { name: 'Panel', value: colors.panel },
    { name: 'Muted', value: colors.muted }, { name: 'Rule', value: colors.rule },
  ];
  return <ManualPages title="Field Manual / Design specification" code="FM—01" revision="REV 01">
    <ManualSpine id="manual-identity-spine">
      <ManualCode id="manual-identity-code" code="FM—01" label="Evidence systems" />
      <F.View style={{ flexDirection: 'row', gap: 16, marginTop: 28 }}>
        <F.View style={{ width: 312 }}>
          <Heading id="manual-identity-title" level={1} style={{ fontSize: 52, lineHeight: 0.98, letterSpacing: -1.2, marginBottom: 20 }}>{'Field\nManual.'}</Heading>
          <Paragraph id="manual-identity-purpose" style={{ fontSize: 22, lineHeight: 1.15, marginBottom: 16 }}>{'Evidence before\nornament.'}</Paragraph>
          <Paragraph id="manual-identity-description" style={{ fontSize: 11, color: colors.muted, marginBottom: 0, width: 270 }}>A visual language for methods, decisions, and operational truth.</Paragraph>
        </F.View>
        <F.View style={{ flex: 1, minWidth: 0, backgroundColor: colors.paper, borderWidth: 0.75, borderColor: colors.rule, padding: 12 }}>
          <F.Text style={{ fontFamily: 'OpenDoc Mono', fontSize: 36, lineHeight: 1, letterSpacing: -1, color: colors.orange, marginBottom: 24 }}>{'FM\n01'}</F.Text>
          <SpecRows id="manual-identity-record" rows={[{ label: 'Class', value: 'Reference' }, { label: 'Mode', value: 'Evidence first' }, { label: 'Rev', value: '01' }]} />
        </F.View>
      </F.View>
    </ManualSpine>
    <F.View style={{ marginTop: 32, marginBottom: 16 }}><ManualCode id="manual-palette-label" code="CLR" label="Signal / support" /></F.View>
    <F.View style={{ flexDirection: 'row', gap: 16 }}>
      <F.View style={{ width: 148, backgroundColor: colors.orange, padding: 16, justifyContent: 'space-between' }}>
        <F.Text style={{ fontFamily: 'OpenDoc Mono', fontSize: 8, color: colors.ink }}>{'SAFETY\nORANGE'}</F.Text>
        <F.Text style={{ fontFamily: 'OpenDoc Mono', fontSize: 14, color: colors.ink }}>#F05A28</F.Text>
      </F.View>
      <F.View style={{ flex: 1 }}>
        {[neutrals.slice(0, 2), neutrals.slice(2, 4), neutrals.slice(4)].map((row, index) => <F.View key={index} style={{ flexDirection: 'row', gap: 12, marginBottom: index === 2 ? 0 : 12 }}>
          {row.map(entry => <F.View key={entry.name} style={{ flex: 1, flexDirection: 'row', gap: 8 }}>
            <F.View style={{ width: 24, height: 24, borderWidth: 0.5, borderColor: colors.rule, backgroundColor: entry.value }} />
            <F.View style={{ flex: 1 }}><F.Text style={{ fontSize: 8, color: colors.ink }}>{entry.name}</F.Text><F.Text style={{ fontFamily: 'OpenDoc Mono', fontSize: 8, color: colors.muted, marginTop: 3 }}>{entry.value}</F.Text></F.View>
          </F.View>)}
        </F.View>)}
      </F.View>
    </F.View>
    <ManualAnnotation id="manual-geometry" code="6 / 18 / 4">A <Strong>6 pt orange spine</Strong>, an 18 pt inset, and a 4 pt baseline. Fine rules separate records. Monospace codes make identity, status, and revision visible.</ManualAnnotation>
    <Paragraph id="manual-type-note" style={{ fontFamily: 'OpenDoc Mono', fontSize: 7.5, color: colors.muted }}>{'DISPLAY 52/51 · HEADING 38/39 · BODY 10.5/15.75 · NOTES 8/11.2\nDARK #171A1C · INVERSE #F6F3EA · INVERSE NOTES #AEB4B5'}</Paragraph>
  </ManualPages>;
}

function Decision() {
  return <ManualPages title="Field Manual / Decision anatomy" code="FM—02" revision="REV 01">
    <ManualOpening id="manual-decision-opening" code="FM—02" label="Decision anatomy" title={'A decision should\nexpose its chain.'} />
    <EvidenceChain id="manual-decision-chain" steps={[
      { title: 'Source', detail: 'Name the observation, record, or constraint.' },
      { title: 'Reason', detail: 'Show the rule, transformation, or judgment.' },
      { title: 'Act', detail: 'State the result, owner, and next condition.' },
    ]} />
    <Paragraph id="manual-decision-intro">The chain separates what was observed from how it was interpreted and what happens next. Each step is inspectable. Orange identifies the active reasoning step; it does not turn every box into a warning.</Paragraph>
    <DataTable id="manual-decision-record" caption="Sample handover record — illustrative only."
      columns={[{ label: 'Record', width: 1 }, { label: 'Observation', width: 2 }, { label: 'Next condition', width: 1.8 }]}
      rows={[
        ['SRC / 01', 'Three draft sections use different terms.', 'Identify the owning definition.'],
        ['MTH / 01', 'Compare each use with that definition.', 'Record the unresolved cases.'],
        ['ACT / 01', 'Assign one editor to the revision.', 'Check the next issue before release.'],
      ]} />
    <ManualAnnotation id="manual-decision-note" code="NOTE / 01">This example contains no operational findings. It demonstrates the difference between a source record, a method, and an action.</ManualAnnotation>
  </ManualPages>;
}

export default function Preview() {
  return <Document title={meta.title} theme={theme}>
    <Identity />
    <Decision />
    <DirectivePage id="manual-directive" code="FM—03" revision="REV 01" title={'Document\nwhat changes.'}
      lead="A trustworthy system makes revisions, evidence, and responsibility inspectable. Every change should leave a clear path back to its reason."
      rows={[
        { label: 'Change', value: 'State what changed in this issue.' },
        { label: 'Basis', value: 'Name the record or condition that required it.' },
        { label: 'Owner', value: 'Identify who carries the next action.' },
        { label: 'Check', value: 'Define what must be true before release.' },
      ]} />
  </Document>;
}
