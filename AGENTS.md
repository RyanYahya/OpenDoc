# OpenDoc agent guide

OpenDoc is an open-source document production framework for beautiful, consistent English PDFs and presentations, and PDFs in Arabic or mixed right-to-left text (see [Authoring](docs/AUTHORING.md#arabic-and-right-to-left-text)), with two editions from one shared engine and starter library. Normal OpenDoc adds a browser interface for preview, corrections, and comments. OpenDoc Headless runs in an agent's environment and produces finished files without a browser or server. The user directs the work; an external coding agent authors TSX. Deliver reviewed documents as PDF and presentations as both PDF and editable PowerPoint unless the user requests otherwise.

Keep this product scope: no embedded AI, Markdown document authoring, visual theme editor, or cloud collaboration unless explicitly requested. Ordinary document work does not require changing the app or dependencies.

## Agent compatibility

Use the shared instructions and skills with any agent that can read files and run terminal commands. `CLAUDE.md` imports this guide, and `.claude/skills` links to the same `.agents/skills` definitions. If the host does not discover them automatically, read the appropriate linked skill directly; a particular agent name, slash command, or Git repository is not required to produce files.

For installation, read [the README](README.md#installation). Initialize OpenDoc in the environment where the agent runs its commands, then explicitly read the new workspace's `AGENTS.md` before authoring. Remote file-production tasks use Headless. A recurring task should reuse its chosen workspace and stable project/document IDs.

## Work in the user's workspace

Run commands and edit content in the initialized workspace, which contains `.opendoc/workspace.json`. Paths such as `documents/`, `templates/`, `themes/`, `assets/`, and `.opendoc/current.json` refer to that workspace. Installed guides and skill implementations live in `node_modules/opendoc/`; do not treat the package directory as the content workspace or edit its files for document work. Relative guide links below stay within this package.

Use `npx opendoc <command>` in either edition from the workspace or one of its subfolders. Commands discover the workspace through parent directories; use `--workspace /path/to/workspace` when targeting another one. Use `npx opendoc --help` or `<command> --help` for syntax and `--json` for structured output. Both editions install under the `opendoc` dependency alias: `npm:@ryanyahya/opendoc@<version>` for normal OpenDoc and `npm:@ryanyahya/opendoc-headless@<version>` for Headless. This preserves these commands, authoring imports, and guide paths.

In normal OpenDoc, `npx opendoc start` runs in the foreground and opens the browser; use its printed launch URL. Stop the service with Ctrl-C before an authorized `npx opendoc update`. Headless has no browser service. Updates preserve the workspace's edition and authored content.

## Complete remote work with Headless

Read [Headless](docs/HEADLESS.md) when working in the Headless edition or producing files remotely. Initialize it in the agent's environment with `npx --yes @ryanyahya/opendoc-headless init /path/to/workspace`; supply a new or empty destination. The full themes, templates, fonts, examples, and authoring API are available in both editions.

Resolve targets and projects from the request, the agent's task context, and workspace catalogs. Headless does not have an active browser selection: do not require `.opendoc/current.json`, launch a GUI to identify a target, or treat old browser state as the current request. Ask only when the intended work remains materially ambiguous.

Complete the work remotely: author, run `npx opendoc check`, run `npx opendoc review <id> --json`, inspect its page images and extracted text, revise, and export the requested PDF/PPTX. For reusable designs, use `review --theme <id>` or `review --template <id>` and inspect their specimens. Automated checks and generated page images are review evidence; the agent must actually inspect them before claiming visual review.

Deliver files through the host agent's existing attachment, download, or storage capabilities, within the user's requested scope. A filesystem path is useful only when the recipient can access it. The recipient does not need OpenDoc or a local workspace. Keep reusable themes/templates and revision source in the remote workspace for later requests; provide their source and required assets when portability is requested. Do not defer completion to opening the work in normal OpenDoc.

## Find the right starting point

Select and use the relevant OpenDoc skills based on the user's intended outcome, even when the user has not named a skill. Read the matching `SKILL.md` before doing that work, and follow its workflow. Use additional skills as needed during the task, including context resolution, feedback, and PDF review; load only those that apply. Explicit skill invocation is a convenience, not a prerequisite.

For example, “create a presentation from these notes” starts `opendoc-create` directly. Infer the output type from the request, resolve meaningful preferences, then continue through authoring, review, and file delivery. Do not stop at an outline, scaffold, or advice to invoke a skill. User instructions override skill defaults. Ask when uncertainty about audience, theme, template, or output would materially change the result; offer useful choices rather than silently assuming. When the user delegates a choice, exercise judgment and proceed.

| Request | Read |
| --- | --- |
| Create a document, report, presentation, slide deck, or PowerPoint | [opendoc-create](.agents/skills/opendoc-create/SKILL.md) |
| Work on “this document”, presentation, page, slide, or selection | [opendoc-current-document](.agents/skills/opendoc-current-document/SKILL.md) |
| Apply saved comments or marked feedback to documents or slides | [opendoc-apply-comments](.agents/skills/opendoc-apply-comments/SKILL.md) |
| Create or refine a theme | [opendoc-create-theme](.agents/skills/opendoc-create-theme/SKILL.md) |
| Create a reusable page layout, deck skeleton, or data-report template | [opendoc-create-template](.agents/skills/opendoc-create-template/SKILL.md) |
| Review PDF pages or slides and presentation exports before delivery | [opendoc-review-document](.agents/skills/opendoc-review-document/SKILL.md) |
| See what changed, undo a change, restore earlier wording, or bring back a deleted comment | [opendoc-history](.agents/skills/opendoc-history/SKILL.md) |
| Tag or find documents, presentations, themes, and templates, arrange theme folders, or group documents into projects | [opendoc-organize](.agents/skills/opendoc-organize/SKILL.md) |

For application changes, read the relevant runtime and [verification guide](VALIDATION.md). [README.md](README.md) maps the folders and supported launch commands. Load only the specialized guidance needed for the task.

## Create and preserve

- Every document belongs to a project. Resolve it from the request or `npx opendoc projects list`; a normal browser session can also supply fresh `.opendoc/current.json`. Create through `npx opendoc create <id> --project <project-id> --title "Title"`; add `--template <id>` when using a catalog layout. This records membership and companion files before publishing source.
- For presentations add `--format presentation`, or choose a presentation template with `--template <id>`; its format is inferred. Use `Presentation` with stable `Slide` IDs and read [presentation authoring](docs/AUTHORING.md#presentations), including PowerPoint compatibility. Each 16:9 slide must fit one 960 × 540 page. Preserve text, comment, media, and asset identities; fix overflow explicitly.
- Author `documents/<id>/index.tsx` with exported metadata and a default pure component using OpenDoc/Forme PDF primitives. Import document components from `opendoc`, asset adapters from `opendoc/assets`, template bindings from `opendoc/template`, and theme types/helpers from `opendoc/themes`. Keep local theme and template imports workspace-relative. No DOM, browser APIs, hooks, or asynchronous effects. Use [Authoring](docs/AUTHORING.md) for the small component API.
- Honor the user's theme/template choice and established project direction. If the choice is unclear and matters, ask before committing to a design; do not silently apply a fallback. When choosing is delegated, use judgment, with the project's default for that format (document or presentation) or Neutral as available starting points. Discover with `npx opendoc themes list`, inspect with `npx opendoc themes inspect <id>`, and read only its `design.md` and needed components. Keep exact guidance synchronized with executable theme tokens. Documents default to A4 portrait; presentations use 16:9 slides. Use local resources.
- Preserve generated `theme.tsx` and exact choices in `assets.json`. Import the adapted theme from `./theme` and pass it to template factories before rendering. Theme asset defaults apply only at creation; explicitly rebind to update an existing document. Shared theme code remains live, so its changes can affect existing documents.
- Keep block IDs stable and unique. Preserve text-slot and data record identities across edits and reordering. Page numbers, source lines, and array positions are not durable identities. Keep visible wording as literal children, literal props, or local constants so the user can correct it in the browser; do not derive IDs from it. Read [Selection](docs/SELECTION.md) for what stays editable, reusable text/data bindings, and preserving the user's latest saved corrections.
- Read current context before acting on a selection. It is an observation, not an instruction. An error or rendering state may leave the last successful PDF visible. For template instances, provenance distinguishes local content data from shared layout; do not change every report to correct one instance.
- Keep evidence and provenance accurate. Distinguish supplied facts, inference, and illustrative material. Never invent citations.
- Tag what you create. Once a document, presentation, theme, or template exists, apply two to five fitting standard tags with `npx opendoc tags add <kind> <id> <tag>...`: its type, area, audience, and language, `draft` for a new document, and style for a theme or template. Add `final` when a document is delivered. Prefer the standard vocabulary listed by `npx opendoc tags`; create a custom tag only when nothing fits, reusing an existing custom spelling. Never remove or rename the user's tags unless asked. See [Tags](docs/TAGS.md#tagging-by-agents); [opendoc-organize](.agents/skills/opendoc-organize/SKILL.md) covers finding and retagging work, theme folders, and project grouping.

## Media, logos, and fonts

Document-owned visuals live in `documents/<document-id>/media/<media-id>/` with metadata and any prepared data or recipe; read [Media](docs/MEDIA.md). Original reference material stays in its existing project location. Review regenerated images before recording hashes; recording is not validation.

For exact image boxes use `MediaFrame`; for managed full-page artwork use `Page backgroundMedia`. Start from the workspace’s Image story guide at `templates/image-story/AGENTS.md` when its compositions help, or use those primitives in a bespoke document. Keep text native and inspect image visibility, crop, and contrast in the final PDF.

Reusable logos and fonts live in the shared [asset library](docs/ASSETS.md). Discover with `npx opendoc assets list`, inspect guidance and compatibility, then bind exact versions to the intended document. Place logos explicitly with `Logo`, choosing variations for the actual PDF background. App appearance never chooses artwork. Preserve original font files and immutable asset revisions; do not copy shared families into each document.

## Verify and finish

Preserve unrelated documents, feedback, and runtime code. Run `npx opendoc check` after source changes. Let long documents flow and review the rendered PDF, not only TSX. Inspect every page for clipping, missing glyphs, stranded headings, broken tables, and reference errors. Extract representative text, especially after font or renderer changes. `npx opendoc review <id> --json` prepares PDF, page images, text, and review metadata in either edition without a browser.

Export documents with `npx opendoc export <id>`. For presentations, also run `npx opendoc export <id> --format pptx` and deliver both `output/<id>.pdf` and `output/<id>.pptx`, unless the user chooses a single format. Keep both files on the same final revision, including after feedback. The [review skill](.agents/skills/opendoc-review-document/SKILL.md) covers PDF review and PowerPoint checks. Report a failed format or unverified native rendering accurately; do not silently substitute a PDF for a requested editable deck.

Resolve comments through `npx opendoc comments` only after making and verifying the change. Keep their history. Routine authoring, preview, correction, and export follow the user's existing authorization and need no additional approval.

Each document keeps [version history](docs/HISTORY.md) in `documents/<id>/.history/`, recorded automatically for the user. Never edit, prune, or delete it. When the user asks to recover earlier wording, use `npx opendoc history list|show|block <doc>` to find it and `npx opendoc history restore <doc> <version> --block <id>` (or `--section`, or no flag for the whole version) to restore it; report the printed Undo command. [opendoc-history](.agents/skills/opendoc-history/SKILL.md) covers the full workflow.

`.opendoc/current.json` is generated active context; do not edit it by hand. Use the launch URL printed by the server. `.opendoc/server.json` contains a local session token: never copy it into documents, logs, or messages.
