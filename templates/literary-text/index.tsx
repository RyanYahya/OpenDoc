import type { ReactNode } from 'react';
import * as F from '@formepdf/react';
import { TextSlot, Document, Heading, Paragraph, References, Page } from 'opendoc';
import { themePage, type DocTheme } from 'opendoc/themes';

export function LiteraryText({ title, theme, author, epigraph, titleStyle, children, references }: {
  title: string; theme: DocTheme; author?: string; epigraph?: ReactNode; titleStyle?: F.Style;
  children: ReactNode; references?: Parameters<typeof Document>[0]['references'];
}) {
  const layoutTheme: DocTheme = theme.design ? theme : { ...theme, fontSize: 11.5, lineHeight: 1.55, paragraphGap: 7 };
  return <Document title={title} author={author} theme={layoutTheme} references={references}>
    <Page {...themePage(theme, { top: 64, bottom: 64, left: 112, right: 112 })} style={{ lineBreaking: 'greedy', ...theme.design?.page?.style }}>
      {(!theme.design || theme.runningFooter) && <F.Fixed position="footer"><F.Text style={{ fontFamily: theme.body, fontSize: 8, color: theme.muted, textAlign: 'center', ...theme.design?.furniture?.text, ...theme.design?.furniture?.footer }}>{theme.design?.furniture?.pageNumber === 'total' ? '{{pageNumber}} / {{totalPages}}' : '{{pageNumber}}'}</F.Text></F.Fixed>}
      <F.View style={theme.design?.title?.block}>
        <Heading id="literary-title" level={1} baseStyle={{ fontSize: 26, lineHeight: 1.2, textAlign: 'center', marginTop: 56, marginBottom: 16 }} style={{ ...theme.design?.title?.heading, ...titleStyle }}><TextSlot slot="title" from="title">{title}</TextSlot></Heading>
        {author && <Paragraph id="literary-author" role="small" baseStyle={{ fontSize: 10, color: theme.muted, textAlign: 'center', marginBottom: 20 }} style={theme.design?.title?.byline}><TextSlot slot="author" from="author">{author}</TextSlot></Paragraph>}
        {epigraph && <Paragraph id="literary-epigraph" role="lead" baseStyle={{ fontSize: 11, fontStyle: 'italic', lineHeight: 1.45, marginLeft: 24, marginRight: 24, marginTop: 10, marginBottom: 14 }}><TextSlot slot="epigraph" from="epigraph">{epigraph}</TextSlot></Paragraph>}
      </F.View>
      <F.View style={{ marginTop: 28 }}>{children}<References headingBaseStyle={{ fontSize: 12, marginTop: 24, marginBottom: 8 }} /></F.View>
    </Page>
  </Document>;
}

/** Keep a scene marker with its short opening; subsequent paragraphs flow normally. */
export function SceneBreak({ id, lead }: { id: string; lead: string }) {
  if (!lead.trim() || lead.length > 700) throw new Error('SceneBreak needs a short opening paragraph of 1–700 characters. Put the rest in following Paragraph blocks.');
  return <F.View wrap={false}>
    <Paragraph id={`${id}-marker`} role="small" baseStyle={{ textAlign: 'center', fontSize: 10, marginTop: 18, marginBottom: 18 }}>* * *</Paragraph>
    <Paragraph id={`${id}-lead`}><TextSlot slot="lead" from="lead">{lead}</TextSlot></Paragraph>
  </F.View>;
}
