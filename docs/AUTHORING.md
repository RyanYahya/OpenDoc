# Authoring documents

Run these commands from your OpenDoc workspace, such as `~/Documents/My OpenDoc`. The installed guides live in `node_modules/opendoc/docs`; paths such as `documents/`, `themes/`, `templates/`, and `output/` below refer to the workspace root. Use `npx opendoc --help` for commands, `--workspace <path>` to choose a workspace explicitly, and `--json` for machine-readable output. From a workspace subfolder, OpenDoc discovers the containing workspace automatically.

The authoring API, full starter library, and commands below are shared by normal OpenDoc and OpenDoc Headless. Headless uses the `opendoc` package alias to preserve imports and guide paths; it needs no browser service. See [Headless](HEADLESS.md) for complete remote production and artifact delivery.

Every document needs a project. Create its initial source and assignment with `npx opendoc create <id> --project <project-id> --title "Title"`, then develop the generated source. Add `--template <template-id>` when using a catalog layout; an ordinary document needs neither a template nor a starter. For imported document folders, use `npx opendoc projects assign <document-id> <project-id>`. See [Projects](PROJECTS.md) for defaults and membership.

Write English or Arabic content (see [Arabic and right-to-left text](#arabic-and-right-to-left-text)), and use local assets and a pure TSX component. OpenDoc owns a small set of document primitives; Forme provides the underlying page layout. Arbitrary HTML, browser CSS, React hooks, and asynchronous component effects do not belong inside document source.

## A complete small document

```tsx
import {
  Document, Pages, TitleBlock, Section, Paragraph, Cite, References,
  type DocumentMeta,
} from 'opendoc';
import { theme } from './theme';

export const meta: DocumentMeta = {
  title: 'A useful technical brief',
  description: 'The decision, its reasoning, and how to check it.',
  kind: 'technical',
  theme: theme.id,
};

export default function Brief() {
  return <Document title={meta.title} theme={theme}
    references={{ forme: { title: 'Forme documentation', url: 'https://docs.formepdf.com/' } }}>
    <Pages title={meta.title} footer="Design notes">
      <TitleBlock id="opening" title={meta.title}
        subtitle="Begin with the decision this document supports." />
      <Section id="context" title="Context" lead="Explain the problem in a short opening.">
        <Paragraph id="reasoning">Develop the reasoning with evidence. <Cite source="forme" /></Paragraph>
      </Section>
      <References />
    </Pages>
  </Document>;
}
```

Use this inside a document created with the command above; retain the generated `theme.tsx` and `assets.json`. This example demonstrates citation mechanics; replace its source and prose with material relevant to the user's brief.

Import document primitives from `opendoc`, asset adapters from `opendoc/assets`, template contracts from `opendoc/template`, and theme types and helpers from `opendoc/themes`. Keep imports of your own documents, templates, themes, and data relative to those workspace files. Do not import OpenDoc's internal `src/` files.

`meta.kind` is an optional nonempty descriptive label, such as `quotation`. Omit it when a category adds nothing. Metadata describes the document; it does not choose its layout or constrain its structure. Themes are discovered from `themes/<id>/`. Use `npx opendoc themes list` and read only the selected theme’s `design.md`, then the needed component source. New documents import the adapted `theme` from `./theme`, preserving the saved asset choices; `meta.theme` must match the `Document` theme ID. Pass this same theme to any template factory before rendering. Civic Spectrum, Field Manual, McKinsey Consulting, and OpenDoc Neutral supply distinct print systems and reusable compositions. Neutral offers a simpler foundation and is the document fallback. See [Themes](THEMES.md).

## Arabic and right-to-left text

PDF output supports Arabic and other right-to-left scripts, including sentences that mix Arabic with English words and numbers. Set the base direction on the theme (`direction: 'rtl'`, `lang: 'ar'`) or on one document (`<Document direction="rtl" lang="ar">`); a `Document` prop wins over the theme. Every paragraph is laid out with the Unicode Bidirectional Algorithm: Arabic letters join, English words and numbers stay left to right inside the Arabic line, brackets are mirrored, and punctuation sits where an Arabic reader expects it. A wrapped paragraph is reordered line by line, so do not reverse words, insert directional marks, or split a sentence into separate runs to force an order.

Arabic text needs no font setup. When a document contains Arabic-script characters that its fonts cannot draw, OpenDoc appends the built-in Noto Naskh Arabic family as the last fallback of every font list, so Arabic words typed into an English paragraph render with joined letters instead of empty boxes, and the English around them keeps its own face. Each run uses the matching weight: regular for body text, semibold for `Strong` and headings, bold for bold text; italic runs use the upright faces. Only the faces the text uses are embedded, and a document without such characters renders exactly as before. A workspace whose asset library lacks `noto-naskh-arabic` (created before it was bundled) gets no automatic fallback and reports the characters as missing glyphs.

To choose the Arabic font yourself, register one in `theme.fonts` (or bind it from the asset library) and list it in `fontFallbacks`, which OpenDoc appends to its own body, heading, label, caption, code, and table families. Theme fallbacks come before the built-in one, so characters the first family lacks come from your font, and English words can keep the Latin face:

```tsx
// Properties inside the theme definition; use a verified local Arabic font.
direction: 'rtl',
lang: 'ar',
fontFallbacks: ['Noto Naskh Arabic'],
fonts: [{ family: 'Noto Naskh Arabic', src: 'themes/acme/assets/NotoNaskhArabic-Regular.ttf', fontWeight: 400, fontStyle: 'normal' }],
```

```tsx
<Paragraph id="update">قمنا بتحديث نظام Microsoft Office في المكتب الرئيسي يوم الأحد.</Paragraph>
<Paragraph id="price">السعر 250 ريال لعام 2026 (شامل VAT).</Paragraph>
<Paragraph id="note" style={{ direction: 'ltr' }}>An English paragraph inside an Arabic document.</Paragraph>
```

Any `fontFamily` may itself be a list of registered families, such as `'Acme Sans, Noto Naskh Arabic'`. A character that no listed font covers, such as a Chinese character in an Arabic sentence, prints as an empty box. The review reports a `missing-glyphs` warning naming the characters and their page or slide, and the reader shows a notice; fix the font list rather than accepting the warning. Other scripts get no automatic fallback, and the renderer currently detects missing glyphs only in paragraphs that contain right-to-left text, so also check the page images.

`direction` is also a native style (`'ltr'`, `'rtl'`, or `'auto'`) for single paragraphs or containers. `auto` takes each paragraph's direction from its first strong letter, which suits mixed collections such as tables of names. Without an explicit `textAlign`, a paragraph aligns to the edge where it starts (right for Arabic); an explicit `textAlign` is kept. `textAlign: 'justify'` widens the spaces between words, never the joins inside Arabic words, and ends with a line aligned to the starting edge. Letter spacing is not applied to Arabic because it would break the joins.

In a right-to-left document, rows start at the right: list markers, table columns (the first column is the rightmost), footer label and page numbers, and other `flexDirection: 'row'` compositions are mirrored. Lists indent and callouts draw their rule on the right. Text columns in `DataTable` default to right alignment and numeric columns to left. `CodeBlock` stays left to right. Padding, margins, borders, and absolute positions remain physical, so a custom composition that relies on `paddingLeft` or `left` should choose the side explicitly; theme components can call `documentDirection()` from `opendoc` inside their render function. Under `auto`, containers keep left-to-right rows while each paragraph follows its own text. Generated labels such as “Figure 1” and “Table 1” remain English. Extracted and copied text follows reading order, although some viewers omit the space where the direction changes; review the exported PDF's page images and extracted text as for any document.

### Bundled Arabic font

Instead of registering a font file, bind the bundled Noto Naskh Arabic family for Arabic body text, and for headings when they are also Arabic:

```sh
npx opendoc assets bind my-report body-font noto-naskh-arabic
npx opendoc assets bind my-report heading-font noto-naskh-arabic
```

It has regular, medium, semibold, and bold faces, so `Strong` works. It has no italics: avoid `Em` and italic styles in Arabic text, because an unavailable style fails instead of being synthesized. The family also contains Latin letters and digits, so a sentence such as “قمنا بتحديث نظام Microsoft Office في المكتب الرئيسي يوم الأحد.” uses one font. See [Assets](ASSETS.md) for its provenance.

### PowerPoint and the browser

In PowerPoint exports, a paragraph is right-to-left when its `direction` style is `rtl`, or when it has no explicit direction and its first strong letter is Arabic or Hebrew. Such paragraphs export with PowerPoint's right-to-left paragraph setting and an Arabic (`ar-SA`) or Hebrew (`he-IL`) language tag, with the same font in the Latin and complex-script slots, so PowerPoint orders and shapes mixed text itself. Words that the PDF draws from a fallback font, such as Arabic from the built-in Noto Naskh Arabic, export as their own runs naming that font in both slots, and the font is embedded, so the deck matches the preview. PowerPoint keeps one regular and one bold face per family, so a deck cannot use both the semibold and the bold face, or the regular and the medium face, of the same fallback family. PowerPoint alignment is physical, and each paragraph exports with the alignment its reviewed PDF lines use. An explicit `left`, `right`, or `center` is kept; without one, a paragraph starts at its own direction's edge, so an English paragraph with `direction: 'ltr'` in a right-to-left deck exports left-aligned without repeating `textAlign: 'left'`. Left-to-right paragraphs keep left-to-right settings. Justified text remains unsupported. Because PowerPoint shapes Arabic itself, check the editable deck in PowerPoint when native rendering is available.

In the browser, comments, text corrections, search, and name fields follow the direction of the text you type, and Arabic titles and comments display right-to-left within the left-to-right app.

## Page structure and reading rhythm

### Presentations

Create a presentation with `npx opendoc create <id> --project <project-id> --title "Title" --format presentation`. It uses the same document folder, theme adapter, assets, media, selection, comments, and text corrections. The format is recorded in `projects.json` before source publication; older entries remain documents. Use the matching root rather than changing the format by swapping components alone.

```tsx
import { Presentation, Slide, Heading, Paragraph } from 'opendoc';
import { theme } from './theme';

export const meta = { title: 'A clear idea', description: '', theme: theme.id };
export default function Deck() {
  return <Presentation title={meta.title} theme={theme}>
    <Slide id="opening">
      <Heading id="opening-title" level={1} style={{ fontSize: 44, lineHeight: 1.1 }}>A clear idea</Heading>
      <Paragraph id="opening-lead" style={{ fontSize: 24 }}>One thought with room to breathe.</Paragraph>
    </Slide>
  </Presentation>;
}
```

Each `Slide` is exactly 960 × 540 points (16:9), with 40-point padding by default. Optional `padding` changes the inset; `style` controls the content composition while canvas dimensions remain fixed. `backgroundMedia`, `backgroundImage`, `backgroundOpacity`, `backgroundSize`, and `backgroundPosition` use the same managed background support as `Page`. Place ordinary native content, `MediaFrame`, and `Logo` inside slides. Use current theme fonts and colors, adapting sizes locally for reading at presentation distance; document typography is not automatically scaled.

Every slide needs a unique stable ID, and component IDs remain unique across the whole deck. Preserve both when reordering. Slides cannot nest or contain `Page`, `Pages`, `PageBreak`, or running header/footer primitives. Put all content inside explicit slides. References and source notes also need room on explicit slides.

Overflow is an error: OpenDoc rejects extra pages, content crossing slide boundaries, off-page visuals/text, and clipped content. It does not silently shrink or discard content. Shorten the material, adjust the composition, or explicitly add another slide. Review the updated PDF after text corrections; a failed revision may leave older successful artifacts or the browser preview available, which do not represent that revision. Discover reusable deck skeletons through `npx opendoc templates list` or the browser's **Templates → Presentations**; `--template <id>` infers their presentation format. See [Templates](TEMPLATES.md#presentation-templates). Current themes supply fonts and colors; compose typography for slides locally.

#### PowerPoint delivery

Presentations are delivered as **PDF and editable PowerPoint by default**, unless the user asks for a single format. The PDF is also the reviewed layout used for PowerPoint export. From the same final source revision, run:

```sh
npx opendoc export <id>
npx opendoc export <id> --format pptx
```

Deliver `output/<id>.pdf` and `output/<id>.pptx`. After a source, media, or font change, regenerate and review the affected output in both formats. Do not mix an updated PDF with an earlier deck. See [the review skill](../.agents/skills/opendoc-review-document/SKILL.md).

Compose for the editable export from the beginning:

- Native text, rectangular shapes, solid borders, and images are supported. Uniform rounded panels remain editable rounded rectangles, with the authored radius in points (clamped to half the shortest side). Their outline must use the same solid width and color on all four sides; borderless rounded fills also work. Text becomes editable boxes with the reviewed line breaks. Images and chart artwork remain images; tables assembled from blocks remain separate objects.
- Rounded containers with `overflow: 'hidden'` and children are not supported in PPTX: separately exported children cannot inherit rounded clipping. Use square corners, or remove clipping when it is unnecessary. PDF review remains available and reports this export limitation.
- Embedded fonts must have TrueType outlines and permit editable embedding. PowerPoint has regular, bold, italic, and bold-italic slots; different faces competing for the same family/style slot cannot be preserved together. Use the exact selected asset faces and verify an early export when introducing custom fonts. Do not silently replace an explicitly chosen font.
- Unsupported effects, including transforms, shadows, gradients, unequal corner radii, nonuniform rounded borders, group opacity, justified text, and custom word spacing, appear as `format: "pptx"` warnings during rendering and review, with a slide, component, and correction where available. These warnings permit PDF review but block PPTX export. There is no silent styling substitution or raster fallback. Font embedding and text-source compatibility are also checked during export; a render without styling warnings does not guarantee export success. Use compatible compositions within the brief; ask if resolving an error would materially change the user's chosen design or editability. Do not flatten the whole slide to work around an editable-export failure.
- Significant edits in PowerPoint can require resizing or reflowing a text box; PowerPoint does not rerun Forme. Inspect native rendering when available, and state verification limits accurately. A successful export or embedded-font record alone is not proof of identical appearance across platforms.

#### Document primitives

| Primitive | Use |
| --- | --- |
| `Document` | One root; title, author, theme, reference records, and citation mode |
| `Pages` | Flowing pages; optional size, margins, running header/footer text, and page numbers |
| `Page` | Custom native page composition, including reliable full-page background colors |
| `Cover` | A deliberate opening page with title, subtitle, footer, and optional stable `idPrefix` |
| `TitleBlock` | A compact title, optional subtitle/byline, and restrained dividing rule |
| `Section` | A heading plus a short lead held together; subsequent children flow naturally |
| `Heading` | Levels 1–3 with automatic PDF bookmarks; `bookmark={false}` suppresses one |
| `Paragraph` | Readable prose with widow/orphan controls and optional whole-block `href` |
| `Block` | A stable feedback target around a custom Forme visual or composition |

Use `Section` for ordinary prose sections. Its lead is deliberately limited to 700 characters; put longer content in normal paragraphs inside the section. Do not place an entire long section, table, or variable data report in an unbreakable container.

`Pages` defaults to the theme's A4 portrait layout. It also accepts Forme page sizes or a custom `{ width, height }` in points, `margin`, `header`, `footer`, and `pageNumbers`. Set header/footer to `false` to suppress them. For custom page compositions import `Page` from OpenDoc, with native Forme primitives inside; it handles the current engine's page-background limitation. Columns are appropriate for short independent material; they are not a promise of sequential magazine text flow. Use a composed opening followed by flowing pages for long publications.

## Tables, figures, lists, and code

`DataTable` takes `columns` and `rows`. Columns have `label`, optional positive `width` weights, and optional `align: 'left' | 'center' | 'right'`. Numeric columns align right automatically. Cells are strings, finite numbers, or transparent text bindings; every row must match the columns. Optional `rowIds` preserve cell targets when records reorder. Optional `caption` and `sourceNote` explain the table. The caption and column headings repeat on continued pages. An empty table displays `emptyMessage` instead of pretending to contain observations.

```tsx
<DataTable id="measurements" caption="Illustrative measurements"
  columns={[{ label: 'Condition', width: 2 }, { label: 'Time (ms)' }]}
  rows={[["Baseline", 24], ["Revised", 19]]}
  sourceNote="Synthetic values for demonstrating table layout." />
```

`Figure` keeps its visual, caption, and optional source note together. Size the visual to fit the available page area. Use managed `Media`, or supported local `Svg` or `Image` content, with useful alternative text. Do not treat a diagram or chart as evidence without identifying its basis. Very long labels and oversized figures require visual review.

OpenDoc rejects native Forme chart components on the current engine: their label encoding is incompatible with OpenDoc's embedded fonts, and changing the chart's font style does not correct it. Generate a local chart asset and place it in `Figure`; review every label, unit, scale, and legend in the exported PDF. Keep the underlying data with the document.

Prefer managed `<Media item="id" width={460} />` inside `Figure` for photos, charts, and diagrams. Each item has its own folder, metadata, and optional prepared data. Leave supplied inputs in the project’s existing organization. Optional source notes identify provenance; OpenDoc does not manage those originals. Read the [media guide](MEDIA.md) before adding or regenerating media.

For exact image rectangles use `<MediaFrame item="id" width={460} height={240} fit="cover" />`; use `fit="contain"` to preserve the whole image, `position={{x:0.5,y:0.5}}` to align the crop, or `radius` for rounded/circular frames. Use `<Page backgroundMedia="id" backgroundSize="cover">` for managed full bleed with native text on top. These follow the same freshness and usage contract as `Media`. See [image placement](MEDIA.md#image-frames-and-full-page-artwork) and the Image story guide at workspace-root `templates/image-story/AGENTS.md` for reviewed starting compositions and renderer limitations.

Direct local image paths resolve relative to the document folder; managed `Media` adds browser discovery and provenance checks. For `documents/cooling-review/chart.png`, use:

```tsx
<Figure id="cooling-chart" caption="Illustrative cooling curves."
  sourceNote="Synthetic measurements; see the accompanying data file.">
  <Image src="./chart.png" alt="Two illustrative temperature curves over 30 minutes."
    style={{ width: 460, height: 260 }} />
</Figure>
```

`List` takes `items: { id, children }[]`, with optional `ordered` and `start`. Record IDs survive reordering. Omit empty lists. Items remain together and the list flows between items; a single item must fit on a page.

For continuous essay text with first-line indentation, use `Prose` as described in [Continuous prose](PROSE.md). It preserves ordinary paragraph IDs and source bindings.

Lists use ordinary text rows because the current engine mismeasures native wrapped list items. Their text and numbering remain selectable, but the PDF does not carry native list structure tags.

`Callout` accepts inline or block children and an optional title. Use it when the reader needs to notice a limitation, decision, or instruction, not as a container for every paragraph.

`Callout` and `Block` accept `keepTogether` to move a short group to the next page when it cannot fit in the remaining space. Their default remains normal splitting. A split callout produces a review warning. `Section` already keeps its heading with its short lead; use that composition for keep-with-next behavior rather than making a whole section unbreakable. A keep-together container taller than the page's body area produces `unbreakable-too-tall`; shorten it or let it split. Keeping content together cannot make an oversized block fit.

For a chip or other label, use `<Paragraph id="status" maxLines={1}>In progress</Paragraph>`. `maxLines` is a positive integer review expectation, not a truncation or sizing instruction: all text remains in the PDF. If the rendered paragraph exceeds the limit (including continuation pages), `line-limit-exceeded` reports its source and bounds. Ordinary paragraphs have no line limit.

`CodeBlock` accepts a literal string, optional `language`/`caption`, and `tabSize` (2, 4, or 8). It uses the bundled monospace face and preserves indentation. Long source lines can wrap; inspect code where wrapping could change how a reader interprets it. Keep executable examples accurate. `Strong` and `Em` use real weight and italic faces from the selected family. Explicitly unavailable styles fail instead of being synthesized.

## Evidence and references

`Document` accepts a `references` object keyed by stable source IDs. Each record needs a `title`. Include an HTTP(S) `url` when one exists; print sources do not need a fabricated link. `author` and `year` are optional for numeric citations and required for author-date citations.

- `<Cite source="key" />` reuses its number on repeated citations. An optional `locator="p. 12"` identifies a page or section of the source.
- `<Document citationStyle="author-date">` uses author/year labels and disambiguates matching author/year pairs.
- `<References />` includes all cited sources, even when the list is placed before a citation in source. Prefer placing it at the end for readers. Omitting the list when citations exist is an error.
- `<CrossReference target="measurements" />` resolves a figure/table number or heading/section title, including forward references. Unknown targets fail instead of showing a fabricated label. Referenced tables need visible captions; inconsistent manually numbered captions fail clearly.
- `<Note id="method-detail">Additional explanation.</Note>` creates an inline marker; `<Notes />` prints the endnotes. The notes section is required when notes exist.

These are simple numeric and author-date formats, not a complete citation-style processor. Cross-references identify labels rather than page numbers. Reference-list entries carry working PDF links; Forme 0.20.1 does not emit working annotations for inline link runs. Use `Paragraph href` for a whole-block link.

OpenDoc validates reference records and relationships. It does not verify whether a source supports a claim, whether a calculation is correct, or whether a study design is sound. Keep synthetic examples, measured observations, and inference distinct.

## Durable feedback

Every commentable block needs a unique, stable `id`. Preserve it when rewriting or moving the same idea; assign a new ID to a different idea. Avoid IDs derived from page numbers or array positions.

Selections can identify individual phrases within those blocks. Literal document-owned text supports quick corrections, including literal props passed to helper components in the same file. Shared components in other files and instance data use transparent `TextSlot` bindings. Preserve slot and record IDs alongside block IDs. See [Selection and quick corrections](SELECTION.md) for the binding and agent-context contract.

Composite primitives reserve their child IDs. `TitleBlock id="opening"` creates `opening-title`, `opening-subtitle`, and `opening-byline` when present. `Section id="method"` creates `method-heading` and `method-lead`. `List id="steps"` combines its ID with each item ID. `Cover` defaults to the `cover-` prefix; choose another prefix for a second cover. References reserve `reference-<source-id>` and notes reserve `note-<note-id>`.

Data-driven reports should export provenance identifying their shared template and their own data file. See the monthly report contract at workspace-root `templates/monthly-report/README.md` and the [opendoc-create-template skill](../.agents/skills/opendoc-create-template/SKILL.md). A content correction belongs in the instance data; a layout change may affect every instance.

## Finish at the PDF

Run `npx opendoc check`. `npx opendoc review <id> --json` prepares a fresh PDF, page images, extracted text, and structured review evidence without a browser; save intended browser corrections first when using it in normal OpenDoc. Inspect every page at readable size, read render issues, and check representative text, including symbols, code, and the final rows of long tables. Verify references and links that matter to the document. Revise as needed, then use `npx opendoc export <id>` to deliver the final unchanged revision. Presentations also need the requested PowerPoint export described above. Remote agents deliver accessible files through their existing channel; the recipient needs no OpenDoc installation.

The geometry checks reject concrete off-page content, clipping, and header/footer overlap. They allow deliberate page backgrounds and do not enforce an aesthetic template. Warnings identify overlaps between distinct text blocks, body content entering the footer band without touching footer text, explicit line-limit violations, split callouts, oversized keep-together containers, possible stranded headings, and empty pages. Text overlap is a warning because layered compositions can be intentional; backgrounds and text over images are not treated as text collisions. These are aids to review, not a guarantee of perfect formatting or accessibility conformance.

`review <id> --json` includes each page's `elements`: rendered bounds in page points, parent bounds, local offsets from that parent, clipping ancestors, line counts, stable block IDs, and source locations. Tree `path` and `parentPath` identify nodes only within that render; use `blockId` for durable identity. A hidden ancestor is reflected in `hidden`. Bounds describe layout boxes, not exact glyph outlines, rounded clipping paths, or an independent rendering of PowerPoint. The page images remain the visual evidence.
