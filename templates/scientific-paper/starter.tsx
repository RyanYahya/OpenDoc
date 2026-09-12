import { ScientificPaper } from '../../templates/scientific-paper';
import { Paragraph } from 'opendoc';
// @ts-ignore The selected local theme module is inserted when this starter becomes a document.
import { theme } from "__OPENDOC_THEME_MODULE__";

const title = "__OPENDOC_TITLE__";
const themeId = "__OPENDOC_THEME__";
export const meta = { title, description: 'A scientific manuscript, ready for your material.', kind: 'research' as const, theme: themeId };
export const provenance = { template: 'templates/scientific-paper/index.tsx' };

export default function Paper() {
  return <ScientificPaper title={title} theme={theme} authors="Author name" abstract="Replace this placeholder with a summary of your manuscript.">
    <Paragraph id="paper-opening">Your manuscript begins here. Replace this placeholder with your own material and choose the sections that fit the research and intended reader.</Paragraph>
  </ScientificPaper>;
}
