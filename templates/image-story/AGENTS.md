# Image story

An adaptable layout skeleton for image-led documents. Every catalog image position is a replaceable placeholder; no actual artwork, brand identity, or subject matter belongs in this template. Themes supply the appearance and each document owns its content. Use one or two layouts when they help; the seven-page specimen is a menu, not an outline to reproduce. The catalog uses Neutral so the architecture is visible independently of branding.

## Start with the image's job

- `cover`: establish atmosphere with full bleed and a short title in quiet image space.
- `split-left`: give a portrait image half the page and concise prose a separate column.
- `split-top`: introduce a scene before the writing; often better for longer headlines.
- `panorama`: contrast a wide band with a square inset; explain the relationship in the nearby copy.
- `diptych`: align an unequal pair for comparison or two perspectives.
- `collage`: three pictures with unequal scale and one overlap, connected by short copy.
- `overlay`: full bleed with an opaque text panel when the artwork is busy.

The half-page split and panorama with inset are strong everyday defaults. Collages and overlays work best as occasional emphasis. White space, image scale, and changes of rhythm do more than adding a picture to every passage.

## Authoring contract

Create through `pnpm run create -- <id> --project <project> --template image-story --title "Title"`. Keep the generated theme adapter and asset bindings. `ImageStory` is the document root; `ImageStoryPage` accepts a stable `id`, the adapted `theme`, a `layout`, native `title` and optional `eyebrow`, `lead`, `children`, `caption`, and named image props (`image`, `secondary`, `detail`). Each image is `{item:'media-folder-id', fit:'cover', position:{x:0.5,y:0.5}}`; omit fit/position for centered cover. Named media must exist and pass freshness checks. An omitted image prop creates a visible starter placeholder, never a silent blank. `lead` inherits the composition's foreground, including white on image covers. If you add custom `children` over artwork, explicitly choose their foreground against that image too.

Import or generate actual images into the **instance's** `media/<id>/` folder and review them using [Media](../../docs/MEDIA.md). The template and its specimen contain no artwork or prompts; new documents begin with replaceable placeholders. Do not borrow other documents' filesystem paths or bake brand/subject matter into the skeleton.

Image pages are deliberately bounded. Keep their copy short. Adjust `titleStyle` (for example `{fontSize:30}`), change a layout, or make a local variation for a long headline. Put long prose in ordinary OpenDoc `Pages`; add image pages between those flowing sections. The bounded text regions fail preflight if copy clips rather than silently discarding it. Preserve the caller's body typography and spacing. A4/Letter dimensions and colors come from the theme; the composition owns its edge-to-edge geometry. On covers, choose `coverColor` against the actual artwork. A page-background crop is centered; use a local `MediaFrame` composition when exact crop alignment matters.

## Use the primitives outside this template

Use `MediaFrame` from `opendoc` for exact image boxes anywhere. It supports proportional `cover` or `contain`, crop alignment, and `radius` (half a square's width creates a circle). Wrap it in `Figure` for captions or `Block` for an image-only feedback target. Use `Page backgroundMedia="id"` for managed full bleed. See the copyable examples in [Media](../../docs/MEDIA.md). Keep prose and labels native so they remain selectable.

## Lessons already handled by OpenDoc

- Local page-background paths now resolve explicitly. Prefer `backgroundMedia` for provenance and freshness.
- Native SVG image elements can disappear without failing export. `MediaFrame` prepares the bounded picture through the installed renderer; agents need no base64/filesystem/native-addon helper.
- Media frames and backgrounds report their use and reject stale generated inputs just like ordinary `Media`.
- Crop alignment is not anatomical or semantic understanding. Review faces, objects, and focal points. Use `contain` when the whole subject, labels, or evidence must remain visible.
- Compilation and geometry checks cannot establish image visibility or good composition. Review **every PDF page**, especially the final crop, layering, contrast, captions, and extracted text.

Vary the composition freely to serve the material. Preserve stable block/text identities, accurate image provenance, and the reviewed-PDF workflow.
