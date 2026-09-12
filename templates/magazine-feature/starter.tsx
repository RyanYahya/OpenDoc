import { MagazineFeature } from '../../templates/magazine-feature';
import { Paragraph } from 'opendoc';
// @ts-ignore The selected local theme module is inserted when this starter becomes a document.
import { theme } from "__OPENDOC_THEME_MODULE__";

const title = "__OPENDOC_TITLE__";
const themeId = "__OPENDOC_THEME__";
export const meta = { title, description: 'A magazine feature, ready for your material.', kind: 'article' as const, theme: themeId };
export const provenance = { template: 'templates/magazine-feature/index.tsx' };

export default function Feature() {
  return <MagazineFeature title={title} theme={theme} kicker="FEATURE" author="Author name" standfirst="Standfirst — replace this placeholder with an introduction to your feature.">
    <Paragraph id="feature-opening">Your feature begins here. Replace this placeholder with your own material; add photographs, quotations, and further passages where the story needs them.</Paragraph>
  </MagazineFeature>;
}
