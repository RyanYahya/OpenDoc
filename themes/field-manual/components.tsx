import { Fragment, type ReactNode } from 'react';
import * as F from '@formepdf/react';
import { Block, Heading, Page, Paragraph } from 'opendoc';
import { colors, metrics } from './index';

export type ManualSurface = 'light' | 'dark';
const surface = (value: ManualSurface) => value === 'dark'
  ? { bg: colors.dark, ink: colors.inverse, muted: colors.inverseMuted, rule: colors.inverseRule }
  : { bg: colors.stock, ink: colors.ink, muted: colors.muted, rule: colors.rule };

/** Normal flowing pages, with genuine repeated fixed revision furniture. */
export function ManualPages({ title, code = 'FM—01', revision = 'REV 01', surface: mode = 'light', children }: {
  title: string; code?: string; revision?: string; surface?: ManualSurface; children: ReactNode;
}) {
  const c = surface(mode);
  return <Page size="A4" margin={{ top: metrics.margin, right: metrics.margin, bottom: metrics.bottomMargin, left: metrics.margin }} style={{ backgroundColor: c.bg }}>
    <F.Fixed position="header"><F.View style={{ flexDirection: 'row', justifyContent: 'space-between', borderBottomWidth: 0.75, borderColor: c.rule, paddingBottom: 12, marginBottom: 16 }}>
      <F.Text style={{ fontFamily: 'OpenDoc Mono', fontSize: 7.5, color: c.muted }}>{title}</F.Text>
      <F.Text style={{ fontFamily: 'OpenDoc Mono', fontSize: 7.5, color: c.muted }}>{revision}</F.Text>
    </F.View></F.Fixed>
    <F.Fixed position="footer"><F.View style={{ flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 0.75, borderColor: c.rule, paddingTop: 12 }}>
      <F.Text style={{ fontFamily: 'OpenDoc Mono', fontSize: 7.5, color: c.muted }}>{code} / FIELD MANUAL</F.Text>
      <F.Text style={{ fontFamily: 'OpenDoc Mono', fontSize: 7.5, color: c.muted }}>{'{{pageNumber}}'}</F.Text>
    </F.View></F.Fixed>
    {children}
  </Page>;
}

export function ManualCode({ id, code, label, surface: mode = 'light' }: { id: string; code: string; label: string; surface?: ManualSurface }) {
  const c = surface(mode);
  return <Block id={id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
    <F.View style={{ backgroundColor: colors.orange, paddingTop: 5, paddingBottom: 5, paddingLeft: 8, paddingRight: 8 }}>
      <F.Text style={{ fontFamily: 'OpenDoc Mono', fontWeight: 400, fontSize: 8, color: colors.ink }}>{code}</F.Text>
    </F.View>
    <F.Text style={{ fontFamily: 'OpenDoc Mono', fontWeight: 400, fontSize: 8, letterSpacing: 0.4, color: c.ink }}>{label.toUpperCase()}</F.Text>
  </Block>;
}

export function ManualSpine({ id, children }: { id: string; children: ReactNode }) {
  return <Block id={id} style={{ borderLeftWidth: metrics.spine, borderColor: colors.orange, paddingLeft: metrics.inset }}>{children}</Block>;
}

export function ManualOpening({ id, code, label, title, subtitle, surface: mode = 'light' }: {
  id: string; code: string; label: string; title: string; subtitle?: string; surface?: ManualSurface;
}) {
  const c = surface(mode);
  return <F.View wrap={false} style={{ marginBottom: 28 }}>
    <ManualCode id={`${id}-code`} code={code} label={label} surface={mode} />
    <Heading id={`${id}-title`} level={1} style={{ color: c.ink, marginTop: 24 }}>{title}</Heading>
    {subtitle && <Paragraph id={`${id}-subtitle`} role="lead" style={{ color: c.muted, marginBottom: 0 }}>{subtitle}</Paragraph>}
  </F.View>;
}

/** The label/value field is usable for actual metadata, definitions, and revision records. */
export function SpecRows({ id, rows, surface: mode = 'light' }: {
  id: string; rows: { label: string; value: string }[]; surface?: ManualSurface;
}) {
  const c = surface(mode);
  return <Block id={id}>
    {rows.map(row => <F.View key={row.label} wrap={false} style={{ borderTopWidth: metrics.rule, borderColor: c.rule, paddingTop: 8, paddingBottom: 12, flexDirection: 'row', gap: 8 }}>
      <F.Text style={{ width: metrics.labelWidth, flexShrink: 0, fontFamily: 'OpenDoc Mono', fontSize: 7.5, color: c.muted }}>{row.label.toUpperCase()}</F.Text>
      <F.Text style={{ flex: 1, minWidth: 0, fontFamily: 'OpenDoc Mono', fontSize: 8, lineHeight: 1.35, color: c.ink }}>{row.value}</F.Text>
    </F.View>)}
  </Block>;
}

export function EvidenceChain({ id, steps }: {
  id: string; steps: [{ title: string; detail: string }, { title: string; detail: string }, { title: string; detail: string }];
}) {
  return <Block id={id} style={{ flexDirection: 'row', alignItems: 'stretch', marginTop: 8, marginBottom: 24 }}>
    {steps.map((step, index) => <Fragment key={step.title}>
      {index > 0 && <F.Text style={{ width: 20, flexShrink: 0, alignSelf: 'center', textAlign: 'center', fontFamily: 'OpenDoc Sans', fontSize: 16, color: colors.muted }}>→</F.Text>}
      <F.View style={{ flex: 1, minWidth: 0, borderTopWidth: 4, borderColor: index === 1 ? colors.orange : colors.ink, backgroundColor: index === 1 ? colors.paper : colors.panel, padding: 12 }}>
        <F.Text style={{ fontFamily: 'OpenDoc Mono', fontSize: 7.5, color: index === 1 ? colors.orange : colors.muted }}>{`0${index + 1} / ${['INPUT', 'METHOD', 'OUTPUT'][index]}`}</F.Text>
        <F.Text style={{ fontSize: 23, lineHeight: 1.1, fontWeight: 600, letterSpacing: -0.4, color: colors.ink, marginTop: 24, marginBottom: 12 }}>{step.title}</F.Text>
        <F.Text style={{ fontSize: 10, lineHeight: 1.45, color: colors.muted }}>{step.detail}</F.Text>
      </F.View>
    </Fragment>)}
  </Block>;
}

export function ManualAnnotation({ id, code, children, surface: mode = 'light' }: { id: string; code: string; children: ReactNode; surface?: ManualSurface }) {
  const c = surface(mode);
  return <Block id={id} style={{ flexDirection: 'row', gap: 16, borderTopWidth: 0.75, borderColor: c.rule, paddingTop: 12, marginTop: 12, marginBottom: 20 }}>
    <F.Text style={{ width: 68, fontFamily: 'OpenDoc Mono', fontSize: 8, color: colors.orange }}>{code}</F.Text>
    <F.Text style={{ flex: 1, minWidth: 0, fontSize: 10, lineHeight: 1.5, color: c.muted }}>{children}</F.Text>
  </Block>;
}

/** A whole directive page; use only for a real revision, handover, or closing instruction. */
export function DirectivePage({ id, code, revision, title, lead, rows }: {
  id: string; code: string; revision: string; title: string; lead: string; rows: { label: string; value: string }[];
}) {
  return <ManualPages title="Directive / Field Manual" code={code} revision={revision} surface="dark">
    <F.View style={{ height: 6, backgroundColor: colors.orange, marginBottom: 40 }} />
    <ManualCode id={`${id}-code`} code={revision} label="Closing directive" surface="dark" />
    <F.View style={{ marginTop: 36, marginBottom: 36 }}>
      <ManualSpine id={`${id}-spine`}>
        <Heading id={`${id}-title`} level={1} style={{ color: colors.inverse, fontSize: 48, lineHeight: 1.02, letterSpacing: -1, marginBottom: 24 }}>{title}</Heading>
        <Paragraph id={`${id}-lead`} style={{ width: 340, fontSize: 15, lineHeight: 1.5, color: colors.inverseMuted, marginBottom: 0 }}>{lead}</Paragraph>
      </ManualSpine>
    </F.View>
    <SpecRows id={`${id}-record`} rows={rows} surface="dark" />
    <ManualAnnotation id={`${id}-note`} code="FM / RULE" surface="dark">A revision is useful when a reader can see what changed, why it changed, and which check comes next.</ManualAnnotation>
  </ManualPages>;
}
