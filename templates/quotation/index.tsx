import type { ReactNode } from 'react';
import * as F from '@formepdf/react';
import { TextSlot, Block, Document, Heading, Paragraph, Strong, Page } from 'opendoc';
import { defineTemplate } from 'opendoc/template';
import { themePage, type DocTheme } from 'opendoc/themes';
import { BusinessLogo } from '../_shared/BusinessLogo';
import { Pricing } from '../_shared/Pricing';
import { parseQuotation, type QuotationData } from './schema';
export { parseQuotation } from './schema';
export type { QuotationData } from './schema';

export function Quotation({ data, theme, titleStyle, logo }: { data: QuotationData; theme: DocTheme; titleStyle?: F.Style; logo?: ReactNode }) {
  const layoutTheme = theme.design ? theme : { ...theme, fontSize: 10.5, lineHeight: 1.4, paragraphGap: 8 };
  return <Document title={data.title} author={data.seller.name} theme={layoutTheme}>
    <Page {...themePage(theme, { top: 48, bottom: 52, left: 48, right: 48 })} style={{ lineBreaking: 'greedy', ...theme.design?.page?.style }}>
      {(!theme.design || theme.runningFooter) && <F.Fixed position="footer"><F.Text style={{ fontFamily: theme.design ? theme.body : undefined, fontSize: 8, color: theme.muted, textAlign: 'right', ...theme.design?.furniture?.text, ...theme.design?.furniture?.footer }}>{data.synthetic ? 'Illustrative quotation · ' : ''}{theme.design?.furniture?.pageNumber === 'total' ? '{{pageNumber}} / {{totalPages}}' : '{{pageNumber}}'}</F.Text></F.Fixed>}
      <F.View style={theme.design?.title?.block}>
        <F.View wrap={false} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <Paragraph id="quote-label" role="label" baseStyle={{ fontSize: 9, letterSpacing: 0.8, color: theme.muted, marginBottom: 0 }} style={theme.design?.title?.eyebrow}>QUOTATION</Paragraph>
          <BusinessLogo id="quote-logo" theme={theme}>{logo}</BusinessLogo>
        </F.View>
        <Heading id="quote-title" level={1} baseStyle={{ fontSize: 28, lineHeight: 1.15, marginBottom: 12 }} style={{ ...theme.design?.title?.heading, ...titleStyle }}><TextSlot slot="title" field={['title']}>{data.title}</TextSlot></Heading>
        <Paragraph id="quote-reference" role="small" baseStyle={{ fontSize: 9, marginBottom: 20 }} style={theme.design?.title?.byline}>No. <TextSlot slot="number" field={['number']}>{data.number}</TextSlot> · Issued <TextSlot slot="issuedOn" field={['issuedOn']}>{data.issuedOn}</TextSlot>{data.validUntil ? <> · Valid through <TextSlot slot="validUntil" field={['validUntil']}>{data.validUntil}</TextSlot></> : ''}</Paragraph>
      </F.View>
      <Block id="quote-parties"><F.View wrap={false} style={{ flexDirection: 'row', gap: 28, marginBottom: 16 }}>
        {([['From', data.seller, 'seller'], ['Prepared for', data.client, 'client']] as const).map(([label, details, partyField]) => {
          return <F.View key={label} style={{ flex: 1 }}>
            <F.Text style={{ fontSize: 8.5, color: theme.muted, marginBottom: 5, ...theme.design?.typography?.small }}>{label}</F.Text>
            <F.Text style={{ fontWeight: 600, marginBottom: 5 }}><TextSlot slot={`${partyField}-name`} field={[partyField, 'name']}>{details.name}</TextSlot></F.Text>
            {details.details && <F.Text style={{ fontSize: 9.5, color: theme.muted, ...theme.design?.typography?.small }}><TextSlot slot={`${partyField}-details`} field={[partyField, 'details']}>{details.details}</TextSlot></F.Text>}
          </F.View>;
        })}
      </F.View></Block>
      {data.synthetic && <Paragraph id="quote-sample-notice" role="small" baseStyle={{ fontSize: 9, color: theme.muted }}>Illustrative quotation. All parties, prices, dates, and terms are synthetic. This is not a commercial offer.</Paragraph>}
      {data.introduction && <Paragraph id="quote-introduction"><TextSlot slot="introduction" field={['introduction']}>{data.introduction}</TextSlot></Paragraph>}
      <Pricing data={data.pricing} theme={theme} totalLabel="Quoted total" />
      {data.terms.map(term => <Paragraph key={term.id} id={`quote-term-${term.id.length}-${term.id}`} role="small" baseStyle={{ fontSize: 9.5, marginBottom: 10 }}><Strong><TextSlot slot="title" field={['terms', { id: term.id }, 'title']}>{term.title}</TextSlot>. </Strong><TextSlot slot="text" field={['terms', { id: term.id }, 'text']}>{term.text}</TextSlot></Paragraph>)}
      {data.acceptance && <F.View wrap={data.acceptance.length > 420}>
        <Paragraph id="quote-acceptance" role="small" baseStyle={{ fontSize: 9.5, marginTop: 10 }}><Strong>Acceptance. </Strong><TextSlot slot="acceptance" field={['acceptance']}>{data.acceptance}</TextSlot></Paragraph>
        <Block id="quote-signature-fields"><F.View wrap={false} style={{ flexDirection: 'row', gap: 22, marginTop: 12 }}>
          {['Name', 'Signature', 'Date'].map(label => <F.View key={label} style={{ flex: 1 }}><F.View style={{ height: 22, borderBottomWidth: 0.6, borderColor: theme.line }} /><F.Text style={{ fontSize: 8, color: theme.muted, marginTop: 5, ...theme.design?.typography?.small }}>{label}</F.Text></F.View>)}
        </F.View></Block>
      </F.View>}
    </Page>
  </Document>;
}
export const quotationTemplate = (theme: DocTheme, { logo }: { logo?: ReactNode } = {}) => defineTemplate<QuotationData>({
  parse: parseQuotation,
  meta: data => ({ title: data.title, description: `Quotation ${data.number} for ${data.client.name}.`, kind: 'report', theme: theme.id, author: data.seller.name }),
  render: data => <Quotation data={data} theme={theme} logo={logo} />,
});
