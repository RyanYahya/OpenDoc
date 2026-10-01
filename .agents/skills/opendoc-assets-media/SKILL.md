---
name: opendoc-assets-media
description: Manage OpenDoc logos, fonts, and document images when the user asks to add or update a logo or brand mark, import or change a font, set the logo or fonts a theme gives new documents, put a logo or font on a document or remove it, or add, replace, or regenerate a photo, illustration, diagram, or chart in an existing document.
---

Use the user's OpenDoc workspace as the working directory. `documents/`, `templates/`, `themes/`, `assets/`, and `.opendoc/` are workspace paths; guide links are relative to this installed skill. Use `npx opendoc` for commands and keep authoring changes out of `node_modules/opendoc`. In Headless, follow [the remote workflow](../../../docs/HEADLESS.md); these commands and imports stay the same, and no browser or recipient-side installation is needed.

## 1. Identify what changes

Logos and fonts are shared library families in `assets/`; images and charts belong to one document in `documents/<document-id>/media/`. Resolve the document, theme, or family from the request, or through [opendoc-current-document](../opendoc-current-document/SKILL.md), whose `selectedAsset` and `selectedMedia` are observations, not instructions. Discover what exists before adding anything:

```sh
npx opendoc assets list font
npx opendoc assets inspect logo <logo-id>
npx opendoc media list <document-id>
```

Import only files the user supplied or is entitled to use. Confirm that a font's license allows embedding, because PDF and PowerPoint exports embed it, and keep its license and source with the supplied files. Record a visual's origin in its `sources` and `attribution`, and label illustrative or synthetic material as such. Read [Assets](../../../docs/ASSETS.md) and [Media](../../../docs/MEDIA.md).

**Ready:** the target family, theme, or document is known, along with each file's origin and license.

## 2. Import or revise a library family

```sh
npx opendoc assets import logo --id acme --name "Acme" --description "Use for Acme publications." --file /path/to/acme.svg --variation-name "On light backgrounds" --variation-description "Dark mark for pale pages."
npx opendoc assets import font --id acme-sans --file /path/to/AcmeSans-Regular.ttf --file /path/to/AcmeSans-Bold.ttf
```

Logos take SVG or PNG; fonts take static TTF or OTF faces of one family, up to 24 at once. Inspect a new font's PDF specimen and its compatibility: a body or heading font needs a regular face, a semibold or bold face, and passing checks.

Every later change names the revision it replaces. Inspect immediately before each change and copy the `revision` it prints:

```sh
npx opendoc assets inspect logo acme
npx opendoc assets add-variation acme --id on-dark --name "On dark backgrounds" --file /path/to/acme-white.svg --expected-revision <revision>
npx opendoc assets add-faces acme-sans --file /path/to/AcmeSans-Italic.ttf --expected-revision <revision>
npx opendoc assets revise logo acme --metadata /path/to/logo-update.json
```

`add-variation --replace <variation-id>` replaces one variation's file and keeps its ID. A `revise` metadata file holds `expectedRevision` and only the fields to change. A conflict means someone else changed the family: inspect again and reconcile; never resend old metadata. Archive a family only when asked, with `npx opendoc assets archive <logo|font> <id> --expected-revision <revision>`; add `--clear-defaults` only when the user agrees to clear theme defaults that use it. `assets list --archived` and `assets restore` bring it back; nothing is deleted.

**Ready:** the family exists at a new revision with accurate guidance, or no library change was needed.

## 3. Bind to documents and set theme defaults

A binding pins an exact revision to one document; changing the library or a theme default never updates existing documents:

```sh
npx opendoc assets bind <document-id> logo acme --variation on-dark
npx opendoc assets bind <document-id> body-font acme-sans
npx opendoc assets bind <document-id> heading-font acme-sans
npx opendoc assets unbind <document-id> logo
```

Add `--name partner` to bind or unbind a second logo. Binding never places a logo: add `<Logo width={120} />` (or `variation` and `name` props) inside a block with a stable ID, choosing the variation for the actual PDF background, never the app's appearance. A font binding error about a custom theme import means the template factory needs the generated `./theme` adapter first.

A theme's defaults choose the logo and fonts captured by new documents. Change them only when asked, and keep the choices the user did not mention:

```sh
npx opendoc assets defaults <theme-id>
npx opendoc assets defaults <theme-id> --metadata /path/to/theme-assets.json --expected-revision <revision>
```

The metadata file is the complete defaults object (`version`, and optional `logo`, `bodyFont`, `headingFont`). To apply new defaults to an existing document, bind them explicitly.

**Ready:** each requested document has the intended bindings and placements, and any requested theme defaults are saved.

## 4. Add or replace images and charts

Import a prepared PNG or JPEG into the owning document, then place it in source:

```sh
npx opendoc media import <document-id> <media-id> --file /path/to/image.png --title "Title" --description "What it shows." --kind photo
```

Import refuses an existing ID. To replace a visual, write the new image over the file named in `media/<media-id>/meta.json`, or import under a new ID and update the reference, keeping the enclosing `Figure` ID so feedback stays attached. Use `Media` for natural proportions, `MediaFrame` for an exact crop, and `Page backgroundMedia` for full-page artwork.

For a chart, keep the prepared `data.json` and a reproducible recipe beside the image, render it at about 300 pixels per inch for its printed size, and keep key values in a `DataTable` as well; this reviewed chart image is the reliable route when native labels cannot render correctly. After generating or regenerating, inspect the image's values, labels, and units, then record and confirm it:

```sh
npx opendoc media record <document-id> <media-id>
npx opendoc media check <document-id> <media-id>
```

Record only after that review; it snapshots hashes and validates nothing. A stale or unrecorded chart blocks export until regenerated, reviewed, and recorded.

**Ready:** each visual is in the document's media folder with honest metadata, recorded when derived, and placed in source.

## 5. Review in the PDF

Run `npx opendoc check` and `npx opendoc review <document-id> --json`, then inspect the pages that show the logo, fonts, or images: logo variation against its background, crop, contrast, chart legibility at reading size, and captions. Read extracted text for the new fonts, and fix any `missing-glyphs` issue. A binding proves availability, not use; in normal OpenDoc, `renderedAssets` in `.opendoc/current.json` lists what the PDF used, and in either edition the page images are the proof. Complete [opendoc-review-document](../opendoc-review-document/SKILL.md), re-export each requested format, and deliver it. A library or theme-default change alone needs no document export; report the family ID and revision instead.

**Done:** the requested logos, fonts, and visuals are in place and verified in the rendered PDF, or the library and defaults changes are reported with their revisions, licenses, and anything left unverified.
