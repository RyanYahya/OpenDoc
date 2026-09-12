import type { ReactNode } from 'react';
import { Document, Pages, Paragraph, Section, TitleBlock, DataTable, Heading, TextSlot, Block, View, type TextFieldPath, type DocumentMeta } from 'opendoc';
import { defineTemplate } from 'opendoc/template';
import type { DocTheme } from 'opendoc/themes';
import { parseMonthlyReport, type MonthlyReportData, type ReportMetric } from './schema';

export { parseMonthlyReport } from './schema';
export type { MonthlyReportData, NarrativeItem, ReportMetric, ReportRisk, ReportAction } from './schema';

const dateLabel = (value: string) => {
  const [year, month, day] = value.split('-').map(Number);
  return `${day} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][month - 1]} ${year}`;
};
const metricValue = (value: number | undefined, metric: ReportMetric) => value === undefined ? '—' :
  `${value.toLocaleString('en-US', { minimumFractionDigits: metric.precision, maximumFractionDigits: metric.precision })}${metric.unit ? `${metric.unit === '%' ? '' : ' '}${metric.unit}` : ''}`;
const statusLabel = { planned: 'Planned', 'in-progress': 'In progress', complete: 'Complete' };
// Length-prefixing separates record IDs from reserved child suffixes such as -heading.
const recordBlock = (kind: string, id: string) => `${kind}-${id.length}-${id}`;

/** Keep only a short opening with its heading; arbitrary data prose remains free to flow. */
function Narrative({ id, title, body, field, sectionHeading, level = 3, children }: {
  id: string; title: ReactNode; body: string; field: TextFieldPath; sectionHeading?: ReactNode; level?: 2 | 3; children?: ReactNode;
}) {
  const opening = (lead: ReactNode) => <View wrap={false}>
    {sectionHeading}<Section id={id} title={title} level={level} lead={lead} />
  </View>;
  if (body.length <= 420) return <>{opening(<TextSlot slot="body" field={field}>{body}</TextSlot>)}{children}</>;
  const sentence = body.match(/^.{1,420}?[.!?](?=\s|$)/s)?.[0];
  const boundary = sentence?.length ?? body.lastIndexOf(' ', 420);
  // Never alter a supplied word by cutting it to fit the opening.
  if (boundary < 1) return <>
    {sectionHeading}
    <Heading id={`${id}-heading`} level={level}>{title}</Heading>
    <Paragraph id={`${id}-body`}><TextSlot slot="body" field={field}>{body}</TextSlot></Paragraph>{children}
  </>;
  const reason = 'This narrative flows in multiple blocks. Ask your agent to edit its full text in data.json.';
  return <>{opening(<TextSlot slot="body-opening" reason={reason}>{body.slice(0, boundary)}</TextSlot>)}
    <Paragraph id={`${id}-body`}><TextSlot slot="body-continuation" reason={reason}>{body.slice(boundary).trimStart()}</TextSlot></Paragraph>{children}
  </>;
}

export const monthlyReportTemplate = (theme: DocTheme) => defineTemplate<MonthlyReportData>({
  parse: parseMonthlyReport,
  meta: data => ({
    title: data.title,
    description: `An operational review for ${data.organization}, ${dateLabel(data.period.start)} to ${dateLabel(data.period.end)}.`,
    kind: 'report', theme: theme.id, author: data.preparedBy ?? data.organization,
  } satisfies DocumentMeta),
  render: data => <Document title={data.title} author={data.preparedBy ?? data.organization} theme={theme}>
    <Pages title={`${data.organization} / ${data.title}`}>
      <TitleBlock id="report-title" eyebrow="Monthly review" title={<TextSlot slot="title" field={['title']}>{data.title}</TextSlot>}
        subtitle={`${dateLabel(data.period.start)} – ${dateLabel(data.period.end)}`}
        byline={<><TextSlot slot="organization" field={['organization']}>{data.organization}</TextSlot>{data.preparedBy ? <> · Prepared by <TextSlot slot="preparedBy" field={['preparedBy']}>{data.preparedBy}</TextSlot></> : ''} · Issued {dateLabel(data.issuedOn)}</>} />
      {data.synthetic && <Paragraph id="sample-notice" role="small" baseStyle={{ fontSize: 9, color: theme.muted, marginBottom: 16 }}>
        Illustrative report. All names, activities, and figures are synthetic; this example is not a performance record.
      </Paragraph>}
      <Narrative id="summary" title="The month in view" body={data.summary} field={['summary']} level={2} />
      {!!data.metrics.length && <DataTable id="performance-table" columns={[
          { label: 'Measure', width: 2.3 }, { label: 'Actual', width: 1.15, align: 'right' },
          { label: 'Target', width: 1.15, align: 'right' }, { label: 'Context', width: 3 },
        ]} rowIds={data.metrics.map(metric => metric.id)} rows={data.metrics.map(metric => [
          <TextSlot slot={`${recordBlock('metric', metric.id)}-label`} field={['metrics', { id: metric.id }, 'label']}>{metric.label}</TextSlot>,
          <TextSlot slot={`${recordBlock('metric', metric.id)}-actual`} reason="Formatted numeric value. Ask your agent to change its inputs.">{metricValue(metric.value, metric)}</TextSlot>,
          <TextSlot slot={`${recordBlock('metric', metric.id)}-target`} reason="Formatted numeric value. Ask your agent to change its inputs.">{metricValue(metric.target, metric)}</TextSlot>,
          <TextSlot slot={`${recordBlock('metric', metric.id)}-note`} field={['metrics', { id: metric.id }, 'note']}>{metric.note ?? '—'}</TextSlot>,
        ])} caption="Performance at a glance" />}
      {!!data.highlights.length && <Block id="highlights">
        {data.highlights.map((item, index) => <Narrative key={item.id} id={recordBlock('highlight', item.id)} sectionHeading={index === 0 && <Heading id="highlights-heading">What changed</Heading>} title={<TextSlot slot="title" field={['highlights', { id: item.id }, 'title']}>{item.title}</TextSlot>} body={item.body} field={['highlights', { id: item.id }, 'body']} />)}
      </Block>}
      {!!data.risks.length && <Block id="risks">
        {data.risks.map((risk, index) => <Narrative key={risk.id} id={recordBlock('risk', risk.id)} sectionHeading={index === 0 && <Heading id="risks-heading">Risks and responses</Heading>} title={<><TextSlot slot="title" field={['risks', { id: risk.id }, 'title']}>{risk.title}</TextSlot> / {risk.level.charAt(0).toUpperCase()}{risk.level.slice(1)}</>}
          body={risk.mitigation} field={['risks', { id: risk.id }, 'mitigation']}>
          <Paragraph id={`${recordBlock('risk', risk.id)}-owner`} role="small" baseStyle={{ fontSize: 9, color: theme.muted }}>Owner: <TextSlot slot="owner" field={['risks', { id: risk.id }, 'owner']}>{risk.owner}</TextSlot></Paragraph>
        </Narrative>)}
      </Block>}
      {!!data.actions.length && <DataTable id="actions-table" columns={[
          { label: 'Commitment', width: 4 }, { label: 'Owner', width: 1.4 }, { label: 'Due', width: 1.4 }, { label: 'Status', width: 1.3 },
        ]} rowIds={data.actions.map(action => action.id)} rows={data.actions.map(action => [
          <TextSlot slot={`${recordBlock('action', action.id)}-title`} field={['actions', { id: action.id }, 'title']}>{action.title}</TextSlot>,
          <TextSlot slot={`${recordBlock('action', action.id)}-owner`} field={['actions', { id: action.id }, 'owner']}>{action.owner}</TextSlot>,
          <TextSlot slot={`${recordBlock('action', action.id)}-due`} reason="Formatted date. Ask your agent to change its input.">{dateLabel(action.due)}</TextSlot>,
          <TextSlot slot={`${recordBlock('action', action.id)}-status`} reason="Reported status. Ask your agent to change its input.">{statusLabel[action.status]}</TextSlot>,
        ])} caption="Next commitments" />}
      {!!data.notes.length && <Block id="notes">
        {data.notes.map((note, index) => <Narrative key={note.id} id={recordBlock('note', note.id)} sectionHeading={index === 0 && <Heading id="notes-heading">Reading the report</Heading>} title={<TextSlot slot="title" field={['notes', { id: note.id }, 'title']}>{note.title}</TextSlot>} body={note.body} field={['notes', { id: note.id }, 'body']} />)}
      </Block>}
      <Paragraph id="source-note" role="small" baseStyle={{ fontSize: 9, color: theme.muted, marginTop: 16 }}>
        Basis of this report. <TextSlot slot="sourceNote" field={['sourceNote']}>{data.sourceNote}</TextSlot>
      </Paragraph>
    </Pages>
  </Document>,
});
