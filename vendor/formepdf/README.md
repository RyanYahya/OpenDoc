# Forme text writer and font subset repair

OpenDoc uses `@formepdf/core` **0.20.1-opendoc.3**, based on upstream
[`v0.20.1`, commit `0d706f839617b775e90edcc93d6001a8b0145a78`](https://github.com/formepdf/forme/tree/0d706f839617b775e90edcc93d6001a8b0145a78).
The published JavaScript interface is unchanged. `text-writer.patch` repairs the
Rust PDF writer, while `font-subset.patch` repairs embedded TrueType metadata.
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

The `opendoc.3` build also remaps local source, home, Cargo, and toolchain paths
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

## Rebuild

In a source checkout, `pnpm install --frozen-lockfile` uses the checked-in archive
and needs no Rust tools. To rebuild from that checkout, install Rust **1.98.1**, its `wasm32-unknown-unknown` target,
and **wasm-pack 0.15.0**, then run:

```sh
node scripts/rebuild-forme.mjs
```

The script verifies the upstream commit and original npm tarball SHA-512, applies
both readable patches, runs the engine's library tests, builds all three WASM entry
points with the upstream lockfile, and packages the existing published JS with
those engines. Build files stay in a fresh operating-system temporary directory;
an optional first argument chooses a new directory that must not already exist.
The printed directory is retained for inspecting build results. Set
`RUSTUP_TOOLCHAIN=stable` only if that
installed toolchain is exactly 1.98.1.

After deliberately replacing the archive, refresh the pnpm lockfile and run
`pnpm check`, `pnpm test`, and `pnpm build`. Review the PDF specimens for all five
Google Fonts families and verify their original file hashes. See
`tests/font-renderer.test.ts` for PDF extraction and geometry regressions and
`tests/font-subset.test.ts` for lengths, checksums, and hinting metadata read from
the actual embedded font streams. The subset patch also contains Rust regressions
for alignment, checksums, and profile preservation using the upstream font fixture.

## Upstream replacement

When an upstream version includes equivalent fixes, remove the local override
and archive only after these regressions and existing document checks pass.
The patch and engine remain under Forme's MIT license, retained in `LICENSE`.
