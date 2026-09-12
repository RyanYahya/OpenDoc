import type { ReactNode } from 'react';
import * as F from '@formepdf/react';
import { TextSlot, Block, Document, Heading, Paragraph, Strong, Page } from 'opendoc';
import { defineTemplate } from 'opendoc/template';
import { themePage, type DocTheme } from 'opendoc/themes';
import { BusinessLogo } from '../_shared/BusinessLogo';
import { Pricing } from '../_shared/Pricing';
import { money } from '../_shared/commerce';
import { calculateInvoice, parseInvoice, type InvoiceData } from './schema';
export { calculateInvoice, parseInvoice } from './schema';
export type { InvoiceData } from './schema';

export function Invoice({ data, theme, titleStyle, logo }: { data: InvoiceData; theme: DocTheme; titleStyle?: F.Style; logo?: ReactNode }) {
  const balance = calculateInvoice(data);
  const layoutTheme = theme.design ? theme : { ...theme, fontSize: 10.5, lineHeight: 1.4, paragraphGap: 8 };
  return <Document title={data.title} author={data.seller.name} theme={layoutTheme}>
    <Page {...themePage(theme, { top: 48, bottom: 52, left: 48, right: 48 })} style={{ lineBreaking: 'greedy', ...theme.design?.page?.style }}>
      {(!theme.design || theme.runningFooter) && <F.Fixed position="footer"><F.Text style={{ fontFamily: theme.design ? theme.body : undefined, fontSize: 8, color: theme.muted, textAlign: 'right', ...theme.design?.furniture?.text, ...theme.design?.furniture?.footer }}>{data.synthetic ? 'Illustrative invoice · ' : ''}{theme.design?.furniture?.pageNumber === 'total' ? '{{pageNumber}} / {{totalPages}}' : '{{pageNumber}}'}</F.Text></F.Fixed>}
      <F.View style={theme.design?.title?.block}>
        <F.View wrap={false} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <Paragraph id="invoice-label" role="label" baseStyle={{ fontSize: 9, letterSpacing: 0.8, color: theme.muted, marginBottom: 0 }} style={theme.design?.title?.eyebrow}>INVOICE</Paragraph>
          <BusinessLogo id="invoice-logo" theme={theme}>{logo}</BusinessLogo>
        </F.View>
        <Heading id="invoice-title" level={1} baseStyle={{ fontSize: 28, lineHeight: 1.15, marginBottom: 12 }} style={{ ...theme.design?.title?.heading, ...titleStyle }}><TextSlot slot="title" field={['title']}>{data.title}</TextSlot></Heading>
        <Paragraph id="invoice-number" role="small" baseStyle={{ fontSize: 9, marginBottom: 8 }} style={theme.design?.title?.byline}>No. <TextSlot slot="number" field={['number']}>{data.number}</TextSlot>{data.reference ? <> · Reference: <TextSlot slot="reference" field={['reference']}>{data.reference}</TextSlot></> : ''}</Paragraph>
        <Block id="invoice-balance-summary"><F.View wrap={false} style={{ flexDirection: 'row', gap: 24, marginBottom: 12 }}>
          <F.View style={{ flex: 1 }}>
            <F.Text style={{ fontSize: 9.5, marginBottom: 4, ...theme.design?.typography?.small }}>Issued <TextSlot slot="issuedOn" field={['issuedOn']}>{data.issuedOn}</TextSlot></F.Text>
            {data.dueOn && <F.Text style={{ fontSize: 9.5, ...theme.design?.typography?.small }}>Due <TextSlot slot="dueOn" field={['dueOn']}>{data.dueOn}</TextSlot></F.Text>}
          </F.View>
          <F.View style={{ flex: 1 }}>
            <F.Text style={{ fontSize: 8.5, color: theme.muted, textAlign: 'right', marginBottom: 5, ...theme.design?.typography?.small }}>Amount due</F.Text>
            <F.Text style={{ fontSize: 21, fontWeight: 600, ...theme.design?.typography?.h2, textAlign: 'right' }}><TextSlot slot="amount-due" reason="Calculated value—ask your agent to change its inputs.">{money(balance.balanceMinor, data.pricing.currency)}</TextSlot></F.Text>
          </F.View>
        </F.View></Block>
      </F.View>
      <Block id="invoice-parties"><F.View wrap={false} style={{ flexDirection: 'row', gap: 28, marginBottom: 8 }}>
        {([['From', data.seller, 'seller'], ['Bill to', data.customer, 'customer']] as const).map(([label, party, partyField]) => <F.View key={label} style={{ flex: 1 }}>
          <F.Text style={{ fontSize: 8.5, color: theme.muted, marginBottom: 5, ...theme.design?.typography?.small }}>{label}</F.Text>
          <F.Text style={{ fontWeight: 600, marginBottom: 5 }}><TextSlot slot={`${partyField}-name`} field={[partyField, 'name']}>{party.name}</TextSlot></F.Text>
          {party.details && <F.Text style={{ fontSize: 9.5, color: theme.muted, ...theme.design?.typography?.small }}><TextSlot slot={`${partyField}-details`} field={[partyField, 'details']}>{party.details}</TextSlot></F.Text>}
        </F.View>)}
      </F.View></Block>
      {data.synthetic && <Paragraph id="invoice-sample-notice" role="small" baseStyle={{ fontSize: 9, color: theme.muted }}>Illustrative invoice. All parties, amounts, dates, and payment details are synthetic. This is not a payment request.</Paragraph>}
      {data.introduction && <Paragraph id="invoice-introduction"><TextSlot slot="introduction" field={['introduction']}>{data.introduction}</TextSlot></Paragraph>}
      <Pricing data={data.pricing} theme={theme} totalLabel={data.amountPaid === undefined ? 'Amount due' : 'Invoice total'} paymentReceived={data.amountPaid === undefined ? undefined : balance.paidMinor} />
      {data.paymentInstructions && <Paragraph id="invoice-payment-instructions" role="small" baseStyle={{ fontSize: 9.5 }}><Strong>Payment instructions. </Strong><TextSlot slot="paymentInstructions" field={['paymentInstructions']}>{data.paymentInstructions}</TextSlot></Paragraph>}
      {data.paymentReference && <Paragraph id="invoice-payment-reference" role="small" baseStyle={{ fontSize: 9.5 }}><Strong>Payment reference. </Strong><TextSlot slot="paymentReference" field={['paymentReference']}>{data.paymentReference}</TextSlot></Paragraph>}
      {data.notes.map(note => <Paragraph key={note.id} id={`invoice-note-${note.id.length}-${note.id}`} role="small" baseStyle={{ fontSize: 9.5, marginBottom: 10 }}><Strong><TextSlot slot="title" field={['notes', { id: note.id }, 'title']}>{note.title}</TextSlot>. </Strong><TextSlot slot="text" field={['notes', { id: note.id }, 'text']}>{note.text}</TextSlot></Paragraph>)}
    </Page>
  </Document>;
}
export const invoiceTemplate = (theme: DocTheme, { logo }: { logo?: ReactNode } = {}) => defineTemplate<InvoiceData>({
  parse: parseInvoice,
  meta: data => ({ title: data.title, description: `Invoice ${data.number} for ${data.customer.name}.`, kind: 'report', theme: theme.id, author: data.seller.name }),
  render: data => <Invoice data={data} theme={theme} logo={logo} />,
});
