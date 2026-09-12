# Document media

Each document owns its prepared media. OpenDoc embeds and previews those visuals; the project and coding agent manage original reference material. There is no source library or required source-folder layout. Reusable logos and fonts belong in the shared **Logos** and **Fonts** tabs of **Media & Assets**; see [Assets](ASSETS.md). Do not copy those families into each document's media folder.

Run commands from the workspace root. The paths below refer to that workspace, not the installed package containing this guide.

```text
documents/cooling-curves/
  index.tsx
  media/
    cooling-curves/
      meta.json                 title, description, file and relationships
      image.png                 the embedding image
      data.json                 rows prepared for this chart
      recipe.py                 optional reproducible preparation
      generation.json           recorded image and input hashes
    temperature-drop/
      ...                       another view of the same source
```

Original datasets, supplied PDFs, previous drafts, and reference documents stay wherever the surrounding project manages them. Do not copy or move originals just to satisfy OpenDoc. Several documents may use the same original. Prepared selections, calculations, chart specifications, and editable diagram files belong beside the image that uses them. The coding agent interprets the originals, prepares visuals, and checks evidence and attribution.

## Describe a visual

Every `media/<id>/meta.json` requires `title`, `description`, `file`, and `kind`. IDs use lowercase words separated by single hyphens. `kind` is `photo`, `illustration`, `chart`, `diagram`, or `image`.

```json
{
  "title": "Temperature over time",
  "description": "Two illustrative cooling curves from one synthetic dataset.",
  "file": "image.png",
  "kind": "chart",
  "alt": "Cup A falls from 80 to 53 degrees Celsius; Cup B falls to 62.",
  "sources": ["Project teaching dataset; synthetic, not measured"],
  "data": "data.json",
  "recipe": "recipe.py",
  "attribution": "Synthetic teaching example; no experiment was conducted."
}
```

`alt`, `sources`, `data`, `recipe`, and `attribution` are optional. `sources` contains descriptive provenance notes or locations for the author: OpenDoc displays the text but never resolves, downloads, hashes, or requires those files. Existing source-path notes remain valid. `file`, `data`, and `recipe` identify owned files relative to the media item; parent traversal, hidden paths, and symlinks are rejected for these files. Unknown fields are rejected. Titles are limited to 200 characters; descriptions and each source note to 4,000.

PNG and JPEG are the supported media embedding formats, up to 50 MB and 100 megapixels. Preserve an SVG or other editable original alongside a PNG export; arbitrary SVG text rendering is not reliable in the current PDF engine. Shared logos have their own SVG/PNG import path with automatic PNG preparation; use [Assets](ASSETS.md) for those. Use an image large enough for its printed size—about 300 pixels per inch for charts—and inspect labels at actual reading size. Keep important chart values in a selectable table as well: raster chart labels are image pixels in the PDF.

## Add, generate, and review

Use the existing image tool or a suitable chart/diagram tool to produce the visual. The media contract does not choose a generator, run recipes automatically, or install their dependencies. Choose tools already available for the task. Keep any recipe reproducible and resolve its files from its own location. Sample documents are not a required dependency.

```sh
npx opendoc media import my-report overview --file /path/to/image.png --title "Overview" --description "The main stages." --kind diagram
```

Media imports copy an image and refuse to overwrite an existing media folder. Media is added by the agent from chat attachments, generated visuals, or downloaded images. The app browses these document-owned folders and edits their details; it has no media upload form. An ordinary photograph can consist of only an image and metadata. For generated work, add the prepared data and recipe before recording it. Add provenance notes when useful. Editing a title, description, or other metadata in the app never records a generated visual as reviewed.

After generating, review the actual image for values, labels, scales, units, and provenance. Then record the reviewed inputs:

```sh
npx opendoc media record my-report overview
npx opendoc media check my-report overview
```

`record` snapshots file hashes; it does not generate or validate a chart. Never use it just to silence a stale warning. Changing prepared data, a recipe, or a recorded image marks the item as needing regeneration. Regenerate and review the affected images, then record their new versions. Original-source changes are the author’s responsibility; OpenDoc does not infer whether they require a new chart or a revised argument. Images with inputs but no generation record also require review and recording.

## Place it in the PDF

```tsx
<Figure id="overview-figure" caption="The main stages." sourceNote="Based on the supplied reference.">
  <Media item="overview" width={460} />
</Figure>
```

Import `Media` from `opendoc` with the other document primitives. Width is a positive value in PDF points. An optional positive `height` sets a maximum bound; the image keeps its aspect ratio. Alternative text defaults to metadata, or can be supplied as `alt`. Preserve the enclosing Figure ID when replacing an image so feedback stays attached.

The document cannot export a stale or unrecorded derived image. Its previous successful preview remains visible, with the current error. After recording, export and review the actual PDF, including caption placement and adjacent page breaks. Raw `Image` and vector `Svg` primitives remain available, but only managed media items appear in the Media browser and receive these provenance checks. For pictures inside SVG layouts, use the frame support below.

## Image frames and full-page artwork

Use `Media` when an image should keep its natural proportions inside a maximum bound. Use `MediaFrame` when the layout needs an **exact rectangle**. It supports `cover` (default: proportional crop) or `contain` (whole image, transparent unused space), normalized `position` (`0` left/top, `0.5` center, `1` right/bottom), and an optional `radius` in PDF points. Width and height are required. Dimensions in `style` do not override them.

```tsx
import { Block, Figure, MediaFrame, Page, Heading, Paragraph } from 'opendoc';

<Figure id="opening-scene" caption="A supplied photograph of the site.">
  <MediaFrame item="site" width={490} height={240}
    fit="cover" position={{x:0.65,y:0.5}} />
</Figure>

// A circular crop. Use containment for diagrams and images whose labels must stay visible.
<Block id="portrait"><MediaFrame item="portrait" width={160} height={160} radius={80}/></Block>

// Artwork reaches the page edges; the margin only reserves room for the native text.
<Page size="A4" margin={48} backgroundMedia="cover-art" backgroundSize="cover">
  <Heading id="cover-title" level={1} style={{color:'#ffffff',fontSize:54}}>A short title</Heading>
  <Paragraph id="cover-subtitle" style={{color:'#ffffff'}}>Choose quiet image space for the words.</Paragraph>
</Page>
```

Frames and `backgroundMedia` use the same document-owned media IDs, freshness checks, and usage records as `Media`. Frames inherit their enclosing `Block` or `Figure` for feedback; a page background records page-level usage without a block selection. Missing named images fail rendering. You cannot combine `backgroundMedia` and `backgroundImage` on one page. For an unmanaged local PNG/JPEG, `backgroundImage="./image.png"` resolves relative to the authored document; it does not add managed provenance. Managed backgrounds default to centered `cover`; `backgroundSize="contain"` preserves the whole picture, and `backgroundPosition` accepts `center` or a corner such as `top-left`. OpenDoc prepares these proportional local-image backgrounds before sending them to the native page layer, which otherwise stretches images. Explicit `fill` retains stretching; remote URLs retain the native renderer's behavior.

The installed renderer prepares cropped/rounded frames as bounded PNGs, leaving the originals intact and surrounding text selectable. It uses up to 216 dpi with a 4096-pixel edge limit; this does not add detail to a low-resolution source. You do not need to read files, encode base64, import a native addon, or clip an oversized `Image` yourself. Native SVG `<image>` content can disappear without an export error, so use `MediaFrame` for image composition instead. Do not rasterize an entire text page to work around image placement.

For starting compositions, read workspace-root `templates/image-story/AGENTS.md` and view its real PDF in **Templates**. It demonstrates full bleed, vertical/horizontal halves, panoramas with insets, diptychs, collage, and floating text panels. You can use the primitives without using that template. Generate or choose images for their intended aspect ratio and quiet text areas; never crop away a face, important object, label, or evidence merely to match a frame. Always inspect the rendered PDF for image visibility, crop, contrast, caption placement, and text extraction. A successful export is not a visual review.

## Browse and continue with Codex

The **Media** tab in **Media & Assets** lists visuals across documents, searchable by title, description, kind, and document. Existing Media links keep working. Byte-identical images share one browser card; ownership, metadata, and source relationships stay separate. A filename match alone never merges images. The detail view shows their document, current PDF usage, prepared files, and optional source notes.

File downloads are limited to document-owned media files. Original references are shown only as source notes. Selecting a media item updates `.opendoc/current.json` with its folder, metadata, and input status so Codex can work on the right item. Selection remains observed context, never an instruction to change the document. Metadata is editable in the app or through ordinary local files and the coding agent; prepared data, recipes, and regeneration remain agent work.

## Existing projects

Existing original files and media folders remain in place. Older generation records may contain original-source hashes; those remain historical information and no longer participate in media checks. Current checks cover only the image and its own prepared data and recipe. Normal document imports still participate in dependency tracking and rerendering. Citations, references, and source notes in PDFs continue to work independently of file organization.
