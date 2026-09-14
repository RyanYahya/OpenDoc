# Verification and release checks

This guide describes repeatable checks, not a claim that an old run validates today's source. Run checks appropriate to the change; record the commands, results, and material limitations in the delivery or pull request. A successful build alone does not demonstrate the document workflow.

## Automated checks

From the repository root:

```sh
pnpm install --frozen-lockfile
pnpm verify
```

`pnpm verify` runs typechecking, the production build, and all tests. Building first makes the installed interface available to server integration tests; run `pnpm build` before invoking those tests directly from a fresh checkout. CI runs the same checks on Linux and macOS. The suite exercises real PDF rendering as well as data and service contracts. It covers document creation and project membership; references and pagination; template schemas, arithmetic, and theme integration; selection, comments, and guarded text edits; asset import, versioning, bindings, and fonts; export freshness, receipts, and recovery. Tests use disposable workspaces rather than adding sample documents to the shipped library.

For a focused change, run the relevant existing test files with `pnpm exec tsx --test tests/<name>.test.ts`. Run the full checks before a release. Once successful checks cover the final source, repeat them only if new edits or evidence require it.

Keep tests tied to a distinct failure or observable contract. When a template already renders in a test, check its text ownership and other related guarantees on that result rather than adding another rendering pass. Test shared creation and validation rules once; keep template-specific checks for layout, editable content, and calculations. Avoid locking tests to incidental copy, catalog counts, or source formatting. Small wording and styling changes normally need review of the existing output, not new tests.

## Installed-package acceptance

After `pnpm verify`, run `pnpm package:pack` and use both generated tarballs: `output/packages/ryanyahya-opendoc-<version>.tgz` and `output/packages/ryanyahya-opendoc-headless-<version>.tgz`. Both include the same repaired Node PDF engine, full starter catalogs, and shared versioned guides. Normal OpenDoc also includes the built browser interface; Headless excludes that interface and its service dependencies. Direct `npm pack` from the repository is not the release packaging route. `pnpm package:pack --edition normal` or `--edition headless` supports focused package checks; a release needs both.

Exercise both tarballs outside the source checkout on macOS and Linux with Node.js 24 or newer and npm. For a release that is not published, set `OPENDOC_PACKAGE_TARBALL` to the selected tarball's absolute path so initialization installs the same reviewed artifact. For normal OpenDoc:

```sh
export OPENDOC_PACKAGE_TARBALL=/absolute/path/to/ryanyahya-opendoc-0.4.0.tgz
npm exec --yes --package="$OPENDOC_PACKAGE_TARBALL" -- opendoc init /tmp/opendoc-acceptance --no-start --json
cd /tmp/opendoc-acceptance
npx opendoc check --json
npx opendoc start --no-open
```

Use a new or empty destination. Confirm initialization refuses nonempty folders and leaves existing files intact. Also exercise the interactive default `~/Documents/My OpenDoc` using an isolated home or explicitly chosen disposable folder, then check the default browser launch and `--no-open`. A noninteractive invocation must supply its destination.

Confirm the normal workspace pins `dependencies.opendoc` to the exact alias `npm:@ryanyahya/opendoc@<version>` and contains its own documents, themes, templates, assets, project records, and `.opendoc/workspace.json`. Verify its `AGENTS.md` and skill pointers reach the installed guidance, and that template/theme guides can open shared documentation without a checkout. From a nested folder, run a workspace command to check ancestor discovery; from elsewhere, use `--workspace`. Exercise `--help`, `--json`, and actionable failures.

Create and revise a document and presentation through `npx opendoc create`, then run `npx opendoc check`, PDF export, and PPTX export against that installed workspace. Confirm edits to its local theme/template affect the intended documents. Complete the relevant reader checks below. Successful repository tests alone do not prove the installed workflow.

Stop the foreground service with **Ctrl-C**, start it again, and stop it before update acceptance. Test update discovery with `npx opendoc update --check --json`; exercise a compatible update and an explicit exact-version request in a controlled fixture. Confirm the installed runtime and its package guidance change together while local documents, feedback, themes, templates, assets, and project files retain their bytes. Exercise invalid targets and a running-service rejection; keep legacy checkout migration and catalog merging outside the update path. Do not publish to test an update; use controlled registry fixtures or already authorized published versions.

## Headless installed-package acceptance

Use a separate disposable workspace and the Headless tarball:

```sh
export OPENDOC_PACKAGE_TARBALL=/absolute/path/to/ryanyahya-opendoc-headless-0.4.0.tgz
npm exec --yes --package="$OPENDOC_PACKAGE_TARBALL" -- opendoc-headless init /tmp/opendoc-headless-acceptance --json
cd /tmp/opendoc-headless-acceptance
npx opendoc check --json
npx opendoc review welcome --json
npx opendoc review welcome-presentation --json
npx opendoc export welcome --json
npx opendoc export welcome-presentation --json
npx opendoc export welcome-presentation --format pptx --json
npx opendoc review --theme neutral --json
npx opendoc review --template editorial-essay --json
npx opendoc templates check editorial-essay --json
npx opendoc templates preview editorial-essay --json
```

Confirm `init` requires an explicit destination even when a terminal is available, never prompts or starts a browser/service, and refuses nonempty folders without replacing their files. The workspace marker records the Headless edition. Its exact dependency is `opendoc: npm:@ryanyahya/opendoc-headless@<version>`; public imports, `node_modules/opendoc/` guide links, nested command discovery, and `npx opendoc` must work without the normal package or checkout. `start` should reject the unsupported GUI operation with actionable production commands.

Compare the editable starter documents, templates, themes, fonts, and example media between clean installations. Both must retain the full library. Confirm the Headless package contains no built interface or GUI-only dependency tree; the native PDF/page-image dependencies remain available on each tested platform. Render the same unchanged workspace source and asset bytes in both editions and compare the PDFs and editable presentation content. Packaging reductions must not change document output.

Inspect each successful review result's exact PDF hash, page count and dimensions, page images/text, render issues, stable block/source information, and output paths. Open every page image of representative documents, decks, and specimens at readable scale; inspect text extraction and the final exported files. `visualReview: "required"` and `factualReview: "required"` must not be converted into automated claims that these reviews passed.

Exercise `review <id> --export --json` on a document and presentation. Confirm typecheck failures preserve the previous set and that PDF/PPTX share one captured render. Change one slide, review again, and check changed/removed page reporting. Inspect `pages[].elements` for actual parent/local coordinates and clipping ancestors. Include an explicit `maxLines` violation, overlapping text, a split and kept-together callout, and an oversized keep-together block. Check an editable rounded panel and a PPTX-incompatible revision: styling warnings should identify the component before export, and failed combined preparation must retain both previous formats. Verify supported shapes and editable text in the package without equating package checks with native PowerPoint appearance.

Exercise a failed/overflowing revision and source edits during rendering. Check nonzero exit status and structured issues when available, and confirm previous successful review files and exports remain intact without being labeled as the failed revision. Headless review/export must work without a live service, built interface, or browser context; stale or malformed `.opendoc/server.json` must not affect its direct production path. Include a bespoke document and a reusable theme/template change, then verify their specimens and dependent instance outside the checkout.

Check PPTX slide count/order, editable text, media, and font parts against the reviewed PDF. Native PowerPoint inspection is useful when available; a remote environment without PowerPoint can finish package/content checks and report that native appearance was not verified. Do not substitute a PDF for a failed requested PPTX or require the recipient to install OpenDoc to complete acceptance.

Exercise update discovery and an exact-version update in a controlled fixture. Confirm registry selection stays on `@ryanyahya/opendoc-headless`, the exact alias and workspace edition remain Headless, runtime/guidance update together, and all authored workspace content retains its bytes. Verify a remote delivery fixture exposes the actual PDF/PPTX through an accessible output mechanism; a host-only path is insufficient when the recipient cannot access it. No messaging service or publication is needed to demonstrate file production.

## Reader and contributor-checkout acceptance

Use a disposable copy of the workspace for destructive, conflict, and recovery exercises. Keep the shipped library at **Getting started → Welcome to OpenDoc**; template and theme specimens belong in their catalogs.

1. In a source checkout, start with `pnpm start` after building; in an installed workspace, use `npx opendoc start`. Confirm the printed local URL opens, Welcome renders, and Templates, Themes, and Media & Assets load. Also check `pnpm dev` after changes to the development server integration.
2. Create a project and a document using the documented command or template flow. Confirm assignment, the chosen theme, `theme.tsx`, and exact `assets.json` choices. Edit source and confirm the current PDF refreshes.
3. Open the document, make a text draft, navigate away and back, then save it. Confirm source and PDF agree. Leave a comment, apply the intended revision, and resolve it through `pnpm comments` in the checkout or `npx opendoc comments` in the installed workspace. For editing changes, exercise a stale-source conflict and ensure pending text survives.
4. Bind a shared font and logo; verify actual PDF usage, copied text, logo proportions, and the correct variation for the page background. For asset changes, check historical bindings remain readable and archive/Undo does not overwrite newer choices.
5. Save a PDF through Export and open it. For presentations, also save PowerPoint and check editable text, embedded fonts, and slide content against the preview. Check previous exports and a CLI export. For export changes, exercise an interrupted response and recovery, plus an invalid render that preserves the previous valid output.
6. Check the affected interface at desktop and narrow width, with keyboard navigation, light/dark appearance, and readable errors and empty states. Check every page of changed PDFs at a legible size; a thumbnail or contact sheet alone is insufficient.

Document duplicate, move, delete, and Undo should preserve local data and asset selections. Exercise these after lifecycle changes. Test startup, shutdown, and a second launch after server changes; do not leave acceptance documents or temporary server sessions in the release workspace.

## Review the actual output

For documents, use the [opendoc-review-document skill](.agents/skills/opendoc-review-document/SKILL.md). Shared templates need representative sparse and long input plus a second theme. Shared themes need a reviewed specimen and representative affected layouts. Newly imported fonts need their real PDF specimen and review in the intended document. Check visual clipping and page breaks as well as extracted text, links, figures, calculations, and references relevant to the change.

`pnpm themes -- preview <id>` in a source checkout, or `npx opendoc themes preview <id>` in either installed edition, exports a selected theme specimen for review. `npx opendoc templates preview <id>` exports a template specimen. `npx opendoc review --theme <id> --json` and `review --template <id> --json` also prepare page images/text for direct inspection without the app. Specimens do not become user documents. Use existing test fixtures for longer cases instead of keeping throwaway reports in `documents/`.

## Current boundaries

- The normal edition's built interface needs the local Node service and authoring dependencies. A static upload of `dist/` is not a working OpenDoc installation. Headless commands run directly without a service; they still require the document engine and native runtime dependencies.
- Render workers execute trusted local TSX. Their process boundary handles crashes and timeouts; it is not a hostile-code sandbox.
- Native Forme chart labels and inline link annotations have limitations. Use managed raster charts and whole-block links as described in [Authoring](docs/AUTHORING.md). Native list pagination uses OpenDoc's text-row workaround.
- OpenDoc carries Forme text-writer and embedded font-subset metadata repairs. Font regressions check extracted text and geometry, plus subset table lengths, checksums, and hinting profiles. Preserve original imported fonts; do not strip shaping tables to hide engine failures. See [the patches and rebuild guide](vendor/formepdf/README.md).
- Automated geometry and text checks do not establish factual accuracy, full accessibility conformance, legal compliance, or visual quality. State concrete unverified limits without presenting historical results as current proof.
