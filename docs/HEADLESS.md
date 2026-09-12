# OpenDoc Headless

OpenDoc Headless is the complete document-production workflow for agents running remotely. Ask the agent for a report, presentation, theme, or template; it authors, renders, reviews, and revises the work, then returns the finished files. The recipient opens the PDF or PowerPoint on any device and does not need OpenDoc installed.

Both editions come from the same open-source repository, use the same version and rendering implementation, and include the full starter library: editable templates, themes, fonts, and welcome examples. Headless omits the browser interface and its service dependencies. It has no embedded AI, hosted service, or messaging connector. The host agent supplies the model, task context, filesystem access, and delivery channel.

## Install in the agent's environment

Requires Node.js 24 or newer and npm on macOS or Linux. Run:

```sh
npx --yes @ryanyahya/opendoc-headless init ./workspace --json
cd ./workspace
npx opendoc --help
```

Supply a new or empty destination. Headless initialization is noninteractive and never opens a browser or starts a service. It installs an exact version, copies the full editable starter library, and writes the workspace's project records and versioned agent-guide pointers. Installation and updates need network access; rendering local content does not.

Run subsequent commands from the initialized workspace or one of its subfolders. Use `--workspace /absolute/path/to/workspace` to target it from elsewhere. The `.opendoc/workspace.json` marker records `edition: "headless"`. Its package dependency uses an npm alias, for example:

```json
{
  "dependencies": {
    "opendoc": "npm:@ryanyahya/opendoc-headless@0.4.0"
  }
}
```

Normal OpenDoc similarly aliases `opendoc` to `npm:@ryanyahya/opendoc@<version>`. These aliases keep `npx opendoc`, `node_modules/opendoc/`, and authoring imports such as `opendoc/assets` identical in both editions. Do not add the normal package to obtain document components. Edit the workspace's `documents/`, `themes/`, `templates/`, and `assets/`; installed package files are application code and versioned guidance.

The agent may retain this workspace for later requests or create a disposable one for a single job. A command exits after its work; no persistent OpenDoc process is required. Retain the source and resources before discarding a workspace when future revisions or reusable designs are part of the request.

## Agent setup

Give your agent [the README](../README.md#installation) and the brief. It can install dependencies in its own execution environment, initialize Headless, read the new workspace's `AGENTS.md`, and complete the work. Reuse an existing workspace for revisions or recurring work. A shell command changing directories does not necessarily refresh the host's instructions, so read the guide explicitly after installation.

| Agent | Shared setup |
| --- | --- |
| Codex | Start in the workspace; use `AGENTS.md` and `.agents/skills/`. |
| Claude Code | `CLAUDE.md` imports `@AGENTS.md`; `.claude/skills` links to the shared `.agents/skills` directory. |
| Cursor, including Cloud Agents | Use the same `AGENTS.md` and `.agents/skills/`. Keep these files in the environment where the agent runs; a local skill installation alone does not make it available remotely. |
| Hermes | Read the workspace guide directly. If using native skill discovery, use Hermes's supported project trust or profile registration; registration is optional for following the guide. |
| Grok Bot | Give the Bot this setup and production workflow on its cloud computer. It can follow the guide directly or save the workflow as a skill through its Cursor-compatible skill/plugin support. |
| Other agents | Read `AGENTS.md` and the matching linked skill, then use the CLI. |

These are shared files and documented setup paths, not a requirement to install an agent-specific plugin. The host needs file access, terminal execution, a way to inspect page images, and a way to return files. Use the host's existing tools for those steps. No particular model or tool-call name is required.

For workspaces created by an older release, add `@AGENTS.md` to `CLAUDE.md` if it is missing, preserving any existing instructions. Where `.claude/skills` does not already exist, create a relative directory link to `../.agents/skills`. If it already contains skills, preserve them and expose only the missing OpenDoc skills. Runtime updates deliberately preserve workspace instructions rather than replacing user edits. Any agent can also read `node_modules/opendoc/AGENTS.md` and its linked skills directly.

On shared remote machines, use an explicit workspace and project/document IDs for each task, and coordinate changes to the same document. Return the actual final files to the user through the host's attachment or download mechanism; a path inside a remote machine is not sufficient.

## Author, inspect, revise, deliver

Follow [AGENTS.md](../AGENTS.md) and its matching skills. All shared writing, design, provenance, stable-identity, media, font, and export rules apply. Resolve document and project IDs from the request and workspace catalogs; an old `.opendoc/current.json` is not current remote task context. Do not start the browser to resolve a target.

For example, discover the available designs and create a project and document:

```sh
npx opendoc themes list --json
npx opendoc templates list --json
npx opendoc projects create client-work --name "Client work" --theme neutral --json
npx opendoc create my-report --project client-work --title "Project report" --json
```

Honor the user's design choices; when choosing is delegated, use judgment. An existing project can be reused. Creation makes a scaffold, project membership, `theme.tsx`, and exact `assets.json` bindings. The agent then writes the actual report in `documents/my-report/index.tsx` using the [authoring API](AUTHORING.md). A scaffold is not a finished deliverable.

After authoring:

```sh
npx opendoc check --json
npx opendoc review my-report --json
```

`check` typechecks workspace source. `review` renders fresh saved source and produces the PDF, readable page PNGs, extracted page text, and a `review.json` manifest. For documents and presentations these live under `output/reviews/documents/<id>/`; theme and template specimens use `output/reviews/themes/<id>/` and `output/reviews/templates/<id>/`. Use the returned paths instead of guessing filenames. The same command works in normal OpenDoc; save intended browser text corrections before reviewing saved source there.

The result identifies the exact PDF hash, output paths, page count and dimensions, page images/text, render issues, and stable block/source information. `status: "ready"` and exit code 0 mean the review artifacts were prepared and technical render/layout checks passed. **They do not mean visual or factual review is complete.** The manifest keeps `visualReview` and `factualReview` as `"required"`.

The agent must inspect every page image at a readable scale, examine representative extracted text, and check the content against the brief and sources. Fix clipping, missing glyphs, awkward breaks, bad crops, incorrect claims, and other material defects. After changing source, regenerate the review artifacts and inspect affected pages and adjacent breaks. The [review skill](../.agents/skills/opendoc-review-document/SKILL.md) defines the full pass. If the agent cannot inspect images, report that concrete limitation; generating PNGs is not visual inspection.

Render and source-freshness failures return a nonzero exit status and structured diagnostics when available. They leave the previous successful review files intact, so those files must not be represented as the failed revision's output. Inspect the current command result before using an existing path.

When the final revision is ready:

```sh
npx opendoc export my-report --json
```

This writes `output/my-report.pdf`. Export renders fresh in Headless, independently of any browser session or stale server state. Keep source unchanged between final review and export, and use the exported file for delivery.

## Presentations

Create a slide scaffold with `--format presentation`, or use a presentation template whose format is inferred:

```sh
npx opendoc create project-deck --project client-work --title "Project update" --format presentation --json
```

Author `Presentation` and explicit `Slide` components, preserving one 960 × 540 PDF page per slide. Complete the same check/review/revise cycle, then export both formats from the same final source:

```sh
npx opendoc export project-deck --json
npx opendoc export project-deck --format pptx --json
```

Deliver both `output/project-deck.pdf` and `output/project-deck.pptx` unless the user requests a single format. Review the PDF even for a PowerPoint-only request because it supplies the layout used for export. Follow [PowerPoint delivery](AUTHORING.md#powerpoint-delivery) for supported effects, editable objects, font embedding, package/content checks, and native inspection when available.

A remote environment need not have Microsoft PowerPoint installed. Complete available PDF and PPTX package/content checks and state when native PowerPoint appearance was not verified; that limitation alone does not prevent delivery of a valid requested file. A failed PPTX export is a separate incomplete format and must be reported and corrected within scope.

## Create themes and templates remotely

Use [opendoc-create-theme](../.agents/skills/opendoc-create-theme/SKILL.md) or [opendoc-create-template](../.agents/skills/opendoc-create-template/SKILL.md). Author the reusable bundle in its workspace catalog, then inspect its real specimen without a browser:

```sh
npx opendoc review --theme my-theme --json
npx opendoc review --template my-template --json
```

Each produces the same page-image, text, PDF, and manifest evidence as a document review. Specimens stay outside the document library and need no project membership. The lighter `themes check <id>` and `templates check <id>` commands validate and render without exporting a specimen. `themes preview <id>` writes `output/themes/<id>.pdf`; `templates preview <id>` writes `output/templates/<id>.pdf`.

Verify catalog discovery with `themes inspect <id>` or `templates inspect <id>`, inspect every specimen page, and exercise representative content and affected instances as required by the skill. Keep the completed theme or template in the remote workspace for reuse. Return its reviewed specimen PDF to show the design. If the user requests a portable bundle, include its source, guide, specimen source, and required local dependencies/assets with their licenses; a specimen PDF alone is not a reusable theme or template.

## Deliver through the host agent

OpenDoc produces files and machine-readable results. The agent sends the requested artifacts through its existing attachment, download, or storage capabilities, within the user's requested destination and scope. For example, a messaging agent may attach the PDF to its current conversation; another agent may expose a downloadable file.

Return accessible artifacts, not a remote-only filesystem path the recipient cannot open. Do not send internal review manifests, source material, or unrelated workspace files unless requested. Keep the final response focused on the deliverables and any concrete unresolved limits. The recipient should never need to install OpenDoc, start its GUI, or repeat the agent's review to complete the requested production workflow.

## Update

From the workspace:

```sh
npx opendoc update --check --json
npx opendoc update --json
```

Updates stay on `@ryanyahya/opendoc-headless` and pin the selected exact version while preserving authored documents, templates, themes, assets, feedback, and project records. They update the installed application and its guidance together; they do not overwrite local catalogs with newly shipped examples. See the [update rules](../README.md#update-an-existing-workspace) for compatible versions and explicit version selection.

The workspace runs trusted TSX code. Render workers contain crashes and timeouts, not hostile code. The host agent's environment owns its own isolation and access controls; see [Security](../SECURITY.md).
