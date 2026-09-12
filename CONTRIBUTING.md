# Contributing to OpenDoc

OpenDoc produces agent-authored documents and presentations in two editions from one repository. Normal OpenDoc provides the browser workspace; OpenDoc Headless completes remote authoring, review, and artifact delivery through the host agent. Both share the rendering implementation, authoring API, release version, and full starter library. Contributions should improve those workflows while keeping writing, design choices, and file ownership with the user. Read [AGENTS.md](AGENTS.md) for the agent workflow and [README.md](README.md) for setup and product scope.

## Run and verify

Use a source checkout, the Node version in `.node-version`, and the pnpm version in `package.json`. Installed content workspaces use `npx opendoc`; they do not need the contributor toolchain.

```sh
pnpm install --frozen-lockfile
pnpm dev
```

The service prints its local URL. For the production interface, run `pnpm build` followed by `pnpm start`. Keep the complete dependency installation; rendering uses the TypeScript tools at runtime.

Run `pnpm verify` before opening a pull request. It checks TypeScript, runs the tests, and builds the interface. Follow [VALIDATION.md](VALIDATION.md) for the affected user flow. Rendering changes need inspected PDF output; presentation changes also need PowerPoint export checks. The vendored renderer's [rebuild guide](vendor/formepdf/README.md) explains its reproducible source patches.

Use the disposable fixtures in `tests/helpers.ts` for test documents and mutations. A reusable layout belongs in `templates/`, a visual system in `themes/`, and shared controls in `src/app/ui/`. Keep the shipped library limited to the welcome document and welcome presentation in Getting started. Retain existing stable identities, font licenses, asset revisions, and user corrections.

## Check both installed packages

Build both installable artifacts with `pnpm package:pack`: `output/packages/ryanyahya-opendoc-<version>.tgz` and `output/packages/ryanyahya-opendoc-headless-<version>.tgz`. Both contain the same versioned guides, full editable starter catalogs, and repaired Node Forme engine; normal OpenDoc also contains the built interface. Headless excludes the browser interface and its service dependencies. Use this route instead of a direct `npm pack` from the checkout. `--edition normal` or `--edition headless` supports focused packaging during development.

Exercise each tarball in a disposable location outside the source tree. Confirm normal `init` creates only a new or empty destination, installs an exact application version, and launches the built interface. Test `--no-start` and `--no-open`. Headless `init` always requires an explicit destination and never prompts, opens a browser, or starts a service. Both editions use exact aliases under the `opendoc` dependency key: `npm:@ryanyahya/opendoc@<version>` for normal OpenDoc and `npm:@ryanyahya/opendoc-headless@<version>` for Headless, preserving shared authoring imports and installed guide paths.

In both editions, confirm the full default library, public authoring imports, `check`, review page images/text, PDF/PPTX export, and guidance work without checkout files. Exercise theme/template specimens, ancestor discovery, and `--workspace`. Identical source and resources must produce equivalent outputs; Headless must complete production without browser state or a local GUI handoff. Keep shared engine and catalog code shared rather than adding edition-specific rendering behavior.

Stop any normal service with Ctrl-C before testing updates. Updates must preserve the selected package/edition, all workspace content, and local catalogs; legacy checkout migration and catalog merging are outside this updater. Test both editions through compatible and explicit-version requests.

Use [VALIDATION.md](VALIDATION.md) for the acceptance details. Publishing is a separate, explicitly authorized action against the reviewed tarball; packaging and local installation do not publish it.

GitHub Releases are optional milestones: tag the reviewed source revision and attach release notes or example exports. Creating a GitHub Release does not publish either npm package. Publish both tested npm editions at the same version, then link that version in the release notes; keep changes still on `main` distinct from the published package.

## Keep personal work out of contributions

Documents and their media are ordinary local source files. Newly authored work is not automatically private from Git: inspect every staged change before committing. Include only changes needed for the contribution. Do not add personal/client documents, transcripts, imported branding, credentials, browser state, or generated exports. `.opendoc/`, `output/`, and temporary/build directories are ignored; `.opendoc/server.json` contains a local session token and must never be shared.

For a bug report, include the expected behavior, reproduction steps, operating system, Node and npm versions, installed OpenDoc version, and a minimal synthetic example when needed. Include pnpm's version for contributor-checkout failures. Redact paths and private text from logs and screenshots. For security-sensitive issues, follow [SECURITY.md](SECURITY.md).

Explain the problem, resulting behavior, and relevant verification in a pull request. Keep unrelated refactors separate. Contributions follow the repository's MIT license, with third-party components retaining the licenses listed in [THIRD_PARTY.md](THIRD_PARTY.md).
