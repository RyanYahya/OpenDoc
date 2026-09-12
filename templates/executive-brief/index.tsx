import type { ReactNode } from 'react';
import * as F from '@formepdf/react';
import { TextSlot, Document, Heading, Paragraph, References, Page } from 'opendoc';
import { themePage, type DocTheme } from 'opendoc/themes';

export function ExecutiveBrief({ title, theme, author, date, label, takeaway, titleStyle, children, references }: {
  title: string; theme: DocTheme; author?: string; date?: string; label?: string;
  takeaway?: ReactNode; titleStyle?: F.Style; children: ReactNode;
  references?: Parameters<typeof Document>[0]['references'];
}) {
  const layoutTheme: DocTheme = theme.design ? theme : { ...theme, fontSize: 11, lineHeight: 1.4, paragraphGap: 8 };
  const details = author || date;
  return <Document title={title} author={author} theme={layoutTheme} references={references}>
    <Page {...themePage(theme, { top: 48, bottom: 48, left: 52, right: 52 })} style={{ lineBreaking: 'greedy', ...theme.design?.page?.style }}>
      {(!theme.design || theme.runningFooter) && <F.Fixed position="footer"><F.Text style={{ fontFamily: theme.body, fontSize: 8, color: theme.muted, textAlign: 'right', ...theme.design?.furniture?.text, ...theme.design?.furniture?.footer }}>{theme.design?.furniture?.pageNumber === 'total' ? '{{pageNumber}} / {{totalPages}}' : '{{pageNumber}}'}</F.Text></F.Fixed>}
      <F.View style={theme.design?.title?.block}>
        {label && <Paragraph id="brief-label" role="label" baseStyle={{ fontSize: 8.5, color: theme.muted, letterSpacing: 0.6, marginBottom: 8 }} style={theme.design?.title?.eyebrow}>{theme.design?.title?.uppercaseEyebrow ? label.toUpperCase() : <TextSlot slot="label" from="label">{label}</TextSlot>}</Paragraph>}
        <Heading id="brief-title" level={1} baseStyle={{ fontSize: 26, lineHeight: 1.12, marginBottom: 10 }} style={{ ...theme.design?.title?.heading, ...titleStyle }}><TextSlot slot="title" from="title">{title}</TextSlot></Heading>
        {details && <Paragraph id="brief-details" role="small" baseStyle={{ fontSize: 9, color: theme.muted, marginBottom: 10 }} style={theme.design?.title?.byline}>{author && <TextSlot slot="author" from="author">{author}</TextSlot>}{author && date ? ' · ' : ''}{date && <TextSlot slot="date" from="date">{date}</TextSlot>}</Paragraph>}
        {takeaway && <Paragraph id="brief-takeaway" role="lead" baseStyle={{ fontSize: 14, fontWeight: 600, lineHeight: 1.35, marginTop: 8, marginBottom: 16 }} style={theme.design?.title?.subtitle}><TextSlot slot="takeaway" from="takeaway">{takeaway}</TextSlot></Paragraph>}
      </F.View>
      <F.View style={{ marginTop: takeaway ? 0 : 10 }}>
        {children}
        <References headingBaseStyle={{ fontSize: 12.5, marginTop: 16, marginBottom: 6 }} />
      </F.View>
    </Page>
  </Document>;
}

/** Compact section hierarchy with ordinary native styles available to the author. */
export function BriefHeading({ id, style, children }: { id: string; style?: F.Style; children: ReactNode }) {
  return <Heading id={id} level={2} baseStyle={{ fontSize: 12.5, marginTop: 12, marginBottom: 6 }} style={style}><TextSlot slot="children" from="children">{children}</TextSlot></Heading>;
}
