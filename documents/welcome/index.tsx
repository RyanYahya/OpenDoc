import {
  Document, Block, Paragraph, Heading, Section, Callout, Figure, Media, Logo,
  DataTable, Strong, Em, Cite, CrossReference, Note, Notes, References, CodeBlock,
  View, type DocumentMeta,
} from 'opendoc';
import { NeutralPages, NeutralOpening, NeutralColumns, NeutralQuote, PaperStudy } from '../../themes/opendoc-neutral/components';
import { colors, metrics } from '../../themes/opendoc-neutral';
import { theme } from './theme';
import studio from './media/studio-rhythm/data.json';

export const meta: DocumentMeta = {
  title: 'Welcome to OpenDoc',
  description: 'An illustrated guide to making beautiful documents: expressive layouts, generated imagery, detailed charts, shared assets, feedback, and a reviewed PDF.',
  kind: 'field guide',
  theme: theme.id,
};
const stageKeys = ['research', 'drafting', 'design', 'review'] as const;
const stageTotals = stageKeys.map(key => studio.documents.reduce((sum, row) => sum + row[key], 0));
const totalHours = stageTotals.reduce((sum, value) => sum + value, 0);
const tableRows = stageKeys.map((key, index) => [key[0].toUpperCase() + key.slice(1), stageTotals[index], `${(stageTotals[index] / totalHours * 100).toFixed(1)}%`]);

export default function Welcome() {
  return <Document title={meta.title} author="OpenDoc" theme={theme} references={{
    workspace: { author: 'OpenDoc', title: 'Workspace guide. Local file: README.md', year: '2026' },
    authoring: { author: 'OpenDoc', title: 'Authoring documents. Local file: docs/AUTHORING.md', year: '2026' },
    assets: { author: 'OpenDoc', title: 'Media & Assets. Local files: docs/ASSETS.md and docs/MEDIA.md', year: '2026' },
  }}>
    <NeutralPages title="Welcome" label="OpenDoc / A field guide" header={false}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 48 }}>
        <Block id="welcome-brand"><Logo width={144} /></Block>
        <Paragraph id="welcome-edition" role="label" style={{ color: colors.muted, textAlign: 'right', marginBottom: 0 }}>{'A FIELD GUIDE\nEDITION 01 / 2026'}</Paragraph>
      </View>
      <NeutralOpening id="welcome-opening" eyebrow="THE POSSIBILITIES START HERE" title={'Welcome to\nOpenDoc.'} subtitle="A local place to make documents you are proud to share." display />
      <Paragraph id="welcome-introduction" style={{ width: 385, marginTop: 6, marginBottom: 36 }}>Bring your idea and material. Work with your preferred agent to develop the writing and design. OpenDoc turns that work into a PDF you can read, refine, and make your own.</Paragraph>
      <PaperStudy id="welcome-paper-study" />
      <Paragraph id="welcome-cover-caption" role="small" style={{ marginTop: 20 }}>This document is the demonstration: real type, real layouts, real images, and the same PDF you can export.</Paragraph>
    </NeutralPages>

    <NeutralPages title="Begin with an idea" label="OpenDoc / A field guide">
      <NeutralOpening id="welcome-begin" eyebrow="01 / BEGIN" title="Give good work a home." subtitle="Start with a reader, a purpose, and the material you already have." />
      <NeutralColumns left={<>
        <Section id="welcome-projects" title="Give your work a home" lead="Every document belongs to a project." style={{ marginTop: -20 }}>
          <Paragraph id="welcome-project-settings">Use the + beside Projects to create a home for a client, a course, or a body of work. Choose a default theme when you want new documents to start consistently.</Paragraph>
        </Section>
        <Section id="welcome-create" title="Give your agent a brief" lead="Name the reader, the purpose, and the material you want to use.">
          <Paragraph id="welcome-starters">Create document gives you a prompt with your project included. Paste it into your coding agent and add your brief. As the agent changes the local source, OpenDoc refreshes the PDF.</Paragraph>
          <Callout id="welcome-example-brief" title="A brief you can use">Write a two-page proposal from my notes. Explain the work and the next decision; flag missing prices. Keep the writing direct. Review every PDF page before handing it back.</Callout>
        </Section>
      </>} right={<>
        <Section id="welcome-layout" title="Choose a starting point" lead="Templates supply a page structure. Themes supply its visual character." style={{ marginTop: -20 }}>
          <Paragraph id="welcome-templates">Browse real PDF specimens in Templates and Themes. Use this template starts from a layout you like. View AGENTS.md explains how your agent can adapt it. A custom composition is always possible.</Paragraph>
        </Section>
        <Heading id="welcome-library-heading" level={2}>Find your way around</Heading>
        <Paragraph id="welcome-library-tools">Documents shows all your work; a project shows just its own documents. Search by name and switch between gallery and list views. Choose light, dark, or system appearance for the app.</Paragraph>
        <Paragraph id="welcome-library-actions">The document menu lets you rename, duplicate, move, or delete a document. Deletion offers Undo. Renaming its library entry leaves the authored PDF title unchanged.</Paragraph>
        <Paragraph id="welcome-appearance-note" role="small">App appearance changes the workspace. Your document keeps its own page colors, typography, and artwork. <Cite source="workspace" /></Paragraph>
      </>} />
    </NeutralPages>

    <NeutralPages title="Make room for imagery" label="OpenDoc / A field guide" surface="dark">
      <NeutralOpening id="welcome-imagery" eyebrow="02 / IMAGINE" title="Ideas taking form." subtitle="A picture can carry a mood, explain a process, or give an idea a physical presence." surface="dark" />
      <Block id="welcome-paper-architecture">
        <Media item="paper-architecture" width={metrics.measure} />
        <Paragraph id="welcome-image-caption" role="caption" style={{ color: colors.inverseMuted, marginTop: 12, marginBottom: 24 }}>Ideas taking form. An AI-generated editorial illustration made with Imagegen for this guide. The imagined paper sculpture is an illustration, not documentary evidence.</Paragraph>
      </Block>
      <NeutralColumns left={<>
        <Heading id="welcome-image-direction" level={2} style={{ color: colors.inverse, marginTop: 0 }}>Give the image a job</Heading>
        <Paragraph id="welcome-image-direction-copy" style={{ color: colors.inverse }}>Ask your agent for an image that serves the document. Describe the subject, composition, atmosphere, and space it needs on the page.</Paragraph>
      </>} right={<>
        <Heading id="welcome-image-record" level={2} style={{ color: colors.inverse, marginTop: 0 }}>Keep the story with it</Heading>
        <Paragraph id="welcome-image-record-copy" style={{ color: colors.inverse }}>This image lives in the document’s Media folder with a title, description, alternative text, attribution, and its original prompt. Open Media & Assets to inspect it.</Paragraph>
      </>} />
    </NeutralPages>

    <NeutralPages title="Read the evidence" label="OpenDoc / A field guide" surface="white">
      <NeutralOpening id="welcome-evidence" eyebrow="03 / EXPLAIN" title="Let the evidence lead." />
      <Paragraph id="welcome-chart-introduction" style={{ marginBottom: 4 }}>A fictional studio, 24 documents, 12 weeks: one dataset and three coordinated views.</Paragraph>
      <Figure id="welcome-studio-chart" caption="Weekly effort, workstream totals, and document length against effort." sourceNote="Synthetic values, not a productivity benchmark. Each dot is a fictional document; blue highlights one example." style={{ marginBottom: 8 }}>
        <Media item="studio-rhythm" width={metrics.measure} />
      </Figure>
      <DataTable id="welcome-workstream-table" caption="The key values, as selectable text" columns={[{ label: 'Workstream', width: 2 }, { label: 'Hours', align: 'right' }, { label: 'Share', align: 'right' }]} rows={tableRows} rowIds={[...stageKeys]} sourceNote={`Illustrative total: ${totalHours} hours. Prepared data, plot recipe, and a vector original are saved with the chart.`} />
    </NeutralPages>

    <NeutralPages title="Compose the page" label="OpenDoc / A field guide">
      <NeutralOpening id="welcome-composition" eyebrow="04 / COMPOSE" title="A page can change its pace." subtitle="A clear grid gives you freedom to vary the reading experience." />
      <NeutralColumns ratio="narrow-left" left={<>
        <Paragraph id="welcome-type-label" role="label">TWO VOICES</Paragraph>
        <Paragraph id="welcome-type-sans" style={{ fontSize: 70, fontWeight: 600, lineHeight: 1, letterSpacing: -3, color: colors.blue, marginBottom: 4 }}>Aa</Paragraph>
        <Paragraph id="welcome-type-sans-caption" role="small" style={{ marginBottom: 22 }}>Sans for a clear, direct voice.</Paragraph>
        <Paragraph id="welcome-type-serif" style={{ fontFamily: 'OpenDoc Serif', fontStyle: 'italic', fontSize: 70, lineHeight: 1, letterSpacing: -2, marginBottom: 4 }}>Aa</Paragraph>
        <Paragraph id="welcome-type-serif-caption" role="small">Serif italic for a reflective passage.</Paragraph>
      </>} right={<>
        <Heading id="welcome-reading-path" level={2} style={{ marginTop: 0 }}>Make the reading path clear</Heading>
        <Paragraph id="welcome-reading-path-copy">This page uses an asymmetric one-to-two grid. The narrow column introduces the type; the wider column carries the explanation. Earlier pages use equal columns. The image page gives almost the whole width to one visual.</Paragraph>
        <Paragraph id="welcome-emphasis">Use <Strong>weight</Strong> to establish hierarchy and <Em>italic</Em> for a change of voice. Let long paragraphs and tables continue naturally. Short independent pieces can sit beside one another without forcing an entire report into a fixed page count.</Paragraph>
        <Paragraph id="welcome-cross-references">References can stay connected as the document changes. <CrossReference target="welcome-studio-chart" /> and <CrossReference target="welcome-workstream-table" /> resolve from stable labels, rather than manually typed numbers. <Cite source="authoring" /><Note id="welcome-demo-basis">The chart data and studio examples in this guide are synthetic. The paper sculpture was AI-generated. The guide’s quotations are original OpenDoc copy.</Note></Paragraph>
      </>} />
      <NeutralQuote id="welcome-house-quote" attribution="Original OpenDoc house copy">A document can be rigorous and still feel alive.</NeutralQuote>
      <DataTable id="welcome-layout-options" caption="Choose a structure that serves the material" columns={[{ label: 'Composition', width: 1.1 }, { label: 'Useful for', width: 2 }]} rows={[["One reading column", 'A sustained argument, essay, or long report'], ["Two equal columns", 'Parallel ideas, paired explanations, or a concise comparison'], ["A one-to-two split", 'A marginal note beside the main argument']]} rowIds={['single', 'equal', 'asymmetric']} />
    </NeutralPages>

    <NeutralPages title="Keep your materials close" label="OpenDoc / A field guide">
      <NeutralOpening id="welcome-asset-opening" eyebrow="05 / KEEP" title="A home for every asset." subtitle="Reusable identity and document-specific evidence belong together in the workspace." />
      <Block id="welcome-asset-wordmark" style={{ paddingTop: 12, paddingBottom: 24, borderTopWidth: 0.6, borderBottomWidth: 0.6, borderColor: colors.rule, marginBottom: 24 }}>
        <Logo width={220} />
        <Paragraph id="welcome-wordmark-guidance" role="small" style={{ marginTop: 8, marginBottom: 0 }}>The existing OpenDoc wordmark, imported into the shared Logos library and bound to this document. This dark artwork is placed on a light page.</Paragraph>
      </Block>
      <NeutralColumns left={<>
        <Section id="welcome-assets" title="Share the identity" lead="Import reusable logos and fonts once." style={{ marginTop: -20 }}>
          <Paragraph id="welcome-shared-assets">Add named logo variations with guidance for the surfaces they suit. Import original static font faces and inspect the real PDF specimen before choosing them for a document.</Paragraph>
          <Paragraph id="welcome-asset-defaults">Theme defaults help new documents start consistently. Each document keeps its saved asset choices until you explicitly update them. A newer logo or font version does not silently replace the one in this PDF.</Paragraph>
        </Section>
      </>} right={<>
        <Heading id="welcome-media-heading" level={2} style={{ marginTop: 0 }}>Keep the evidence local</Heading>
        <Paragraph id="welcome-media">Images and charts belong to their document. Keep prepared data, recipes, and attribution beside each visual. Original references can stay wherever you already manage them.</Paragraph>
        <Paragraph id="welcome-media-browse">Search Media by title, kind, or document. Its detail view shows where an image is used, its prepared files, and its source notes. Ask the agent to regenerate a chart when the underlying data changes.</Paragraph>
        <Paragraph id="welcome-media-freshness">OpenDoc detects changes to recorded visual inputs. A derived image must be regenerated, reviewed, and recorded before the revised document can export. <Cite source="assets" /></Paragraph>
      </>} />
      <DataTable id="welcome-media-files" caption="What travels with this chart" columns={[{ label: 'Prepared file', width: 1.1 }, { label: 'Why it matters', width: 2 }]} rows={[["Editable data", 'The 24 records behind the figure'], ["Plot recipe", 'A reproducible way to draw the same comparison'], ["Image + vector original", 'A reviewed PDF image and an editable visual source']]} rowIds={['data', 'recipe', 'artwork']} />
    </NeutralPages>

    <NeutralPages title="Read, notice, revise" label="OpenDoc / A field guide" surface="white">
      <NeutralOpening id="welcome-review-opening" eyebrow="06 / REFINE" title="The next draft is yours." />
      <NeutralColumns left={<>
        <Section id="welcome-review" title="Read, notice, revise" lead="Review the PDF as your reader will encounter it." style={{ marginTop: -20 }}>
          <Paragraph id="welcome-reader-tools">Use page thumbnails, the outline, and zoom. Select text or a component to inspect it. Check the argument, the figures, and the final page; accurate facts and useful sources still need your judgment.</Paragraph>
          <Paragraph id="welcome-comments">Choose Edit or Comment from the selection controls. Make several wording corrections, use Undo or Redo, then Save all. The bottom-right comments button opens saved feedback.</Paragraph>
        </Section>
      </>} right={<>
        <Heading id="welcome-practice-heading" level={2} style={{ marginTop: 0 }}>Try a small correction</Heading>
        <Paragraph id="welcome-edit-practice" style={{ fontSize: 15, lineHeight: 1.45, borderLeftWidth: 2, borderColor: colors.blue, paddingLeft: 14 }}>This sentence is ready for your first edit.</Paragraph>
        <Paragraph id="welcome-feedback">Select the sentence above and change a word. Use comments for work that needs the agent’s judgment: rewriting a passage, checking a source, or improving a layout. Ask the agent to apply the saved feedback.</Paragraph>
        <Paragraph id="welcome-feedback-history" role="small">Saved corrections reach the local source. Comments retain their history. Formatting, structure, and calculations remain agent work.</Paragraph>
      </>} />
      <CodeBlock id="welcome-native-example" language="tsx" caption="For the curious: a real, editable paragraph starts simply">{'<Paragraph id="my-opening">\n  Begin with the idea you want to share.\n</Paragraph>'}</CodeBlock>
      <Paragraph id="welcome-code-caption" role="small">Your coding agent works in TSX with native PDF components. You can direct the writing and design in ordinary language.</Paragraph>
      <References title="The local guides behind this tour" headingStyle={{ fontSize: 12, marginTop: 14, marginBottom: 8 }} />
      <Notes title="About the demonstration" />
    </NeutralPages>

    <NeutralPages title="Export the work" label="OpenDoc / A field guide" surface="dark">
      <NeutralOpening id="welcome-closing" eyebrow="07 / SHARE" title={'Made here.\nReady to share.'} subtitle="Export the version you have read, checked, and made your own." surface="dark" display />
      <View style={{ width: 48, height: 4, backgroundColor: colors.blue, marginTop: 8, marginBottom: 30 }} />
      <Block id="welcome-export">
        <Heading id="welcome-export-heading" level={2} style={{ color: colors.inverse }}>Export the version you reviewed</Heading>
        <Paragraph id="welcome-export-lead" style={{ color: colors.inverse }}>Save pending text corrections and review the updated PDF first.</Paragraph>
        <Paragraph id="welcome-export-details" style={{ color: colors.inverse }}>Choose Export, name the file, and select Save PDF. OpenDoc saves it in the workspace’s output folder. Download a copy lets the browser save another copy; open the PDF to print, reveal it in your files, or copy the PDF file on macOS.</Paragraph>
      </Block>
      <NeutralColumns style={{ marginTop: 12 }} left={<>
        <Heading id="welcome-history-heading" level={2} style={{ color: colors.inverse, marginTop: 0 }}>Keep the versions</Heading>
        <Paragraph id="welcome-export-history" style={{ color: colors.inverse }}>Previous exports keeps the files you saved. Open, reveal, or remove a saved export with Undo. A later edit to the document does not change an earlier PDF.</Paragraph>
      </>} right={<>
        <Heading id="welcome-ready-heading" level={2} style={{ color: colors.inverse, marginTop: 0 }}>Wait for a ready revision</Heading>
        <Paragraph id="welcome-render-recovery" style={{ color: colors.inverse }}>If a revision fails to render, the last successful preview stays visible with an error. Fix the current revision before exporting it.</Paragraph>
      </>} />
      <Paragraph id="welcome-local-files" style={{ color: colors.inverseMuted, marginTop: 30 }}>Your source, assets, feedback, and PDFs stay local. OpenDoc has no built-in AI chat; you choose the external agent and what you share with it. Keep the workspace in your backup routine or version control.</Paragraph>
      <Paragraph id="welcome-final-invitation" style={{ color: colors.inverse, fontFamily: 'OpenDoc Serif', fontStyle: 'italic', fontSize: 23, lineHeight: 1.3, marginTop: 24 }}>Now bring an idea worth putting on a page.</Paragraph>
    </NeutralPages>
  </Document>;
}
