import type { ReactNode } from 'react';
import * as F from '@formepdf/react';
import { TextSlot, Block, Document, Heading, Paragraph, References, Strong, Page } from 'opendoc';
import { themePage, type DocTheme } from 'opendoc/themes';
import { BusinessLogo } from '../_shared/BusinessLogo';
import { Pricing } from '../_shared/Pricing';
import type { ProposalPricingData } from './schema';
export { parseProposalPricing } from './schema';
export type { ProposalPricingData } from './schema';

export function BusinessProposal({ title, theme, subtitle, preparedFor, preparedBy, date, reference, cover = false, openingNote, acceptance, runningTitle, titleStyle, logo, children, references }: {
  title: string; theme: DocTheme; subtitle?: ReactNode; preparedFor?: string; preparedBy?: string; date?: string; reference?: string;
  cover?: boolean; openingNote?: ReactNode; acceptance?: ReactNode; runningTitle?: string; titleStyle?: F.Style; logo?: ReactNode;
  children: ReactNode; references?: Parameters<typeof Document>[0]['references'];
}) {
  const layoutTheme: DocTheme = theme.design ? theme : { ...theme, fontSize: 11, lineHeight: 1.45, paragraphGap: 10 };
  const opening = <F.View style={{ ...theme.design?.title?.block, ...(cover ? theme.design?.cover?.block : undefined) }}>
    <F.View wrap={false} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: cover ? 48 : 14 }}>
      <Paragraph id="proposal-label" role="label" baseStyle={{ fontSize: 9, letterSpacing: 0.8, color: theme.muted, marginBottom: 0 }} style={{ ...theme.design?.title?.eyebrow, ...(cover ? theme.design?.cover?.eyebrow : undefined) }}>BUSINESS PROPOSAL</Paragraph>
      <BusinessLogo id="proposal-logo" theme={cover ? { ...theme, muted: theme.design?.cover?.eyebrow?.color ?? theme.muted } : theme}>{logo}</BusinessLogo>
    </F.View>
    <Heading id="proposal-title" level={1} baseStyle={{ fontSize: cover ? 40 : 30, lineHeight: 1.12, marginBottom: 16 }} style={{ ...theme.design?.title?.heading, ...(cover ? theme.design?.cover?.title : undefined), ...titleStyle }}><TextSlot slot="title" from="title">{title}</TextSlot></Heading>
    {subtitle && <Paragraph id="proposal-subtitle" role="lead" baseStyle={{ fontSize: cover ? 17 : 14, lineHeight: 1.4, color: theme.muted, marginBottom: 22 }} style={{ ...theme.design?.title?.subtitle, ...(cover ? theme.design?.cover?.subtitle : undefined) }}><TextSlot slot="subtitle" from="subtitle">{subtitle}</TextSlot></Paragraph>}
    {(preparedFor || preparedBy) && <Block id="proposal-parties" style={{ marginTop: cover ? 36 : 0, marginBottom: 16 }}>
      {preparedFor && <Paragraph id="proposal-client" role="small" baseStyle={{ fontSize: 10, marginBottom: 6 }} style={{ ...theme.design?.title?.byline, ...(cover ? theme.design?.cover?.byline : undefined) }}><Strong>Prepared for </Strong><TextSlot slot="preparedFor" from="preparedFor">{preparedFor}</TextSlot></Paragraph>}
      {preparedBy && <Paragraph id="proposal-author" role="small" baseStyle={{ fontSize: 10, marginBottom: 6 }} style={{ ...theme.design?.title?.byline, ...(cover ? theme.design?.cover?.byline : undefined) }}><Strong>Prepared by </Strong><TextSlot slot="preparedBy" from="preparedBy">{preparedBy}</TextSlot></Paragraph>}
    </Block>}
    {(date || reference) && <Paragraph id="proposal-reference" role="small" baseStyle={{ fontSize: 9, color: theme.muted, marginBottom: 18 }} style={{ ...theme.design?.title?.byline, ...(cover ? theme.design?.cover?.byline : undefined) }}>{date && <TextSlot slot="date" from="date">{date}</TextSlot>}{date && reference ? ' · ' : ''}{reference && <TextSlot slot="reference" from="reference">{reference}</TextSlot>}</Paragraph>}
    {openingNote && <Paragraph id="proposal-opening-note" role="small" baseStyle={{ fontSize: 9, color: theme.muted, marginBottom: 20 }} style={cover ? theme.design?.cover?.byline : undefined}><TextSlot slot="openingNote" from="openingNote">{openingNote}</TextSlot></Paragraph>}
  </F.View>;
  return <Document title={title} author={preparedBy} theme={layoutTheme} references={references}>
    {cover && <Page {...themePage(theme, { top: 66, bottom: 58, left: 54, right: 54 })} style={{ lineBreaking: 'greedy', ...theme.design?.page?.style, ...theme.design?.cover?.page }}>{opening}</Page>}
    <Page {...themePage(theme, { top: 54, bottom: 58, left: 54, right: 54 })} style={{ lineBreaking: 'greedy', ...theme.design?.page?.style }}>
      {runningTitle && (!theme.design || theme.runningHeader) && <F.Fixed position="header"><F.Text style={{ fontFamily: theme.design ? theme.body : undefined, fontSize: 8, color: theme.muted, ...theme.design?.furniture?.text, ...theme.design?.furniture?.header }}>{theme.design?.furniture?.uppercaseHeader ? runningTitle.toUpperCase() : runningTitle}</F.Text></F.Fixed>}
      {(!theme.design || theme.runningFooter) && <F.Fixed position="footer"><F.Text style={{ fontFamily: theme.design ? theme.body : undefined, fontSize: 8, color: theme.muted, textAlign: 'right', ...theme.design?.furniture?.text, ...theme.design?.furniture?.footer }}>{theme.design?.furniture?.pageNumber === 'total' ? '{{pageNumber}} / {{totalPages}}' : '{{pageNumber}}'}</F.Text></F.Fixed>}
      {!cover && opening}
      {children}
      <References headingBaseStyle={{ fontSize: 13, marginTop: 20, marginBottom: 8 }} />
      {acceptance && <>
        <Paragraph id="proposal-acceptance" role="small" baseStyle={{ fontSize: 10, marginTop: 16 }}><Strong>Acceptance. </Strong><TextSlot slot="acceptance" from="acceptance">{acceptance}</TextSlot></Paragraph>
        <Block id="proposal-signature-fields" style={{ marginTop: 10 }}><F.View wrap={false} style={{ flexDirection: 'row', gap: 22 }}>
          {['Name', 'Signature', 'Date'].map(label => <F.View key={label} style={{ flex: 1 }}><F.View style={{ height: 24, borderBottomWidth: 0.6, borderColor: theme.line }} /><F.Text style={{ fontSize: 8, color: theme.muted, marginTop: 5, ...theme.design?.typography?.small }}>{label}</F.Text></F.View>)}
        </F.View></Block>
      </>}
    </Page>
  </Document>;
}

export function ProposalHeading({ id, style, children }: { id: string; style?: F.Style; children: ReactNode }) {
  return <Heading id={id} level={2} baseStyle={{ fontSize: 16, marginTop: 16, marginBottom: 8 }} style={style}><TextSlot slot="children" from="children">{children}</TextSlot></Heading>;
}

/** Optional validated pricing can sit anywhere in the author's proposal. */
export function ProposalPricing({ id, data, theme }: { id: string; data: ProposalPricingData; theme: DocTheme }) {
  return <>
    {data.synthetic && <Paragraph id={`${id}-notice`} role="small" baseStyle={{ fontSize: 9, color: theme.muted }}>Illustrative pricing only. All items, amounts, and rates are synthetic; this is not a commercial offer.</Paragraph>}
    <Pricing id={id} data={data.pricing} theme={theme} totalLabel="Proposed total" />
  </>;
}
