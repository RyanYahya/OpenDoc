import { Paragraph } from 'opendoc';
import { neutral } from '../../themes';
import { type DocTheme } from 'opendoc/themes';
import { LiteraryText, SceneBreak } from './index';

export const meta = { title: 'Literary text', description: 'A Neutral reading specimen with placeholder prose.', kind: 'article' as const, theme: 'neutral' };
const paragraph = 'This is placeholder prose for the reading column. It makes the shape of a passage visible: the length of a line, the pause between paragraphs, and the quiet space around the text. In an authored work, the writer’s own sentences would set the pace. The page should support that voice and let a long passage continue naturally, without asking the writer to fit the story into a predetermined outline.';

export function Specimen({ length = 'typical', theme = neutral }: { length?: 'sparse' | 'typical' | 'long'; theme?: DocTheme } = {}) {
  const sparse = length === 'sparse';
  return <LiteraryText title={meta.title} theme={theme} author={sparse ? undefined : 'Author name'} epigraph={sparse ? undefined : 'An optional epigraph can sit here. This is a layout placeholder, not a quotation.'}>
    {Array.from({ length: sparse ? 1 : length === 'long' ? 15 : 3 }, (_, index) => <Paragraph key={index} id={`specimen-paragraph-${index + 1}`}>{paragraph}</Paragraph>)}
    {!sparse && <>
      <SceneBreak id="specimen-scene" lead="The next scene begins with this short placeholder paragraph. Its marker remains with it when a page turns." />
      <Paragraph id="specimen-continuation">{paragraph}</Paragraph>
      <Paragraph id="specimen-ending">This last passage shows the closing rhythm of the page. The writing can finish here or continue into another scene, in the author's own form.</Paragraph>
    </>}
  </LiteraryText>;
}
export default Specimen;
