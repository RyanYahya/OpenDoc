# Using OpenDoc

An open-source document-production workspace for making well-designed documents and presentations in English, Arabic, or both with a coding agent, on your computer or in a remote agent environment.

Open source under the [MIT license](../LICENSE). Start with the included welcome document and presentation; no personal workspace, account, or API key is included or required.

In normal OpenDoc, **Documents** and **Presentations** have separate library pages and share the same PDF reader, text corrections, comments, projects, media, and assets. Presentations use explicit 16:9 slides with strict overflow checks. Create one with `npx opendoc create my-deck --project client-work --title "My presentation" --format presentation`, then author it using `Presentation` and `Slide`; see [presentation authoring](AUTHORING.md#presentations). **Templates → Presentations** offers researched Pitch deck, Brand guidelines, Company profile, and Proposal deck skeletons. Use `--template <id>` to start from one; its presentation format is inferred. Current themes supply fonts and colors.

Bring a brief and your source material. An external coding agent authors and designs the work using native PDF components. Normal OpenDoc gives you a browser workspace for review, quick text corrections, and comments. OpenDoc Headless lets a remote agent complete the same authoring, review, and export workflow, then deliver the finished PDF or editable PowerPoint through its existing channel. The recipient needs no OpenDoc installation.

Both editions share one repository, release version, engine, authoring API, and **full starter library** of editable templates, themes, fonts, and welcome examples. Your source and assets live in the workspace environment you choose. Headless removes the browser interface and its service dependencies; it does not remove the design library or introduce a hosted service, embedded AI, or messaging connector.

## Start

Requires **Node.js 24 or newer** and **npm** on macOS or Linux in the environment running OpenDoc. Windows has not yet been verified.

### Normal OpenDoc

For the browser workspace on your computer:

```sh
npx @ryanyahya/opendoc init
```

The default location is `~/Documents/My OpenDoc`. Choose another location by passing it as the destination, for example `npx @ryanyahya/opendoc init ~/Documents/ClientPublications`. The destination must be new or empty. Initialization installs a pinned OpenDoc version, copies the welcome documents and editable catalogs, starts the local service in the foreground, and opens your browser. Use `--no-start` to create the workspace without launching, or `--no-open` to start without opening a browser.

Keep the terminal running while you use the app; press **Ctrl-C** to stop it. Open the localhost URL printed there if the browser does not open. The workspace starts with **Getting started → Welcome to OpenDoc**. Use the **+ beside Projects** in the sidebar to create a home for your work. **Create document** and **Create presentation** prepare a prompt for your coding agent; see [Create in the app](#create-in-the-app). The resulting work appears automatically.

To return later:

```sh
cd "$HOME/Documents/My OpenDoc"
npx opendoc start
```

Document, template, theme, and asset edits refresh while the service runs. Commands find the workspace from your current directory or any parent; `--workspace /path/to/workspace` targets one explicitly. Run `npx opendoc --help` to discover commands, `<command> --help` for details, and add `--json` for structured output.

Installation and updates need network access; the app runs locally afterward without an account or API key. An external coding agent may have its own requirements. The service listens on loopback; use the printed address instead of assuming a port. `OPENDOC_PORT` requests a fixed port.

### OpenDoc Headless

Install where your remote agent runs, with an explicit new or empty destination:

```sh
npx --yes @ryanyahya/opendoc-headless init ./workspace --json
cd ./workspace
npx opendoc check --json
npx opendoc review welcome --json
npx opendoc export welcome --json
```

Initialization is noninteractive and never opens a browser or starts a service. The welcome export is `output/welcome.pdf`; the review command supplies its page images, text, and technical issues for the agent to inspect. For actual work, the agent writes the requested content, checks and reviews it, revises it, then exports and delivers the requested files. A successful render alone is not a completed review.

Inside either edition, commands remain `npx opendoc` and authoring imports remain `opendoc`. Both use the `opendoc` dependency key with an exact npm alias: `npm:@ryanyahya/opendoc@<version>` for normal OpenDoc or `npm:@ryanyahya/opendoc-headless@<version>` for Headless. The Headless alias resolves its authoring imports without installing the normal application. The workspace can persist for future revisions and reusable themes/templates, or be disposable for a single job. See [OpenDoc Headless](HEADLESS.md) for the complete remote workflow, specimen creation, structured results, and file delivery.

## Update an existing workspace

In normal OpenDoc, first stop the foreground service with **Ctrl-C**. Then run this from either edition's workspace:

```sh
npx opendoc update
```

By default, the updater chooses the latest release within the installed version's compatible range and pins its exact version. `npx opendoc update --check` reports available versions without changing the installation. Use `npx opendoc update --version <exact-version>` to choose a published stable release explicitly, including an upgrade or downgrade outside that range; tags, ranges, and prereleases are not accepted.

Updates preserve the chosen edition: normal OpenDoc updates from `@ryanyahya/opendoc`; Headless updates from `@ryanyahya/opendoc-headless`. They replace the application and its versioned guides while preserving your documents, templates, themes, assets, feedback, and project records. They do not merge new catalog examples into an existing workspace or migrate an old source checkout. Keep working in the initialized workspace; restart with `npx opendoc start` when using the normal browser edition.

## Create and revise

Both editions use the same [agent guide](../AGENTS.md) and skills. In Headless, the agent works from explicit task context and catalog IDs and delivers files remotely; it does not require an active browser selection. The following browser interactions apply to normal OpenDoc.

**Skills** in the sidebar footer, and **Agent skills** in the reader's **Skills and appearance** menu, open a quick index of the ten `opendoc-` skills with each skill's name and purpose. The root [AGENTS.md](../AGENTS.md) routes ordinary requests to the matching workflow; naming a skill is optional. The app does not run the agent itself.

### Create in the app

OpenDoc has no built-in AI: your coding agent writes every document, and the app prepares the request and shows the result. **Create document**, **Create presentation**, a project's **Create** menu, **Use this template**, and **Create with this theme** all open **Create with your agent**. On the Documents, Presentations, and project pages, Alt+N (Option+N on a Mac) opens it too, unless you are typing in a field or a menu or dialog is open. It works in three steps:

1. **Describe it.** Write an optional brief: who it is for, what it should say, and which sources you will share with the agent. Check the choices beside it: **Format** (Document or Presentation), **Project**, **Theme**, and **Template**. Each entry point fills in what it knows: a project page its project, a template page its template and format, a theme page its theme. **Theme** starts from the project's default for the chosen format and lists every theme with its folder; **Template** lists the templates for that format with their type. Changing the format clears a template of the other format. **Let your agent choose** leaves a project or theme to the agent, which asks when the choice matters.
2. **Copy the prompt.** The prompt beside the choices updates as you change them. Choose **Copy prompt** or press Ctrl+Enter (⌘+Enter on a Mac). If the browser blocks copying, select the prompt and copy it yourself.
3. **Paste it into your agent** with your source material.

After you copy, the project page and the Documents or Presentations library show a **Waiting for your agent** card with the brief's opening words, the chosen format, theme, and template, and when it was copied. **Copy prompt again** copies the same prompt; the close button dismisses the card. When a new document or presentation appears in that project, the card turns to **Ready** with an **Open** button and a notification announces it; a ready card clears after 15 minutes, and a waiting one after 24 hours. Waiting cards live in this browser's storage only. They are not workspace content, so they are never synced with the workspace or read by the agent, and another browser does not show them.

### Ask your agent directly

Open your workspace folder in your coding agent and ask:

> Create a presentation from these notes for our project kickoff. Use our project theme. Ask me if you need to clarify the audience or template.

The workspace's `AGENTS.md` and `.agents/skills/` point to the guidance shipped with its installed OpenDoc version. The agent uses [opendoc-create](../.agents/skills/opendoc-create/SKILL.md) for both documents and presentations. It follows explicit choices, asks when a meaningful theme or template preference is unclear, and exercises judgment when design is delegated. Documents are delivered as reviewed PDFs; presentations include both PDF and editable PowerPoint unless you request otherwise. You can also invoke `$opendoc-create` explicitly. Edit your content in the workspace; the app and complete guides live under `node_modules/opendoc/`.

The agent resolves a project and design direction, then creates the source through the supported command. For a written brief:

```sh
npx opendoc projects create client-work --name "Client work" --theme neutral
npx opendoc create my-brief --project client-work --title "A better handoff"
```

Creation makes a minimal draft, its project assignment, exact asset selections in `assets.json`, and a `theme.tsx` adapter. The agent develops `documents/my-brief/index.tsx` using native PDF components. A project can set one default theme for documents and another for presentations; `--format presentation` and presentation templates use the presentation default. Defaults apply to future work; moving a document or changing a default leaves existing choices intact. See [Projects](PROJECTS.md#commands).

**Templates** offers reusable layouts with real PDF specimens and a readable **Agent instructions** guide. **Themes** offers design systems with their own components, palettes, typography, and a **Design guide**. Pick a template when its structure helps; the brief can also call for a bespoke document. [Authoring](AUTHORING.md) describes the component API.

In the reader, select a component and choose **Edit** or **Comment** in the selection bar; drag across words first to comment on that phrase only. Text edits preview as a browser draft; **Save all** writes the group to local source. Drafts survive navigation and reload in the same tab. Formatting, calculations, and structural changes belong with your agent. Comments save independently, retain their history, and stay attached through reflow when block identities are preserved. The **Comments** button in the reader toolbar opens them and counts the open ones. Each comment shows whether it is open or resolved; while any are open, the **Comments** tab can copy a prompt asking your agent to apply them. [Selection and corrections](SELECTION.md) explains supported edits and conflict recovery.

OpenDoc keeps every saved edit, agent change, and restore for 90 days; the **History** button in the reader toolbar lists them. Restore one paragraph, one section, or a whole earlier version and leave the rest as it is; every restore offers Undo. Deleted comments stay under **Recently deleted** in the **Comments** tab. [Version history](HISTORY.md) explains what is recorded and when a restore is refused.

Use the document **…** menu to rename, duplicate, move, or delete it. Rename changes the library name, while the PDF title remains authored content. Duplicate copies saved source, local data, media, and feedback. Delete offers Undo and keeps a recovery folder in `.opendoc/trash/`; existing exports remain in `output/`. `npx opendoc documents rename|duplicate|delete|trash|restore` does the same from the command line, in either edition. [Projects](PROJECTS.md) covers membership and recovery.

## Find work in the library

**Documents**, **Presentations**, each project, **Themes**, **Templates**, and **Media & Assets** share one filter bar, in the same order on every page:

- **Search** comes first. It matches names and descriptions, and on documents and templates also their type, status, and custom tags. Every word you type must match, in any order.
- The page's main choice follows as buttons with counts: **All**, **Documents**, and **Presentations** in a project that holds both; the theme folders on **Themes**; **Documents** and **Presentations** on **Templates**; and **Media**, **Logos**, and **Fonts** on **Media & Assets**.
- **Filter** holds every other way to narrow the list: **Type**, **Status**, **Language**, and **Tag** for documents; **Type**, **Language**, and **Tag** for templates; **Language** and **Tag** for themes; **Document** and **Kind** for media; and archived logos or fonts under **Status**. A choice appears only when it would narrow the list, so a page whose items are all drafts offers no status filter. The button counts the active filters, and each one shows beside it as a chip; select a chip to remove that filter, or **Clear** to remove them all.
- **Sort** comes last, with the gallery or list view on document pages. Documents and presentations sort by **Last edited** (the default), **Title A–Z**, **By project**, or **By status**, and a project by **Last edited**, **Title A–Z**, or **By status**. Themes and templates sort by name or **Last edited**, templates also **By type**; media sorts **By document** or **Title A–Z**; logos and fonts by name or **Last updated**. Each page remembers its sort order in this browser. **Last edited** is when the item's source files last changed; new comments do not count.

The address keeps the search and filters, for example `#project/client-work?status=draft&language=arabic`, so a link reopens the same view and **Back** and **Forward** step through filter changes. Typing in search updates the address without adding a history step, and returning from a document, theme, or template restores the view you left.

## Use media, logos, and fonts

**Media & Assets** separates document-owned visuals from reusable families:

- **Media:** photographs, illustrations, charts, and diagrams, with each visual's metadata and optional prepared data and recipe beside it. Add or regenerate these with your agent. Original reference material stays in its existing project location. See [Media](MEDIA.md).
- **Logos:** import SVG or PNG, add named variations, and describe when to use each. A saved document binding pins the chosen version. Place it explicitly with `Logo`; the app's appearance does not select artwork.
- **Fonts:** import original static TTF/OTF faces and inspect their real PDF specimens. Inter, Roboto, Open Sans, Lato, and Merriweather are bundled with six styles each; Geist includes regular, medium, and bold; Noto Naskh Arabic, the automatic fallback for Arabic text, includes regular, medium, semibold, and bold. Each family retains its license. Fonts must pass compatibility checks before becoming body or heading defaults.

Theme details can choose assets for **new documents**. Updating a family or theme default does not silently change an existing document. Use the app or the same local CLI, described in [Assets](ASSETS.md):

```sh
npx opendoc assets list
npx opendoc assets inspect logo acme
npx opendoc assets bind my-brief logo acme
```

## Review and export

Both editions can prepare review evidence without a browser:

```sh
npx opendoc review my-brief --json
npx opendoc review --theme neutral --json
npx opendoc review --template editorial-essay --json
```

Each successful result supplies a PDF, page PNGs, extracted text, render issues, and a manifest identifying the exact PDF revision and its sources. The command renders saved workspace source directly; in normal OpenDoc, save intended browser text corrections first. The agent inspects these artifacts and refines the work before final export. The manifest's `visualReview` and `factualReview` stay `required`: preparing evidence does not perform those reviews. A character that no font in the document covers prints as `?` and appears as a `missing-glyphs` issue; Arabic text needs no font setup, because OpenDoc falls back to the bundled Noto Naskh Arabic. See [Headless review](HEADLESS.md#author-inspect-revise-deliver).

In normal OpenDoc, the reader shows the real PDF, including navigation, links, and current render warnings. An invalid revision keeps the last successful preview visible and blocks export until corrected. Review the current ready PDF, including every page, source notes, and representative copied text. The [opendoc-review-document skill](../.agents/skills/opendoc-review-document/SKILL.md) supplies the final pass.

In the browser, **Export → Save PDF** saves the reviewed bytes in `output/`, preserving existing files with numbered names. Save pending text corrections and review the updated PDF first. The result can reveal the file, download a copy, or open the PDF to print. For presentations, choose **PowerPoint (.pptx)** to save editable text and shapes with embedded fonts. Images and existing chart artwork remain images. On macOS it can also copy the exported file to the system clipboard. **Previous exports**, in the Export dropdown and in a card's **…** menu, lists saved files by their actual filenames, with open, reveal, and delete-with-Undo actions; files from `npx opendoc export`, which are named by the document's ID, are marked **Saved from the command line**. If a save response is interrupted, **Check export** recovers the same request.

Command-line export supports single documents and batches:

```sh
npx opendoc export my-brief
npx opendoc export welcome-presentation --format pptx
npx opendoc export welcome my-brief --json
npx opendoc export --all --json
```

PowerPoint export uses the successful render’s content, media, and font bytes. It supports 16:9 slides with editable text, rectangular shapes, and images. Unsupported effects or fonts produce a specific error and preserve existing exports. Tables composed from individual blocks stay separate objects; chart images stay images. Embedded fonts must permit editing and have TrueType outlines. Representative slides were reviewed in PowerPoint on macOS; Windows compatibility has not yet been verified.

CLI export writes `output/<id>.pdf` or `output/<id>.pptx`, replacing that document's previous CLI output only after successful rendering and freshness checks. In normal OpenDoc, a running local service supplies current preview bytes; without it, export renders fresh. Headless always renders directly and does not consult a browser session. Inspect each batch result. Saved exports are independent of later edits and retain their asset provenance when available.

## Find the right guide

For development and pull requests, read [Contributing](../CONTRIBUTING.md). Review the local trust model in [Security](../SECURITY.md) and the bundled notices in [Third-party notices](../THIRD_PARTY.md).

| Task | Read |
| --- | --- |
| First agent task or source conventions | [AGENTS.md](../AGENTS.md) |
| Produce finished files remotely without a GUI | [OpenDoc Headless](HEADLESS.md) |
| Write a document or use PDF primitives | [Authoring](AUTHORING.md) |
| Restore earlier wording or deleted comments | [History skill](../.agents/skills/opendoc-history/SKILL.md), [Version history](HISTORY.md) |
| Tag, find, or organize work | [Organize skill](../.agents/skills/opendoc-organize/SKILL.md), [Tags](TAGS.md) |
| Resolve the active document or feedback | [Current document skill](../.agents/skills/opendoc-current-document/SKILL.md), [Selection](SELECTION.md) |
| Update, translate, convert, or retheme existing work | [Revise skill](../.agents/skills/opendoc-revise-document/SKILL.md), [Authoring](AUTHORING.md) |
| Manage logos, fonts, and document images | [Assets and media skill](../.agents/skills/opendoc-assets-media/SKILL.md), [Assets](ASSETS.md), [Media](MEDIA.md) |
| Create or adapt a reusable layout | [Templates](TEMPLATES.md) |
| Create or apply a design system | [Themes](THEMES.md) |
| Manage projects and document ownership | [Projects](PROJECTS.md) |
| Prepare document visuals | [Media](MEDIA.md) |
| Import and bind shared logos or fonts | [Assets](ASSETS.md) |
| Change the app or prepare a release | [Validation](../VALIDATION.md), [Appearance](APPEARANCE.md) |
| Understand licenses and the PDF engine repair | [Third-party notices](../THIRD_PARTY.md), [Forme repair](../vendor/formepdf/README.md) |

## Develop the application

Contributors work in a source checkout with Node.js 24 or newer and **pnpm 12.3.4**, pinned in `package.json`:

```sh
pnpm install --frozen-lockfile
pnpm dev
```

For the built interface, run `pnpm build` followed by `pnpm start`. These contributor commands use the checkout's catalogs and local service. Ordinary writing in an installed workspace uses `npx opendoc` and does not require a source checkout or a frontend build.

Before opening a pull request, run `pnpm verify` for typechecking, the full test suite, and the production build. The same checks run on Linux and macOS in CI. See [Validation](../VALIDATION.md) for the local workflow and PDF acceptance checks. Package both releases with `pnpm package:pack`; it produces `output/packages/ryanyahya-opendoc-<version>.tgz` and `output/packages/ryanyahya-opendoc-headless-<version>.tgz`. Use both reviewed tarballs for clean-install acceptance and any explicitly authorized npm publication. Both include the same repaired PDF engine and full starter catalogs; normal OpenDoc additionally contains the built browser interface. Use `--edition normal` or `--edition headless` for a focused package build. Do not substitute a direct `npm pack` from the checkout.

## Workspace boundaries

`documents/` holds authored work, with each document's version history in its own `.history/` folder; `templates/` holds reusable layouts and data contracts; `themes/` holds executable visual systems; `assets/` holds shared local resources. `projects.json` records document membership. The optional `tags.json` holds each document's and template's type, each document's status, and custom tags ([Tags](TAGS.md)), and the optional `themes/folders.json` groups themes into single-level folders, shown as folder buttons in the Themes filter bar, without moving them ([Themes](THEMES.md#organize-the-catalog)). `.opendoc/` holds generated context, previews, recovery records, and session state; `output/` holds exported PDFs and PowerPoint files. Generated state and exports are ignored by Git.

Authoring uses the public imports `opendoc`, `opendoc/template`, `opendoc/assets`, and `opendoc/themes`. Keep references to your editable local catalogs relative to the workspace. The pinned application dependency lives in `node_modules/opendoc`; ordinary document work does not change it. The workspace's `package.json`, lockfile, and `.opendoc/workspace.json` identify its installation and format.

In a source checkout, `src/document/` implements the authoring API, `src/template/` binds validated data, `src/assets/` owns shared asset contracts, `src/rendering/` supplies shared render utilities, `src/cli/` owns installation and command dispatch, and `src/server/` contains render/file operations alongside the normal edition's service entry. `src/shared/` holds shared contracts and `src/app/` is the browser review interface. Shared render and export operations are callable without the service; both packages use the same implementation.

OpenDoc remains a TSX authoring product for English and Arabic or mixed right-to-left content ([Authoring](AUTHORING.md#arabic-and-right-to-left-text)) that runs in the user's or agent's workspace. It has no embedded AI, Markdown document editor, visual theme editor, or cloud collaboration. Document code is trusted local code; render workers isolate crashes and timeouts, not hostile code. Keep the service local and never copy `.opendoc/server.json`'s session token into documents, logs, or messages.
