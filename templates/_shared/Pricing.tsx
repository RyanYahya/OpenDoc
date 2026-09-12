import * as F from '@formepdf/react';
import { TextSlot, Block, DataTable } from 'opendoc';
import type { DocTheme } from 'opendoc/themes';
import { calculatePricing, money, unitPriceMinor, type PricingData } from './commerce';

export function Pricing({ id = 'pricing', data, theme, totalLabel = 'Total', paymentReceived }: { id?: string; data: PricingData; theme: DocTheme; totalLabel?: string; paymentReceived?: bigint }) {
  const totals = calculatePricing(data);
  if (paymentReceived !== undefined && (paymentReceived < 0n || paymentReceived > totals.totalMinor)) throw new Error('Received payment must be between zero and the total.');
  const amounts = [
    ['Subtotal', totals.subtotalMinor],
    ...(data.discount === undefined ? [] : [['Discount', -totals.discountMinor] as const]),
    ...(data.tax ? [[`${data.tax.label} (${data.tax.ratePercent}%)`, totals.taxMinor] as const] : []),
    [totalLabel, totals.totalMinor],
    ...(paymentReceived === undefined ? [] : [['Payments received', -paymentReceived], ['Amount due', totals.totalMinor - paymentReceived]] as const),
  ] as const;
  return <>
    <DataTable id={`${id}-items`} columns={[
      { label: 'Description', width: 3.2 }, { label: 'Qty / unit', width: 1.1, align: 'right' },
      { label: `Unit price (${data.currency.code})`, width: 1.6, align: 'right' }, { label: `Amount (${data.currency.code})`, width: 1.7, align: 'right' },
    ]} rowIds={totals.items.map(item => item.id)} rows={totals.items.map(item => [
      <TextSlot slot={`item-${item.id.length}-${item.id}-description`} field={['pricing', 'items', { id: item.id }, 'description']}>{item.description}</TextSlot>,
      <TextSlot slot={`item-${item.id.length}-${item.id}-quantity-unit`}><TextSlot slot="quantity" reason="Calculated input—ask your agent to change quantities.">{item.quantity}</TextSlot>{item.unit ? <> <TextSlot slot="unit" field={['pricing', 'items', { id: item.id }, 'unit']}>{item.unit}</TextSlot></> : ''}</TextSlot>,
      money(unitPriceMinor(item, data.currency), data.currency, false), money(item.amountMinor, data.currency, false),
    ])} />
    <Block id={`${id}-totals`} style={{ flexDirection: 'row', justifyContent: 'flex-end', marginBottom: 18 }}><F.View wrap={false} style={{ width: 260 }}>
      {amounts.map(([label, amount], index) => {
        const final = index === amounts.length - 1;
        const taxRow = data.tax && index === 1 + (data.discount === undefined ? 0 : 1);
        const textStyle: F.Style = {
          fontSize: final ? 12 : 10, fontWeight: final ? 600 : 400,
          ...theme.design?.table?.text, ...(final ? theme.design?.table?.headerText : undefined),
        };
        return <F.View key={label} style={{ paddingTop: 8, paddingBottom: 8, borderTopWidth: final ? 0.8 : 0, borderColor: theme.line, ...theme.design?.table?.cell, ...(final ? theme.design?.table?.header : undefined), flexDirection: 'row', gap: 12 }}>
          <F.Text style={{ ...textStyle, flex: 1 }}>{taxRow ? <><TextSlot slot="tax-label" field={['pricing', 'tax', 'label']}>{data.tax!.label}</TextSlot> ({data.tax!.ratePercent}%)</> : label}</F.Text>
          <F.Text style={{ ...textStyle, textAlign: 'right' }}><TextSlot slot={`amount-${index}`} reason="Calculated value—ask your agent to change its inputs.">{amount < 0n ? '−' : ''}{money(amount < 0n ? -amount : amount, data.currency)}</TextSlot></F.Text>
        </F.View>;
      })}
    </F.View></Block>
  </>;
}
