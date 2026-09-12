import type { ReactNode } from 'react';
import * as F from '@formepdf/react';
import { TextSlot, Document, Heading, Paragraph, Prose, References, Page } from 'opendoc';
import { themePage, type DocTheme } from 'opendoc/themes';

export interface EditorialEssayProps {
  title: string;
  theme: DocTheme;
  author?: string;
  standfirst?: ReactNode;
  children: ReactNode;
  references?: Parameters<typeof Document>[0]['references'];
}

/** Page architecture only. Content remains ordinary, freely ordered PDF blocks. */
export function EditorialEssay({ title, theme, author, standfirst, children, references }: EditorialEssayProps) {
  const layoutTheme: DocTheme = theme.design ? theme : { ...theme, fontSize: 11, lineHeight: 1.42, paragraphGap: 0 };
  return <Document title={title} author={author} theme={layoutTheme} references={references}>
    <Page {...themePage(theme, { top: 66, bottom: 62, left: 105, right: 105 })}>
      {(!theme.design || theme.runningFooter) && <F.Fixed position="footer"><F.Text style={{ fontFamily: theme.body, fontSize: 8, color: theme.muted, textAlign: 'right', ...theme.design?.furniture?.text, ...theme.design?.furniture?.footer }}>{theme.design?.furniture?.pageNumber === 'total' ? '{{pageNumber}} / {{totalPages}}' : '{{pageNumber}}'}</F.Text></F.Fixed>}
      <F.View style={theme.design?.title?.block}>
        <Heading id="essay-title" level={1} baseStyle={{ fontSize: 36, lineHeight: 1.12, marginBottom: 12 }} style={theme.design?.title?.heading}><TextSlot slot="title" from="title">{title}</TextSlot></Heading>
        {author && <Paragraph id="essay-byline" role="small" baseStyle={{ fontSize: 8.5, letterSpacing: 0.25, color: theme.muted, marginBottom: 24 }} style={theme.design?.title?.byline}><TextSlot slot="author" from="author">{author}</TextSlot></Paragraph>}
        {standfirst && <Paragraph id="essay-standfirst" role="lead" baseStyle={{ fontSize: 13, lineHeight: 1.45, color: theme.muted, marginBottom: 28 }} style={theme.design?.title?.subtitle}><TextSlot slot="standfirst" from="standfirst">{standfirst}</TextSlot></Paragraph>}
      </F.View>
      <Prose paragraphGap={theme.design ? theme.paragraphGap : 6}>{children}</Prose>
      <References headingBaseStyle={{ fontSize: 10, marginTop: 26, marginBottom: 8 }} />
    </Page>
  </Document>;
}
