import type { ReactNode } from 'react';
import { Fixed, Text, View } from '@formepdf/react';
import { Block, Heading, Paragraph, Page } from 'opendoc';
import { colors as c, theme } from './index';

/** A reusable dark publication opening. Its square field is deliberately unlike an analytical page. */
export function ConsultingCover({ id, title, subtitle, label = 'Executive exhibit system', children }: {
  id: string; title: string; subtitle: string; label?: string; children?: ReactNode;
}) {
  return <Page size="A4" margin={48} style={{ backgroundColor: c.ink }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      <View style={{ width: 22, height: 3, backgroundColor: c.focus }} />
      <Text style={{ fontSize: 8, letterSpacing: 1.3, color: c.pale }}>{label.toUpperCase()}</Text>
    </View>
    <Heading id={`${id}-title`} level={1} style={{ color: c.white, fontSize: 62, lineHeight: 1.01, letterSpacing: -1.7, marginTop: 78, marginBottom: 24 }}>{title}</Heading>
    <Paragraph id={`${id}-subtitle`} style={{ width: 350, color: c.pale, fontSize: 15, lineHeight: 1.4 }}>{subtitle}</Paragraph>
    <View style={{ marginTop: 48, height: 224 }}>
      <View style={{ flexDirection: 'row', height: 56 }}><View style={{ width: '18%' }} /><View style={{ width: '44%', backgroundColor: c.blue1 }} /><View style={{ width: '38%', backgroundColor: c.blue2 }} /></View>
      <View style={{ flexDirection: 'row', height: 56 }}><View style={{ width: '44%', backgroundColor: c.blue1 }} /><View style={{ width: '56%', backgroundColor: c.focus }} /></View>
      <View style={{ flexDirection: 'row', height: 56 }}><View style={{ width: '62%', backgroundColor: c.focus }} /><View style={{ width: '38%', backgroundColor: c.pale }} /></View>
      <View style={{ flexDirection: 'row', height: 56 }}><View style={{ width: '18%', backgroundColor: c.blue2 }} /><View style={{ width: '44%', backgroundColor: c.blue4 }} /><View style={{ width: '38%' }} /></View>
    </View>
    {children}
    <Fixed position="footer"><View style={{ flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 0.5, borderColor: c.positive, paddingTop: 8 }}>
      <Text style={{ fontSize: 8, color: c.pale }}>Independent consulting design / {theme.name}</Text>
      <Text style={{ fontSize: 8, color: c.pale }}>{'{{pageNumber}} / {{totalPages}}'}</Text>
    </View></Fixed>
  </Page>;
}

/** Keep a claim and its measurement definition together; evidence below remains flowable. */
export function ExhibitTitle({ id, number, topic, children, metric }: {
  id: string; number: string; topic: string; children: ReactNode; metric: string;
}) {
  return <View wrap={false} style={{ marginBottom: 20 }}>
    <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', marginBottom: 12 }}>
      <View style={{ width: 20, height: 2, backgroundColor: c.focus }} />
      <Text style={{ color: c.focus, fontSize: 8, letterSpacing: 0.7, fontWeight: 600 }}>EXHIBIT {number} / {topic.toUpperCase()}</Text>
    </View>
    <Heading id={`${id}-claim`} level={1} style={{ marginBottom: 12 }}>{children}</Heading>
    <Paragraph id={`${id}-metric`} style={{ fontSize: 9, color: c.muted, marginBottom: 0 }}>{metric}</Paragraph>
  </View>;
}

/** Direct labels, a visible zero baseline, and one explicitly selected focus. Values share a scale. */
export function RankedBars({ id, rows, max = 100, suffix = '%', highlight = 0 }: {
  id: string; rows: Array<{ label: string; detail?: string; value: number }>; max?: number; suffix?: string; highlight?: number;
}) {
  if (!Number.isFinite(max) || max <= 0 || rows.some(row => !Number.isFinite(row.value) || row.value < 0 || row.value > max)) throw new Error('RankedBars needs finite nonnegative values within a positive maximum.');
  return <Block id={id} style={{ marginBottom: 16 }}>
    {rows.map((row, index) => <View key={row.label} wrap={false} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingTop: 8, paddingBottom: 8, borderTopWidth: 0.5, borderColor: c.rule }}>
      <View style={{ width: 112 }}><Text style={{ fontSize: 10, fontWeight: 600 }}>{row.label}</Text>{row.detail && <Text style={{ fontSize: 8, color: c.muted, marginTop: 2 }}>{row.detail}</Text>}</View>
      <View style={{ flex: 1, height: 22, backgroundColor: c.soft }}><View style={{ width: `${row.value / max * 100}%`, height: 22, backgroundColor: index === highlight ? c.focus : c.blue2 }} /></View>
      <Text style={{ width: 36, textAlign: 'right', fontSize: 15, fontWeight: 600, color: index === highlight ? c.focus : c.ink }}>{row.value}{suffix}</Text>
    </View>)}
    <View style={{ flexDirection: 'row', marginLeft: 124, marginRight: 48, justifyContent: 'space-between', borderTopWidth: 0.5, borderColor: c.rule, paddingTop: 4 }}><Text style={{ fontSize: 7, color: c.muted }}>0</Text><Text style={{ fontSize: 7, color: c.muted }}>{max}{suffix}</Text></View>
  </Block>;
}

export function Implication({ id, label = 'What this changes', children }: { id: string; label?: string; children: ReactNode }) {
  return <Block id={id} style={{ backgroundColor: c.pale, padding: 16, marginTop: 8, marginBottom: 12 }}>
    <Text style={{ fontSize: 9, fontWeight: 600, marginBottom: 6 }}>{label}</Text>
    <Text style={{ fontSize: 10.5, lineHeight: 1.4 }}>{children}</Text>
  </Block>;
}

export function SourceNote({ id, children }: { id: string; children: ReactNode }) {
  return <Paragraph id={id} style={{ fontSize: 8, lineHeight: 1.35, color: c.muted, marginTop: 8 }}>{children}</Paragraph>;
}
