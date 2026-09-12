import * as F from '@formepdf/react';
import { Callout, DataTable, Document, Figure, Heading, Paragraph, Section, Strong } from 'opendoc';
import { CivicBadge, CivicOpening, CivicPages, CivicSplit, SignalBlock, SpectrumLegend, SpectrumRail, SquareSignal } from './components';
import { colors, theme } from './index';

export const meta = { title: 'Civic Spectrum — Systems people can read', description: theme.description, theme: theme.id };

function Identity() {
  return <CivicPages title="Civic Spectrum / Design system" section="CS—01" footer="Civic Spectrum · Identity" rail>
    <SquareSignal id="civic-identity-label" label="A civic language for print" />
    <F.View style={{ marginTop: 28, marginBottom: 32 }}>
      <CivicSplit id="civic-identity-split"
        main={<><Heading id="civic-identity-title" level={1} style={{ fontSize: 54, lineHeight: 0.98, letterSpacing: -1.25, marginBottom: 20 }}>{'Civic\nSpectrum'}</Heading><Paragraph id="civic-identity-line" style={{ fontSize: 22, lineHeight: 1.15, width: 270 }}>Systems people can read.</Paragraph></>}
        aside={<F.View style={{ paddingTop: 12 }}><CivicBadge id="civic-identity-badge" value="01" label="One system. Many public voices." /></F.View>} />
    </F.View>
    <F.View style={{ marginBottom: 24 }}><SquareSignal id="civic-palette-label" label="Six signals / precise roles" color={colors.leaf} /></F.View>
    <SpectrumLegend id="civic-palette" />
    <Paragraph id="civic-neutral-palette" style={{ fontFamily: 'OpenDoc Mono', fontSize: 8, color: colors.muted, marginBottom: 32 }}>{`STOCK ${colors.stock} · INK ${colors.ink} · RULE ${colors.rule}`}</Paragraph>
    <CivicSplit id="civic-geometry-split"
      main={<><Heading id="civic-geometry-title" level={2} style={{ marginTop: 0 }}>An unequal rhythm.</Heading><Paragraph id="civic-geometry-copy">The rail has six unequal lengths: <Strong>2 : 1 : 3 : 1.5 : 2 : 1</Strong>. A six-column print grid makes room for a wide reading field and a smaller supporting voice.</Paragraph><SpectrumRail height={8} /></>}
      aside={<F.View style={{ borderTopWidth: 0.75, borderColor: colors.ink, paddingTop: 12 }}><F.Text style={{ fontSize: 32, fontWeight: 600, lineHeight: 1, color: colors.blue }}>6 / 12 / 4</F.Text><F.Text style={{ fontSize: 9, lineHeight: 1.45, marginTop: 12, color: colors.muted }}>{'Columns / gutter / baseline\nA4 · 48 pt margins\nSquare corners throughout'}</F.Text></F.View>} />
  </CivicPages>;
}

function Reading() {
  return <CivicPages title="Civic Spectrum / Applied reading" section="CS—02" footer="Illustrative community brief">
    <CivicSplit id="civic-reading-layout"
      main={<>
        <CivicOpening id="civic-reading-opening" kicker="Community brief / Sample" title={'A place\nto gather.'} subtitle="Public information can be direct, generous, and warm." color={colors.leaf} />
        <Paragraph id="civic-reading-intro">Imagine a neighborhood hall opening its doors for a shared workshop. A useful notice tells people where they belong, what they can do, and how to take the next step.</Paragraph>
        <Section id="civic-reading-orient" title="Start with the person." lead="Give readers a clear entry point. Name the place and purpose before explaining the program.">
          <Paragraph id="civic-reading-body">A strong hierarchy lets someone scan the essentials and then stay for the detail. The wide column carries the story. The narrower field carries a small set of signs: orientation, explanation, action.</Paragraph>
        </Section>
        <Section id="civic-reading-space" title="Leave useful space." lead="Empty space can separate different voices without drawing another box around them.">
          <Paragraph id="civic-reading-space-copy">This composition keeps the main passage on four columns. Short supporting modules occupy two. Their top edges, square markers, and repeated spacing make the page feel like one system.</Paragraph>
        </Section>
      </>}
      aside={<F.View style={{ paddingTop: 52 }}>
        <SignalBlock id="civic-orient" code="01" title="Orient" color={colors.blue}>Establish the place, sequence, and purpose.</SignalBlock>
        <SignalBlock id="civic-explain" code="02" title="Explain" color={colors.sun}>Give each part a clear role and a readable label.</SignalBlock>
        <SignalBlock id="civic-move" code="03" title="Move" color={colors.flame}>Make the next action easy to find.</SignalBlock>
        <F.View style={{ marginTop: 20 }}><CivicBadge id="civic-reading-badge" value="Aa" color={colors.sun} filled label="OpenDoc Sans · clear grotesk reading and display type" /></F.View>
      </F.View>} />
  </CivicPages>;
}

function Evidence() {
  return <CivicPages title="Civic Spectrum / Applied evidence" section="CS—03" footer="Illustrative space allocation">
    <CivicOpening id="civic-evidence-opening" kicker="Example allocation / Synthetic" title="Make the whole visible." subtitle="A simple partition shows how one shared room could be used." />
    <Figure id="civic-allocation" caption="A notional 120 m² room, divided by activity." sourceNote="Illustrative dimensions only. This is a design demonstration, not a measured plan.">
      <F.View style={{ flexDirection: 'row', gap: 4, height: 156 }}>
        <F.View style={{ flex: 2, backgroundColor: colors.blue, padding: 12, justifyContent: 'space-between' }}><F.Text style={{ fontSize: 10, color: colors.inverse }}>Arrival</F.Text><F.Text style={{ fontSize: 25, lineHeight: 1, fontWeight: 600, color: colors.inverse }}>24</F.Text></F.View>
        <F.View style={{ flex: 5, backgroundColor: colors.leaf, padding: 16, justifyContent: 'space-between' }}><F.Text style={{ fontSize: 12, color: colors.ink, fontWeight: 600 }}>Workshop</F.Text><F.Text style={{ fontSize: 54, lineHeight: 1, fontWeight: 600, letterSpacing: -1, color: colors.ink }}>60</F.Text></F.View>
        <F.View style={{ flex: 3, backgroundColor: colors.sky, padding: 12, justifyContent: 'space-between' }}><F.Text style={{ fontSize: 10, color: colors.ink }}>Shared tables</F.Text><F.Text style={{ fontSize: 34, lineHeight: 1, fontWeight: 600, color: colors.ink }}>36</F.Text></F.View>
      </F.View>
    </Figure>
    <DataTable id="civic-allocation-table" caption="The allocation in exact values."
      columns={[{ label: 'Activity', width: 2 }, { label: 'Area (m²)' }, { label: 'Share' }]}
      rows={[['Arrival', 24, '20%'], ['Workshop', 60, '50%'], ['Shared tables', 36, '30%']]} />
    <Callout id="civic-allocation-note" title="Color carries the category.">Blue marks arrival, leaf marks participation, and sky supports shared activity. The yellow note asks for attention; it does not become a fourth data category.</Callout>
  </CivicPages>;
}

export default function Preview() {
  return <Document title={meta.title} theme={theme}><Identity /><Reading /><Evidence /></Document>;
}
