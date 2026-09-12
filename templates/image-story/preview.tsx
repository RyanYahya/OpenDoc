import { ImageStory, ImageStoryPage, type ImageStoryLayout } from './index';
import { Pages, Paragraph, Section } from 'opendoc';
import { neutral } from '../../themes';
import { type DocTheme } from 'opendoc/themes';

export const meta = { title: 'Image story', description: 'A neutral layout skeleton. All text and image positions are replaceable placeholders.', kind: 'layout specimen', theme: 'neutral' };
const layouts: {id:ImageStoryLayout; title:string; copy:string}[] = [
  {id:'cover',title:'Document title\ngoes here.',copy:'Subtitle placeholder. Replace with a brief introduction and choose artwork with enough quiet space for the title.'},
  {id:'split-left',title:'Feature title\ngoes here.',copy:'Lead paragraph placeholder. Replace this text with a short introduction alongside a portrait image.'},
  {id:'split-top',title:'Section title\ngoes here.',copy:'Introductory paragraph placeholder. Replace with the context the reader needs after viewing the opening image.'},
  {id:'panorama',title:'Section title goes here.',copy:'Body text placeholder. Explain the relationship between the panoramic image and the smaller inset.'},
  {id:'diptych',title:'Comparison title\ngoes here.',copy:'Body text placeholder. Describe the two images or viewpoints and why they belong together.'},
  {id:'collage',title:'Section title goes here.',copy:'Short text placeholder connecting the three image positions.'},
  {id:'overlay',title:'Feature title\ngoes here.',copy:'Body text placeholder. Replace with concise writing placed on an opaque surface over your chosen image.'},
];

export function Specimen({length='typical',theme=neutral}: {length?:'sparse'|'typical'|'long';theme?:DocTheme} = {}) {
  const sparse = length === 'sparse', long = length === 'long';
  return <ImageStory title={meta.title} theme={theme}>
    {(sparse || long ? layouts.filter(item=>item.id==='split-top') : layouts).map(item=><ImageStoryPage key={item.id} id={`sample-${item.id}`} theme={theme} layout={item.id}
      title={long && item.id==='split-top' ? 'A longer editorial title can change the composition without changing the story' : item.title}
      titleStyle={long && item.id==='split-top' ? {fontSize:29} : undefined}
      eyebrow={sparse ? undefined : item.id.replaceAll('-',' ').toUpperCase()}
      caption="Caption placeholder. Describe the image and provide attribution where appropriate."
      lead={sparse ? undefined : item.copy}/>)}
    {long && <Pages title="The story continues">
      <Section id="long-opening" title="Let the prose flow" lead="Image compositions are moments within a longer document, not containers for every paragraph.">
        {Array.from({length:20},(_,index)=><Paragraph key={index} id={`long-passage-${index+1}`}>{'This is illustrative prose used to demonstrate native pagination. The writing keeps its normal size and reading rhythm while the surrounding image pages remain deliberate pauses. '.repeat(4)}{index===19?' END OF STORY':''}</Paragraph>)}
      </Section>
    </Pages>}
  </ImageStory>;
}
export default Specimen;
