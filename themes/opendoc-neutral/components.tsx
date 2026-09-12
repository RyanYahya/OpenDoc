import type { ReactNode } from 'react';
import { Fixed, View, Text, type Style } from '@formepdf/react';
import { Block, Heading, Page, Paragraph, TextSlot, documentFont } from 'opendoc';
import { colors, metrics } from './index';

export type Surface = 'paper' | 'white' | 'dark';
export const surfaceColors = (surface: Surface) => surface === 'dark'
  ? { background: colors.night, ink: colors.inverse, muted: colors.inverseMuted, rule: colors.inverseRule }
  : { background: surface === 'white' ? colors.white : colors.paper, ink: colors.ink, muted: colors.muted, rule: colors.rule };

/** A flowing surface; running furniture repeats if the content needs another page. */
export function NeutralPages({ title, label = 'OpenDoc Neutral', surface = 'paper', children, header = true }: {
  title: string; label?: string; surface?: Surface; children: ReactNode; header?: boolean;
}) {
  const c = surfaceColors(surface);
  return <Page size="A4" margin={{ top: metrics.margin, right: metrics.margin, bottom: metrics.bottom, left: metrics.margin }} style={{ backgroundColor: c.background, color: c.ink }}>
    {header && <Fixed position="header"><View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingBottom: 18 }}>
      <Text style={{ fontFamily: 'OpenDoc Mono', fontSize: 7, color: c.muted }}>{label}</Text>
      <Text style={{ fontFamily: 'OpenDoc Mono', fontSize: 7, color: c.muted }}>{title}</Text>
    </View></Fixed>}
    <Fixed position="footer"><View style={{ flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: metrics.rule, borderColor: c.rule, paddingTop: 10 }}>
      <Text style={{ fontFamily: 'OpenDoc Mono', fontSize: 7, color: c.muted }}>{label}</Text>
      <Text style={{ fontFamily: 'OpenDoc Mono', fontSize: 7, color: c.muted }}>{'{{pageNumber}}'}</Text>
    </View></Fixed>
    {children}
  </Page>;
}

export function NeutralOpening({ id, eyebrow, title, subtitle, surface = 'paper', display = false }: {
  id: string; eyebrow: string; title: string; subtitle?: string; surface?: Surface; display?: boolean;
}) {
  const c = surfaceColors(surface);
  return <Block id={id} style={{ marginBottom: 24 }}>
    <Paragraph id={`${id}-eyebrow`} role="label" style={{ color: surface === 'dark' ? colors.inverseMuted : colors.blue, marginBottom: 18 }}><TextSlot slot="eyebrow" from="eyebrow">{eyebrow}</TextSlot></Paragraph>
    <Heading id={`${id}-title`} level={1} style={{ color: c.ink, fontFamily: documentFont('heading'), ...(display ? { fontSize: 62, lineHeight: 1.03, letterSpacing: -2.1 } : {}), marginBottom: subtitle ? 16 : 0 }}><TextSlot slot="title" from="title">{title}</TextSlot></Heading>
    {subtitle && <Paragraph id={`${id}-subtitle`} role="lead" style={{ color: c.muted, marginBottom: 0 }}><TextSlot slot="subtitle" from="subtitle">{subtitle}</TextSlot></Paragraph>}
  </Block>;
}

/** Independent bounded columns, deliberately not advertised as sequential text flow. */
export function NeutralColumns({ left, right, ratio = 'equal', style }: { left: ReactNode; right: ReactNode; ratio?: 'equal' | 'narrow-left'; style?: Style }) {
  return <View style={{ flexDirection: 'row', gap: metrics.gutter, alignItems: 'flex-start', ...style }}>
    <View style={{ flex: 1, minWidth: 0 }}>{left}</View>
    <View style={{ flex: ratio === 'equal' ? 1 : 2, minWidth: 0 }}>{right}</View>
  </View>;
}

export function NeutralQuote({ id, children, attribution, surface = 'paper' }: { id: string; children: ReactNode; attribution: string; surface?: Surface }) {
  const c = surfaceColors(surface);
  return <Block id={id} style={{ borderTopWidth: 2, borderColor: surface === 'dark' ? colors.inverse : colors.blue, paddingTop: 18, marginTop: 18, marginBottom: 24 }}>
    <Paragraph id={`${id}-text`} style={{ fontFamily: 'OpenDoc Serif', fontStyle: 'italic', fontSize: 28, lineHeight: 1.2, color: c.ink, marginBottom: 16 }}>{children}</Paragraph>
    <Paragraph id={`${id}-attribution`} role="label" style={{ color: c.muted, marginBottom: 0 }}><TextSlot slot="attribution" from="attribution">{attribution}</TextSlot></Paragraph>
  </Block>;
}

/** Native vector-like page shapes, used sparingly as the theme's opening motif. */
export function PaperStudy({ id, surface = 'paper' }: { id: string; surface?: Surface }) {
  const dark = surface === 'dark';
  return <Block id={id} style={{ height: 186, flexDirection: 'row', gap: 16, alignItems: 'flex-end' }}>
    <View style={{ flex: 1, height: 114, padding: 18, backgroundColor: dark ? colors.inverseRule : colors.stone }}>
      <View style={{ width: 20, height: 3, backgroundColor: dark ? colors.inverseMuted : colors.muted, marginBottom: 36 }} />
      <View style={{ height: 1, backgroundColor: dark ? colors.inverseMuted : colors.muted, marginBottom: 8 }} />
      <View style={{ height: 1, width: '62%', backgroundColor: dark ? colors.inverseMuted : colors.muted }} />
    </View>
    <View style={{ flex: 1, height: 150, padding: 18, backgroundColor: dark ? colors.inverse : colors.ink }}>
      <View style={{ width: 20, height: 3, backgroundColor: colors.blue, marginBottom: 32 }} />
      <View style={{ height: 32, width: 32, borderWidth: 1, borderColor: dark ? colors.ink : colors.inverse, marginBottom: 18 }} />
      <View style={{ height: 1, backgroundColor: dark ? colors.ink : colors.inverse }} />
    </View>
    <View style={{ flex: 1, height: 186, padding: 18, backgroundColor: colors.blue }}>
      <View style={{ width: 20, height: 3, backgroundColor: colors.white, marginBottom: 38 }} />
      <View style={{ height: 54, width: 54, borderWidth: 1, borderColor: colors.white, marginBottom: 25 }} />
      <View style={{ height: 1, backgroundColor: colors.white, marginBottom: 8 }} />
      <View style={{ height: 1, width: '62%', backgroundColor: colors.white }} />
    </View>
  </Block>;
}
