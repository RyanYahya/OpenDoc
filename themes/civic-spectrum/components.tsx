import type { ReactNode } from 'react';
import * as F from '@formepdf/react';
import { Block, Heading, Page, Paragraph } from 'opendoc';
import { colors, metrics, theme } from './index';

const spectrum = [colors.blue, colors.sky, colors.leaf, colors.sun, colors.flame, colors.violet];

/** The unequal lengths are an identity device, never a quantitative chart. */
export function SpectrumRail({ height = metrics.railHeight }: { height?: number }) {
  return <F.View style={{ flexDirection: 'row', height, width: '100%' }}>
    {spectrum.map((color, index) => <F.View key={color} style={{ flex: metrics.railWeights[index], height, backgroundColor: color }} />)}
  </F.View>;
}

/** Flowing publication pages: the asymmetric compositions inside remain content-driven. */
export function CivicPages({ children, title, section = 'CS', footer = 'Civic Spectrum', rail = false }: {
  children: ReactNode; title: string; section?: string; footer?: string; rail?: boolean;
}) {
  return <Page size="A4" margin={{ top: metrics.margin, right: metrics.margin, bottom: metrics.bottomMargin, left: metrics.margin }} style={{ backgroundColor: colors.stock }}>
    <F.Fixed position="header"><F.View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingBottom: 16 }}>
      <F.Text style={{ fontSize: 8, color: colors.muted }}>{title}</F.Text>
      <F.Text style={{ fontSize: 8, fontWeight: 600, color: colors.ink }}>{section}</F.Text>
    </F.View></F.Fixed>
    <F.Fixed position="footer"><F.View style={{ borderTopWidth: 0.75, borderColor: colors.rule, paddingTop: 12, flexDirection: 'row', justifyContent: 'space-between' }}>
      <F.Text style={{ fontSize: 8, fontWeight: 600, color: colors.ink }}>{footer}</F.Text>
      <F.Text style={{ fontSize: 8, fontWeight: 600, color: colors.ink }}>{'{{pageNumber}}'}</F.Text>
    </F.View></F.Fixed>
    {rail && <F.View style={{ marginBottom: 24 }}><SpectrumRail /></F.View>}
    {children}
  </Page>;
}

export function SquareSignal({ id, label, color = colors.blue }: { id: string; label: string; color?: string }) {
  return <Block id={id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
    <F.View style={{ width: metrics.signalSize, height: metrics.signalSize, backgroundColor: color, flexShrink: 0 }} />
    <F.Text style={{ fontSize: 8, fontWeight: 600, letterSpacing: 1, color: colors.ink }}>{label.toUpperCase()}</F.Text>
  </Block>;
}

export function CivicBadge({ id, value, label, color = colors.blue, filled = false }: {
  id: string; value: string; label: string; color?: string; filled?: boolean;
}) {
  return <Block id={id}>
    <F.View style={{ width: metrics.badgeSize, height: metrics.badgeSize, borderWidth: 0.75, borderColor: color, backgroundColor: filled ? color : colors.stock, justifyContent: 'center', alignItems: 'center' }}>
      <F.Text style={{ fontSize: value.length > 2 ? 44 : 60, lineHeight: 1, fontWeight: 600, letterSpacing: -1.5, color: filled ? colors.ink : color }}>{value}</F.Text>
    </F.View>
    <F.Text style={{ width: metrics.badgeSize, fontSize: 8, lineHeight: 1.35, color: colors.muted, marginTop: 12 }}>{label}</F.Text>
  </Block>;
}

export function CivicSplit({ id, main, aside }: { id: string; main: ReactNode; aside: ReactNode }) {
  return <Block id={id} style={{ flexDirection: 'row', gap: metrics.gutter, alignItems: 'flex-start' }}>
    <F.View style={{ width: metrics.mainWidth }}>{main}</F.View>
    <F.View style={{ flex: 1, minWidth: 0 }}>{aside}</F.View>
  </Block>;
}

export function CivicOpening({ id, kicker, title, subtitle, color = colors.blue }: {
  id: string; kicker: string; title: string; subtitle?: string; color?: string;
}) {
  return <F.View wrap={false} style={{ marginBottom: 24 }}>
    <SquareSignal id={`${id}-signal`} label={kicker} color={color} />
    <Heading id={`${id}-title`} level={1} style={{ marginTop: 20 }}>{title}</Heading>
    {subtitle && <Paragraph id={`${id}-subtitle`} role="lead" style={{ marginBottom: 0 }}>{subtitle}</Paragraph>}
  </F.View>;
}

/** A category module. Keep each color's meaning consistent throughout a document. */
export function SignalBlock({ id, code, title, children, color = colors.blue }: {
  id: string; code: string; title: string; children: ReactNode; color?: string;
}) {
  return <Block id={id} style={{ borderTopWidth: 4, borderColor: color, paddingTop: 12, marginBottom: 24 }}>
    <F.View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
      <F.Text style={{ fontSize: 14, lineHeight: 1.1, fontWeight: 600, color: colors.ink }}>{title}</F.Text>
      <F.Text style={{ fontSize: 8, color: colors.muted }}>{code}</F.Text>
    </F.View>
    <F.Text style={{ fontSize: 10, lineHeight: 1.4, color: colors.muted }}>{children}</F.Text>
  </Block>;
}

/** Palette is shown as a real legend, with accessible text labels and exact values. */
export function SpectrumLegend({ id }: { id: string }) {
  const entries = theme.palette!.slice(0, 6);
  return <Block id={id}>
    {[entries.slice(0, 3), entries.slice(3)].map((row, index) => <F.View key={index} style={{ flexDirection: 'row', gap: 12, marginBottom: 16 }}>
      {row.map(entry => <F.View key={entry.name} style={{ flex: 1, flexDirection: 'row', gap: 8 }}>
        <F.View style={{ width: 28, height: 28, flexShrink: 0, backgroundColor: entry.value }} />
        <F.View style={{ flex: 1 }}><F.Text style={{ fontSize: 9, fontWeight: 600 }}>{entry.name}</F.Text><F.Text style={{ fontFamily: 'OpenDoc Mono', fontSize: 8, color: colors.muted, marginTop: 3 }}>{entry.value}</F.Text></F.View>
      </F.View>)}
    </F.View>)}
  </Block>;
}
