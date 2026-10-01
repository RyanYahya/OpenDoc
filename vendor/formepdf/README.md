# Forme text writer, font subset, and bidirectional text repair

OpenDoc uses `@formepdf/core` **0.20.1-opendoc.4**, based on upstream
[`v0.20.1`, commit `0d706f839617b775e90edcc93d6001a8b0145a78`](https://github.com/formepdf/forme/tree/0d706f839617b775e90edcc93d6001a8b0145a78).
The published JavaScript interface is unchanged apart from one added layout
field. `text-writer.patch` repairs the Rust PDF writer, `font-subset.patch`
repairs embedded TrueType metadata, and `bidi-rtl.patch` repairs Arabic and
other right-to-left text. `core-types.patch` adds the layout `direction` field to
the published declarations, matching the source change in `bidi-rtl.patch`.
The source repository's archive contains rebuilt bundler, web, and Node WASM
engines. The workspace override pins this repaired engine for contributors.

Both installable editions, `opendoc` and `opendoc-headless`, bundle this repaired
core with Forme's React serializer and shared JavaScript definitions.
`pnpm package:pack` materializes ordinary npm trees in temporary staging
directories. Both editions render in Node, so distribution retains the repaired
`pkg-node` engine byte for byte and omits the unused browser and worker WASM
targets. The staged core manifest exposes only its Node entry and layout helpers;
it does not advertise the removed targets. The duplicate source archive remains
in this repository and is excluded from both runtime packages. Consumers need no
override, local archive path, Rust tools, or build hook. Native dependencies such
as `esbuild`, canvas, and resvg stay unbundled so npm installs the binaries
appropriate to the consumer's operating system and architecture.

OpenDoc already supplies its own TSX bundling and source-location capture. The
only remaining `@formepdf/renderer` operation was asset source resolution.
`src/rendering/resolve-sources.ts` retains the 0.20.1 package's `dist/resolve.js`
implementation, with only TypeScript annotations and formatting changes. This
avoids importing the unrelated HTML compiler. Its copyright is Daniel Molitor,
2026, and the MIT license in this directory covers the retained resolver as well
as the engine. Future upgrades should compare that small module with the
upstream resolver explicitly.

The build also remaps local source, home, Cargo, and toolchain paths
to anonymous `/build/` paths using Rust's
[`--remap-path-prefix`](https://doc.rust-lang.org/rustc/remap-source-paths.html).
This removes builder-specific paths from embedded panic diagnostics without
changing the renderer API. The rebuild script checks every generated WASM engine
for the original local paths before packaging it.

## Repair

- Allocate PDF character codes by glyph **and source text**, with an explicit
  CIDToGIDMap. A shaped `fi` and literal `ﬁ` can use the same glyph without losing
  their distinct source text.
- Write full UTF-16BE sequences in ToUnicode, including ligatures and surrogate
  pairs. Keep the original GSUB, GPOS, and kerning tables in every imported font.
- Position custom-font glyphs using their shaped x/y coordinates, including
  kerning, mark offsets, letter spacing, and cumulative justified spaces. Use the
  same positioning for watermarks. Preserve fractional font sizes and widths.
- Reset word spacing at style boundaries to avoid leaking custom-font text state.
- Record actual TrueType table lengths while keeping table starts aligned to
  four bytes. In particular, a short `loca` contains exactly `numGlyphs + 1`
  entries; alignment padding is outside its recorded length.
- Preserve the original `maxp` profile except for `numGlyphs`. The retained
  outlines, glyph instructions, and copied `fpgm`, `prep`, and `cvt ` tables still
  need the original interpreter resource limits.
- Keep the `head` directory checksum calculated with zero `checkSumAdjustment`.
  Write the adjustment only into the table, so the whole font sums to `0xB1B0AFBA`.

These metadata repairs follow the OpenType [font file and checksum
rules](https://learn.microsoft.com/en-us/typography/opentype/spec/otff) and
[`maxp` profile](https://learn.microsoft.com/en-us/typography/opentype/spec/maxp).

This is a source-level engine fix. It does not alter font files, disable shaping,
normalize away missing spaces, or relax compatibility checks. Existing renamed
OpenDoc font derivatives remain unchanged for document continuity.

## Bidirectional text repair

Upstream 0.20.1 accepted a `direction` style and bundled `unicode-bidi` and
`rustybuzz`, but analyzed each line separately with a left-to-right default,
shaped right-to-left runs into visual order and then reversed them a second
time, discarded mark offsets while repositioning, and assigned ligature text by
scanning clusters in left-to-right order. Arabic therefore printed with
disconnected or reversed letters, wrong word order, misplaced numbers and
punctuation, and duplicated letters in layout text. `bidi-rtl.patch`:

- Resolves UAX #9 embedding levels once per paragraph, across every styled run
  of a Text node (rules P2–I2; `auto` uses the first strong character). Lines are
  broken in logical order; each line then applies rule L1 to trailing whitespace
  and separators and orders its runs with rule L2. Left-to-right paragraphs
  without right-to-left characters keep the previous code path unchanged.
- Shapes each run of equal level and font with an explicit direction, so Arabic
  joining forms, marks, and mirrored brackets come from the font, while Latin
  words and numbers remain left to right. Glyphs are placed without reversing
  them again, keeping GPOS offsets. Line breaking measures the same shaped runs.
  Letter spacing is not applied to right-to-left runs of cursive scripts.
- In a font fallback list, spaces, digits, punctuation, and marks stay in the
  font of the preceding character when it has them, so an Arabic phrase is not
  split at every space. Characters that no listed font covers produce a
  `Missing glyphs:` warning, which OpenDoc reports as `missing-glyphs`; such
  characters print as `?`.
- Without an explicit `textAlign` in the inheritance chain, a paragraph aligns
  to the edge where it starts (CSS `start`); justified paragraphs widen only
  spaces and end on a start-aligned line. A `flexDirection: 'row'` container or a
  table whose direction is `rtl` starts at the right edge.
- Writes each bidi line's directional runs in reading order, each glyph at its
  visual position, so content-order extractors and tagged reading order follow
  the text. ToUnicode maps every glyph to its source text: one glyph per
  ligature, base and marks one to one, and no duplicated letters. A glyph that
  carries no text, such as a separate Arabic dot glyph, is painted from its
  outline instead of being shown as text with an empty mapping.
- Records each bidi line's logical text for layout `textContent`, and reports
  `direction` in the layout style: text containers report the authored value,
  their `TextLine` children the resolved direction and the alignment applied.

Pure left-to-right documents render byte for byte as with `opendoc.3`; the
welcome document, the welcome presentation, and every template specimen were
compared. Known limits: justification never inserts kashida; pdf.js omits the
space where the direction changes when it joins text runs; `row-reverse`
remains unimplemented upstream; running headers and footers do not inherit the
document style, so OpenDoc repeats their direction explicitly.

## Rebuild

In a source checkout, `pnpm install --frozen-lockfile` uses the checked-in archive
and needs no Rust tools. To rebuild from that checkout, install Rust **1.98.1**, its `wasm32-unknown-unknown` target,
and **wasm-pack 0.15.0**, then run:

```sh
node scripts/rebuild-forme.mjs
```

The script verifies the upstream commit and original npm tarball SHA-512, applies
the three readable source patches, runs the engine's library tests, builds all three
WASM entry points with the upstream lockfile, and packages the existing published JS
with those engines and the declaration patch. Build files stay in a fresh operating-system temporary directory;
an optional first argument chooses a new directory that must not already exist.
The printed directory is retained for inspecting build results. The script
then packs `formepdf-core-0.20.1-opendoc.4.tgz` into `vendor/formepdf`,
replacing the checked-in archive. Set `RUSTUP_TOOLCHAIN=stable` only if that
installed toolchain is exactly 1.98.1.

The archive is reproducible in behavior, not byte for byte across machines.
wasm-pack uses a `wasm-bindgen` binary on `PATH` when its version matches; the
published archives were processed by a crates.io build (`cargo install
wasm-bindgen-cli --version 0.2.108`, which records walrus 0.24.5), while
wasm-pack's own download records walrus 0.24.4. The remapped path prefixes are
part of `RUSTFLAGS`, which Cargo hashes into crate metadata, so a different home
or build directory still changes symbol hashes and a few hundred bytes of code.
Compare rendered PDFs, not archive hashes, when checking a rebuild.

After replacing the archive, refresh the pnpm lockfile and run `pnpm verify`
(type check, build, and tests). Review the PDF specimens of every bundled font
family in `assets/fonts`, including Geist and Noto Naskh Arabic;
`tests/bundled-fonts.test.ts` checks the Google Fonts families and Noto Naskh
Arabic against their recorded file hashes. See `tests/font-renderer.test.ts` for
PDF extraction and geometry regressions, `tests/font-subset.test.ts` for lengths,
checksums, and hinting metadata read from the actual embedded font streams,
`tests/arabic-bidi.test.ts` for right-to-left ordering, joining, and the
byte-for-byte left-to-right comparison, and `tests/script-fallback.test.ts` for
the Arabic fallback and missing-glyph reports. The subset patch also contains
Rust regressions for alignment, checksums, and profile preservation using the
upstream font fixture, and `bidi-rtl.patch` adds engine tests for paragraph
levels, line reordering, alignment, mirroring, ligature text, and missing
glyphs; the rebuild script runs both.

Then render `documents/welcome`, `documents/welcome-presentation`, and every
template specimen with both the committed archive and the rebuilt one.
Left-to-right output should stay byte for byte the same unless the change
targets it; inspect the page images of anything that differs.

## Upstream replacement

When an upstream version includes equivalent fixes, remove the local override
and archive only after these regressions and existing document checks pass.
The patch and engine remain under Forme's MIT license, retained in `LICENSE`.
