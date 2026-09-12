import type { ReactNode } from 'react';
import * as F from '@formepdf/react';
import { TextSlot, Document, Heading, Paragraph, References, Strong, Page } from 'opendoc';
import { themePage, type DocTheme } from 'opendoc/themes';

export interface ScientificPaperProps {
  title: string;
  theme: DocTheme;
  authors?: string;
  affiliations?: ReactNode;
  correspondence?: string;
  abstract?: ReactNode;
  keywords?: string;
  titleStyle?: F.Style;
  citationStyle?: Parameters<typeof Document>[0]['citationStyle'];
  references?: Parameters<typeof Document>[0]['references'];
  children: ReactNode;
}

/** A manuscript opening and one continuous column, entirely in native Forme flow. */
export function ScientificPaper({ title, theme, authors, affiliations, correspondence, abstract, keywords, titleStyle, citationStyle, references, children }: ScientificPaperProps) {
  const layoutTheme: DocTheme = theme.design ? theme : { ...theme, fontSize: 11, lineHeight: 1.5, paragraphGap: 9 };
  return <Document title={title} author={authors} theme={layoutTheme} references={references} citationStyle={citationStyle}>
    <Page {...themePage(theme, { top: 58, bottom: 58, left: 72, right: 72 })} style={{ lineBreaking: 'greedy', ...theme.design?.page?.style }}>
      {(!theme.design || theme.runningFooter) && <F.Fixed position="footer"><F.Text style={{ fontFamily: theme.body, fontSize: 8, color: theme.muted, textAlign: 'center', ...theme.design?.furniture?.text, ...theme.design?.furniture?.footer }}>{theme.design?.furniture?.pageNumber === 'total' ? '{{pageNumber}} / {{totalPages}}' : '{{pageNumber}}'}</F.Text></F.Fixed>}
      <F.View style={theme.design?.title?.block}>
        <Heading id="paper-title" level={1} baseStyle={{ fontSize: 22, lineHeight: 1.18, textAlign: 'center', marginBottom: 14 }} style={{ ...theme.design?.title?.heading, ...titleStyle }}><TextSlot slot="title" from="title">{title}</TextSlot></Heading>
        {authors && <Paragraph id="paper-authors" role="small" baseStyle={{ fontSize: 11, textAlign: 'center', marginBottom: 6 }} style={theme.design?.title?.byline}><TextSlot slot="authors" from="authors">{authors}</TextSlot></Paragraph>}
        {affiliations && <Paragraph id="paper-affiliations" role="small" baseStyle={{ fontSize: 9.5, textAlign: 'center', color: theme.muted, marginBottom: 6 }} style={theme.design?.title?.byline}><TextSlot slot="affiliations" from="affiliations">{affiliations}</TextSlot></Paragraph>}
        {correspondence && <Paragraph id="paper-correspondence" role="small" baseStyle={{ fontSize: 8.5, textAlign: 'center', color: theme.muted, marginBottom: 6 }} style={theme.design?.title?.byline}><TextSlot slot="correspondence" from="correspondence">{correspondence}</TextSlot></Paragraph>}
      </F.View>
      {(abstract || keywords) && <F.View style={{ marginLeft: 24, marginRight: 24, marginTop: 18, marginBottom: 20 }}>
        {abstract && <Paragraph id="paper-abstract" role="small" baseStyle={{ fontSize: 10, lineHeight: 1.45, marginBottom: keywords ? 10 : 0 }}><Strong>Abstract. </Strong><TextSlot slot="abstract" from="abstract">{abstract}</TextSlot></Paragraph>}
        {keywords && <Paragraph id="paper-keywords" role="small" baseStyle={{ fontSize: 9, lineHeight: 1.4, marginBottom: 0 }}><Strong>Keywords: </Strong><TextSlot slot="keywords" from="keywords">{keywords}</TextSlot></Paragraph>}
      </F.View>}
      <F.View style={{ marginTop: abstract || keywords ? 0 : 18 }}>
        {children}
        <References headingBaseStyle={{ fontSize: 14, marginTop: 20, marginBottom: 8 }} />
      </F.View>
    </Page>
  </Document>;
}

/** Compact heading defaults; authors may override native styles for their manuscript. */
export function PaperHeading({ id, level = 2, style, children }: { id: string; level?: 2 | 3; style?: F.Style; children: ReactNode }) {
  return <Heading id={id} level={level} baseStyle={{ fontSize: level === 2 ? 14 : 11.5, marginTop: 16, marginBottom: 7 }} style={style}><TextSlot slot="children" from="children">{children}</TextSlot></Heading>;
}
