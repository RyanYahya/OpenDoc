import type { ReactNode } from 'react';
import * as F from '@formepdf/react';
import { TextSlot, Document, Heading, Paragraph, References, Page } from 'opendoc';
import { themePage, type DocTheme } from 'opendoc/themes';

export interface MagazineFeatureProps {
  title: string;
  theme: DocTheme;
  kicker?: string;
  standfirst?: ReactNode;
  author?: string;
  hero?: ReactNode;
  children: ReactNode;
  references?: Parameters<typeof Document>[0]['references'];
}

/** Native flowing blocks: a broad opening followed by an offset reading column. */
export function MagazineFeature({ title, theme, kicker, standfirst, author, hero, children, references }: MagazineFeatureProps) {
  const layoutTheme: DocTheme = theme.design ? theme : { ...theme, fontSize: 11, lineHeight: 1.5, paragraphGap: 10 };
  return <Document title={title} author={author} theme={layoutTheme} references={references}>
    <Page {...themePage(theme, { top: 48, bottom: 58, left: 48, right: 48 })} style={{ lineBreaking: 'greedy', ...theme.design?.page?.style }}>
      {(!theme.design || theme.runningFooter) && <F.Fixed position="footer"><F.Text style={{ fontFamily: theme.body, fontSize: 8, color: theme.muted, textAlign: 'right', ...theme.design?.furniture?.text, ...theme.design?.furniture?.footer }}>{theme.design?.furniture?.pageNumber === 'total' ? '{{pageNumber}} / {{totalPages}}' : '{{pageNumber}}'}</F.Text></F.Fixed>}
      <F.View style={theme.design?.title?.block}>
        {kicker && <Paragraph id="feature-kicker" role="label" baseStyle={{ fontSize: 9, letterSpacing: 1.4, color: theme.accent, marginBottom: 14 }} style={theme.design?.title?.eyebrow}>{theme.design?.title?.uppercaseEyebrow ? kicker.toUpperCase() : <TextSlot slot="kicker" from="kicker">{kicker}</TextSlot>}</Paragraph>}
        <Heading id="feature-title" level={1} baseStyle={{ fontSize: 52, lineHeight: 1.06, marginBottom: 18 }} style={theme.design?.title?.heading}><TextSlot slot="title" from="title">{title}</TextSlot></Heading>
        {standfirst && <Paragraph id="feature-standfirst" role="lead" baseStyle={{ fontSize: 17, lineHeight: 1.35, marginBottom: 18 }} style={theme.design?.title?.subtitle}><TextSlot slot="standfirst" from="standfirst">{standfirst}</TextSlot></Paragraph>}
        {author && <Paragraph id="feature-byline" role="small" baseStyle={{ fontSize: 9, color: theme.muted, marginBottom: 20 }} style={theme.design?.title?.byline}><TextSlot slot="author" from="author">{author}</TextSlot></Paragraph>}
      </F.View>
      {hero}
      <F.View style={{ marginLeft: 96, marginTop: 18 }}>
        {children}
        <References headingBaseStyle={{ fontSize: 11, marginTop: 24, marginBottom: 10 }} />
      </F.View>
    </Page>
  </Document>;
}

/** A flowing display quote. It stays in normal reading order and may span pages. */
export function FeatureQuote({ id, children }: { id: string; children: ReactNode }) {
  return <Paragraph id={id} role="lead" baseStyle={{ fontSize: 24, lineHeight: 1.25, marginTop: 16, marginBottom: 24, marginRight: 36 }}><TextSlot slot="children" from="children">{children}</TextSlot></Paragraph>;
}
