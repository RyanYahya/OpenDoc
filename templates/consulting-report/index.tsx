import type { ReactNode } from 'react';
import * as F from '@formepdf/react';
import { TextSlot, Document, Heading, Paragraph, References, Page } from 'opendoc';
import { themePage, type DocTheme } from 'opendoc/themes';

export interface ConsultingReportProps {
  title: string;
  theme: DocTheme;
  subtitle?: ReactNode;
  author?: string;
  date?: string;
  label?: string;
  cover?: boolean;
  coverNote?: ReactNode;
  runningTitle?: string | false;
  titleStyle?: F.Style;
  children: ReactNode;
  references?: Parameters<typeof Document>[0]['references'];
}

/** An optional cover and ordinary flowing report pages, using native Forme layout. */
export function ConsultingReport({ title, theme, subtitle, author, date, label, cover = true, coverNote, runningTitle = title, titleStyle, children, references }: ConsultingReportProps) {
  const layoutTheme: DocTheme = theme.design ? theme : { ...theme, fontSize: 11.5, lineHeight: 1.45, paragraphGap: 10 };
  const opening = <F.View style={{ ...theme.design?.title?.block, ...(cover ? theme.design?.cover?.block : undefined) }}>
    {label && <Paragraph id="report-label" role="label" baseStyle={{ fontSize: 9, letterSpacing: 0.8, color: theme.accent, marginBottom: cover ? 56 : 16 }} style={{ ...theme.design?.title?.eyebrow, ...(cover ? theme.design?.cover?.eyebrow : undefined) }}>{theme.design?.title?.uppercaseEyebrow ? label.toUpperCase() : <TextSlot slot="label" from="label">{label}</TextSlot>}</Paragraph>}
    <Heading id="report-title" level={1} baseStyle={{ fontSize: cover ? 38 : 30, lineHeight: 1.12, marginBottom: 20 }} style={{ ...theme.design?.title?.heading, ...(cover ? theme.design?.cover?.title : undefined), ...titleStyle }}><TextSlot slot="title" from="title">{title}</TextSlot></Heading>
    {subtitle && <Paragraph id="report-subtitle" role="lead" baseStyle={{ fontSize: 17, lineHeight: 1.4, color: theme.muted, marginBottom: 24 }} style={{ ...theme.design?.title?.subtitle, ...(cover ? theme.design?.cover?.subtitle : undefined) }}><TextSlot slot="subtitle" from="subtitle">{subtitle}</TextSlot></Paragraph>}
    {(author || date) && <F.View style={{ marginTop: cover ? 38 : 0, marginBottom: cover ? 32 : 22, borderTopWidth: 0.6, borderColor: theme.line, paddingTop: 14 }}>
      {author && <Paragraph id="report-author" role="small" baseStyle={{ fontSize: 10, marginBottom: 6 }} style={{ ...theme.design?.title?.byline, ...(cover ? theme.design?.cover?.byline : undefined) }}><TextSlot slot="author" from="author">{author}</TextSlot></Paragraph>}
      {date && <Paragraph id="report-date" role="small" baseStyle={{ fontSize: 10, color: theme.muted, marginBottom: 0 }} style={{ ...theme.design?.title?.byline, ...(cover ? theme.design?.cover?.byline : undefined) }}><TextSlot slot="date" from="date">{date}</TextSlot></Paragraph>}
    </F.View>}
    {coverNote && <Paragraph id="report-context" role="small" baseStyle={{ fontSize: 10, color: theme.muted, marginBottom: 24 }} style={cover ? theme.design?.cover?.byline : undefined}><TextSlot slot="coverNote" from="coverNote">{coverNote}</TextSlot></Paragraph>}
  </F.View>;
  return <Document title={title} author={author} theme={layoutTheme} references={references}>
    {cover && <Page {...themePage(theme, { top: 72, bottom: 58, left: 54, right: 54 })} style={{ lineBreaking: 'greedy', justifyContent: 'flex-end', ...theme.design?.page?.style, ...theme.design?.cover?.page }}>{opening}</Page>}
    <Page {...themePage(theme, { top: 62, bottom: 58, left: 54, right: 54 })} style={{ lineBreaking: 'greedy', ...theme.design?.page?.style }}>
      {runningTitle !== false && (!theme.design || theme.runningHeader) && <F.Fixed position="header"><F.Text style={{ fontFamily: theme.body, fontSize: 8, color: theme.muted, borderBottomWidth: 0.5, borderColor: theme.line, paddingBottom: 8, ...theme.design?.furniture?.text, ...theme.design?.furniture?.header }}>{theme.design?.furniture?.uppercaseHeader ? runningTitle.toUpperCase() : runningTitle}</F.Text></F.Fixed>}
      {(!theme.design || theme.runningFooter) && <F.Fixed position="footer"><F.Text style={{ fontFamily: theme.body, fontSize: 8, color: theme.muted, textAlign: 'right', ...theme.design?.furniture?.text, ...theme.design?.furniture?.footer }}>{theme.design?.furniture?.pageNumber === 'total' ? '{{pageNumber}} / {{totalPages}}' : '{{pageNumber}}'}</F.Text></F.Fixed>}
      {!cover && opening}
      {children}
      <References headingBaseStyle={{ fontSize: 14, marginTop: 26, marginBottom: 10 }} />
    </Page>
  </Document>;
}
