# Share themes and templates

An **OpenDoc pack** is a regular ZIP named `name.opendoc.zip`. It moves editable themes, templates, and their required assets between initialized OpenDoc workspaces. Both normal OpenDoc and Headless use the same format. The recipient needs OpenDoc to use the designs; viewing the included PDF specimens needs only a PDF reader.

Ask your agent to “share this theme” or “install this design pack.” The [opendoc-share skill](../.agents/skills/opendoc-share/SKILL.md) handles selection, review, and installation. These commands are also available directly.

## Export

```sh
npx opendoc packs export --theme acme --template annual-report \
  --id acme-design --name "Acme design" --pack-version 1.0.0 --json
```

Repeat `--theme` and `--template` to include more designs, or use either alone. The default pack ID and name are the first selected ID; the default pack version is `1.0.0`. `--author` and `--license` add optional attribution and redistribution terms. These are claims by the sender, not verified identities or a license for third-party assets.

Output defaults to `output/packs/<id>-<pack-version>.opendoc.zip`. `--output <path>` chooses another location. Export refuses to replace any existing output; choose another filename or version. Pack versions are independent of the OpenDoc application version. No registry, network access, or npm publishing is involved.

The exporter gathers the selected folders, follows relative source imports into other themes/templates and shared helpers, and collects literal workspace asset paths. Managed logo/font defaults include the current pointer, its exact immutable revision and referenced files, and adjacent license/provenance documents. It includes OpenDoc's base fonts and Arabic fallback so specimens can render from the captured files. Identical copies are reused on installation. Unrelated asset revisions and document history are not exported.

The complete captured source, including template starters, is typechecked before specimens render from a temporary snapshot containing only pack files. Missing imports, invalid asset revisions, and rendering failures abort export. Source changes during preparation also abort; a successful archive contains the captured source, required assets, and the PDFs generated from it. Inspect the PDF pages and text before sharing: successful rendering is not visual review.

### Supported dependencies

- Ordinary relative imports within `themes/`, `templates/`, and `assets/`; nested helper files and JSON sample data are supported.
- The installed authoring API: `opendoc`, its `themes`, `template`, and `assets` exports, React, and Forme. Their code is not copied into the pack.
- Literal asset paths, including theme fonts, JSON sample data paths, and `new URL('./image.png', import.meta.url)`.
- Additional local assets via repeatable `--include assets/<file-or-folder>`, for example when a template computes image filenames from data. Explicit includes must still be inside portable design folders.

Arbitrary npm dependencies, Node filesystem imports, dynamic imports, `require`, and process-dependent paths are unsupported in v1. This portability check is not a code sandbox or proof of safety. Replace a nonportable dependency with local reusable source/assets before exporting. Runtime values supplied by future document content, such as image props, remain the document author's responsibility.

Selected design folders include their supported source, guidance, sample data, and media. Review them for private content. Hidden files, comments, `node_modules`, and `output` folders are excluded. Unsupported visible file types and symbolic links fail rather than silently producing an incomplete pack. Documents, project settings, tag assignments, theme folders, application configuration (including package and TypeScript configuration files), and the `.opendoc` directory are outside the format.

## Inspect and install

```sh
npx opendoc packs inspect ./acme-design.opendoc.zip --json
npx opendoc packs inspect ./acme-design.opendoc.zip --previews output/acme-previews --json
npx opendoc packs install ./acme-design.opendoc.zip --dry-run --json
```

Inspection verifies the archive and all file hashes without loading authored code. `--previews` extracts only the supplied PDFs into a **new** directory. Inspection also works without an active workspace; when a workspace is available, it reports compatibility and conflicts. A dry run writes no catalog files and returns a failing exit status for conflicts or incompatibility. Neither inspection nor a dry run validates executable behavior. Previews describe the sender's result and are not a security guarantee.

**Themes and templates contain executable TypeScript.** Installing with `--trust` permits OpenDoc to load and render that code during verification. Only install code from a source you trust; hashes detect changes but do not authenticate the author. The render worker is not a hostile-code sandbox.

Stop normal OpenDoc with Ctrl-C before installation. This prevents the running catalog from discovering partially installed source. Headless has no service to stop.

```sh
npx opendoc packs install ./acme-design.opendoc.zip --trust --json
npx opendoc check
npx opendoc start  # Normal OpenDoc only
```

Installation checks the complete plan before rendering. It stages the payload, checks asset integrity and dependency completeness, typechecks the source, renders the selected specimens, and rechecks destination conflicts before writing. Files are added exclusively; identical files are reused, and a conflicting ID or file aborts without replacing existing content. An existing theme/template ID must match the whole included design, not merely a subset. Failed publication removes the files it just added while preserving unrelated files. A process killed during publication can leave added files; no crash-atomic or automatic-upgrade guarantee is made.

Installed files are ordinary editable workspace files. They appear in Themes and Templates on the next start; installation does not change project defaults or bind designs to existing documents. There is no pack auto-update, overwrite, or automatic ID-renaming mode. Resolve a conflict in the sender's source and export with distinct IDs, or install into another workspace. Do not hand-edit archive paths: theme IDs, source imports, asset bindings, and template starters must agree.

## Format version 1

```text
manifest.json
themes/<id>/...
templates/<id>/...
assets/...
previews/theme-<id>.pdf
previews/template-<id>.pdf
```

The manifest contains `format: "opendoc-pack"`, `schemaVersion: 1`, pack `id`, `name`, `version`, the exporting `opendocVersion`, optional `author` and `license`, `items` with their kind/ID and whether explicitly selected, exact managed `assets` revisions, and `files` with path, size, and SHA-256. Every payload file must be listed; the manifest cannot hash itself. Selected items require a preview PDF; dependency items carry their full source without an additional preview requirement. Archive SHA-256 is returned separately.

V1 conservatively accepts the same OpenDoc major/minor line at the exporting patch or newer. For example, a pack exported with 0.6.2 requires 0.6.2 or a later 0.6 patch. Normal and Headless are compatible at the same version. A different minor line requires re-export with that version; no runtime update happens automatically.

Archives are limited to 64 MiB compressed, 128 MiB expanded, 32 MiB per file, and 2,048 entries. Paths must be relative, NFC-normalized, and portable across filesystems. Parent traversal, backslashes, hidden paths, case collisions, duplicate entries, symbolic links, ZIP64, encryption, and multi-disk archives are rejected. File sizes and CRCs are checked during bounded decompression, then SHA-256 values are verified against the manifest.
