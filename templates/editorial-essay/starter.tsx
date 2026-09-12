import { EditorialEssay } from '../../templates/editorial-essay';
import { Paragraph } from 'opendoc';
// @ts-ignore The selected local theme module is inserted when this starter becomes a document.
import { theme } from "__OPENDOC_THEME_MODULE__";

const title = "__OPENDOC_TITLE__";
const themeId = "__OPENDOC_THEME__";
export const meta = { title, description: 'An editorial essay, ready for your material.', kind: 'article' as const, theme: themeId };
export const provenance = { template: 'templates/editorial-essay/index.tsx' };

export default function Essay() {
  return <EditorialEssay title={title} theme={theme} author="Author name" standfirst="Standfirst — replace this placeholder with your opening summary.">
    <Paragraph id="essay-opening">Your essay begins here. This is placeholder text, ready to be replaced with your own material.</Paragraph>
  </EditorialEssay>;
}
