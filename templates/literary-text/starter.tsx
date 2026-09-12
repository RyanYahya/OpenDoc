import { LiteraryText } from '../../templates/literary-text';
import { Paragraph } from 'opendoc';
// @ts-ignore The selected local theme module is inserted when this starter becomes a document.
import { theme } from "__OPENDOC_THEME_MODULE__";
const title = "__OPENDOC_TITLE__";
const themeId = "__OPENDOC_THEME__";
export const meta = { title, description: 'A literary text, ready for your writing.', kind: 'article' as const, theme: themeId };
export const provenance = { template: 'templates/literary-text/index.tsx' };
export default function Text() {
  return <LiteraryText title={title} theme={theme} author="Author name"><Paragraph id="literary-opening">Your writing begins here. Replace this placeholder with your own opening and let the work take its shape.</Paragraph></LiteraryText>;
}
