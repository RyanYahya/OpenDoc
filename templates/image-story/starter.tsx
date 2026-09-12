import { ImageStory, ImageStoryPage } from '../../templates/image-story';
import { Pages, Paragraph, Section } from 'opendoc';
// @ts-ignore The selected local theme module is inserted when this starter becomes a document.
import { theme } from "__OPENDOC_THEME_MODULE__";

const title = "__OPENDOC_TITLE__";
export const meta = { title, description: 'An image-led document, ready for your material.', kind: 'illustrated feature', theme: "__OPENDOC_THEME__" };
export const provenance = { template: 'templates/image-story/index.tsx' };

export default function Story() {
  return <ImageStory title={title} theme={theme}>
    {/* Import and review document-owned media, then add image={{item:'your-image'}}.
        Missing image props intentionally show a placeholder; named items must exist.
        Choose split-top for a longer title, or adjust titleStyle after reviewing the PDF. */}
    <ImageStoryPage id="opening" theme={theme} layout="split-top" title={title} eyebrow="ILLUSTRATED FEATURE">
      <Paragraph id="opening-lead">Replace this placeholder with a short introduction. Choose an image that adds meaning to the story and a crop that preserves its subject.</Paragraph>
    </ImageStoryPage>
    <Pages title={title}>
      <Section id="story" title="Continue the story" lead="Long passages belong in ordinary flowing pages.">
        <Paragraph id="story-opening">Replace this placeholder with your material. Add selected image-story compositions where they help the reader, using stable IDs and document-owned images. There is no required sequence or page count.</Paragraph>
      </Section>
    </Pages>
  </ImageStory>;
}
