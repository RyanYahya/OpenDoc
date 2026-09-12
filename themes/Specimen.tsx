import {
  Callout, Cite, CrossReference, DataTable, Document, Em, Figure, Heading, List,
  PageBreak, Pages, Paragraph, References, Section, Strong, Text, TitleBlock, View,
  type DocTheme,
} from 'opendoc';

/** One shared proof: themes and authored documents use the same PDF primitives. */
export function ThemeSpecimen({ theme }: { theme: DocTheme }) {
  return <Document title={`${theme.name} — A page with purpose`} theme={theme}
    references={{ design: { title: `${theme.name} design guide — themes/${theme.id}/design.md`, author: 'OpenDoc' } }}>
    <Pages title={`${theme.name} / Design specimen`} footer={`${theme.name} / Illustrative specimen`}>
      <TitleBlock id="specimen-opening" eyebrow="A page with purpose" title={theme.name}
        subtitle={theme.description} byline="Typography, composition, and the details that hold a document together." />
      <Section id="specimen-reading" title="Make room for the thought"
        lead="A page begins with a relationship: a heading invites us in, a paragraph gives us a place to settle, and the space around both sets the pace.">
        <Paragraph id="specimen-prose">Good document design makes different kinds of information easy to recognize. A title can be confident without crowding the opening. Body text can be comfortable without losing momentum. A <Strong>short phrase</Strong> can carry the central thought; <Em>an italic aside</Em> can change the voice. Here, the same words appear in every theme so the differences in hierarchy, rhythm, and emphasis are visible.</Paragraph>
      </Section>
      <Heading id="specimen-details" level={3}>The small decisions matter</Heading>
      <List id="specimen-principles" items={[
        { id: 'alignment', children: 'Shared edges connect the different elements of a page.' },
        { id: 'rhythm', children: 'A consistent rhythm holds related passages together.' },
        { id: 'contrast', children: 'Contrast gives the reader a clear place to begin.' },
      ]} />
      <Callout id="specimen-aside" title="One useful interruption">
        An aside should earn its place. Use this treatment for a decision, a qualification, or a detail the reader needs to notice before continuing.
      </Callout>
      <PageBreak />
      <Section id="specimen-evidence" title="Give evidence a clear place"
        lead="A visual and a table should belong to the same publication as the prose. Their labels, rules, captions, and spacing carry the theme at a smaller scale." />
      <Figure id="specimen-figure" caption="An illustrative comparison, with each value placed beside its mark."
        sourceNote="Synthetic values in arbitrary units. No measurements are claimed.">
        <View style={{ paddingTop: 8, paddingBottom: 8 }}>
          {[{ label: 'First', value: 18 }, { label: 'Second', value: 31 }, { label: 'Third', value: 46 }].map((item, index) =>
            <View key={item.label} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 }}>
              <Text style={{ width: 48, fontFamily: theme.body, fontSize: 9, color: theme.muted }}>{item.label}</Text>
              <View style={{ flex: 1, height: 18, justifyContent: 'center' }}>
                <View style={{ width: `${item.value * 2}%`, height: 18, backgroundColor: index === 2 ? theme.accent : theme.line }} />
              </View>
              <Text style={{ width: 25, fontFamily: theme.body, fontSize: 9, color: theme.ink, textAlign: 'right' }}>{item.value}</Text>
            </View>)}
        </View>
      </Figure>
      <DataTable id="specimen-table" caption="The same illustrative values, available as selectable text."
        columns={[{ label: 'Example', width: 1.1 }, { label: 'Treatment', width: 2.2 }, { label: 'Value', width: 0.7 }]}
        rows={[
          ['First', 'Supporting comparison', 18],
          ['Second', 'Supporting comparison', 31],
          ['Third', 'Single point of emphasis', 46],
        ]} sourceNote="Synthetic values, in arbitrary units." />
      <Paragraph id="specimen-closing"><CrossReference target="specimen-figure" /> and <CrossReference target="specimen-table" /> show the same comparison. The local design guide describes this theme’s composition and usage. <Cite source="design" /></Paragraph>
      <References title="Design reference" />
    </Pages>
  </Document>;
}
