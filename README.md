# OpenDoc

**OpenDoc is an open-source document production framework for creating beautiful, consistent PDFs and presentations with any agent.**

Bring a brief, your sources, and the agent you already use. OpenDoc gives it a shared design system, reusable templates, and a document engine to turn that material into work you can confidently share—from a two-page proposal to a report series or an editable slide deck.

Work together in the browser, or let an agent produce the finished files entirely on its own machine. Your documents, themes, templates, and assets stay in a workspace you control.

[Get started](#installation) · [Skills](#agent-skills) · [Templates](#templates) · [Themes](#themes) · [Examples](#made-with-opendoc) · [Agent guide](AGENTS.md) · [MIT license](LICENSE)

![OpenDoc's browser interface displaying the Welcome document, with page navigation and PDF export.](https://raw.githubusercontent.com/RyanYahya/OpenDoc/main/docs/showcase/opendoc-gui.png)

## Thoughtful documents, repeatable design

- **Beautiful PDFs.** Compose real typography, flowing text, tables, references, imagery, and full-page artwork. Review the actual rendered pages before sharing.
- **Editable presentations.** Create 16:9 decks and export both PDF and PowerPoint, with native text, shapes, images, and supported embedded fonts.
- **Consistency across projects.** Reuse themes, fonts, logos, and templates so the next report feels like it belongs with the last one.
- **A complete starting library.** Adapt the included templates, explore five themes, or ask your agent to create a design of your own.
- **An easy review loop.** In the browser, correct text directly, leave comments on specific content, and have your agent apply the feedback. Stable identities keep feedback attached through revisions.
- **Files you own.** Keep editable source, project records, and media alongside your exports. Use the same commands locally or in an agent's remote environment.

## OpenDoc or OpenDoc Headless?

Both editions share the **same engine, authoring API, templates, themes, fonts, and examples**. Choose how you want to work.

| | OpenDoc | OpenDoc Headless |
| --- | --- | --- |
| Best for | Working alongside an agent with a visual workspace | Asking an agent to produce and deliver finished files |
| Runs on | Your computer | The agent's local or remote machine |
| Interface | Browser library, PDF reader, text corrections, comments, and export | Terminal commands and structured results |
| Review | Read the PDF in the browser; agents can also inspect page images and text | Agents inspect generated page images and extracted text |
| Output | PDF and editable PowerPoint | PDF and editable PowerPoint |
| Service | A local foreground server while the app is open | No browser or server needed |
| Package | [`@ryanyahya/opendoc`](https://www.npmjs.com/package/@ryanyahya/opendoc) | [`@ryanyahya/opendoc-headless`](https://www.npmjs.com/package/@ryanyahya/opendoc-headless) |

With Headless, the recipient simply receives the PDF or PowerPoint. They do not need OpenDoc installed.

<a id="start"></a>

## Installation

Requires **Node.js 24 or newer and npm**, on **macOS or Linux**. Install or update Node in the environment that will run OpenDoc. npm installs the application dependencies; fonts and the starter library are included. Installation and updates need network access; rendering local content works offline afterward. Windows is not yet verified.

### OpenDoc

```sh
npx @ryanyahya/opendoc init
```

Choose a new or empty folder, or accept `~/Documents/My OpenDoc`. Setup creates your workspace, installs OpenDoc, and opens the browser. Keep the terminal running while you work; press **Ctrl-C** to stop it.

To return later:

```sh
cd "$HOME/Documents/My OpenDoc"
npx opendoc start
```

Pass a destination explicitly with `npx @ryanyahya/opendoc init ./my-workspace`. Add `--no-start` to initialize without launching, or `--no-open` to start without opening a browser.

### OpenDoc Headless

Run this on the machine where your agent executes commands:

```sh
npx --yes @ryanyahya/opendoc-headless init ./my-workspace --json
cd ./my-workspace
```

Setup is noninteractive and requires a new or empty destination. Ask the agent to read the workspace's `AGENTS.md`, then give it your brief and source material.

Try the included example:

```sh
npx opendoc check --json
npx opendoc review welcome --json
npx opendoc export welcome --json
```

The review command returns page images and text for the agent to inspect. The export is `output/welcome.pdf`. For a presentation, export both formats:

```sh
npx opendoc export welcome-presentation --json
npx opendoc export welcome-presentation --format pptx --json
```

Commands inside either edition remain **`npx opendoc`**. Both install under the same `opendoc` dependency alias and use the same authoring imports. [Complete Headless workflow →](docs/HEADLESS.md)

## Work with your agent

OpenDoc works through files and terminal commands. Use **Codex, Claude Code, Cursor, Hermes, Grok Bot**, or another agent with access to those capabilities. Your agent brings the intelligence; OpenDoc provides the production framework. OpenDoc itself requires no model account or API key.

Give an agent this README and a task like:

> Use OpenDoc Headless to turn these notes into a polished project proposal. Install it in your environment if needed, and read the workspace's AGENTS.md. Use a suitable template and theme, flag missing facts, review every page, and return the finished PDF here. Keep the source so we can revise it later.

The workspace's `AGENTS.md` routes requests to six skills for creation, current context, feedback, themes, templates, and review. `CLAUDE.md` imports the shared instructions, and `.claude/skills` exposes the same skills as `.agents/skills`. If an agent doesn't discover skills automatically, have it read the guide and the matching skill directly. Start in the workspace, and explicitly read its guide when installing during an existing conversation.

For an older workspace, preserve its instructions and use the [compatibility setup](docs/HEADLESS.md#agent-setup) to add the shared Claude entry points. Reading the guides works without registering a plugin or publishing the workspace to GitHub.

Agents author TSX using OpenDoc's components, check the source, inspect the rendered pages, revise, and export. For remote work, the agent delivers real attachments or accessible downloads through its existing tools.

## Agent skills

Both editions include **six skills** that guide an agent through the work, from understanding your brief to delivering reviewed files. They cover writing, design, context, feedback, and quality checks. Ask in ordinary language; the [agent guide](AGENTS.md) explains which workflow to use, and each link below opens its full instructions.

| Skill | What it does |
| --- | --- |
| [Create a document or presentation](.agents/skills/opendoc-create/SKILL.md) | Turns a brief and source material into a finished report, proposal, document, or slide deck. Resolves the audience and design choices, selects a project, theme, and template, then authors, reviews, revises, and exports. Documents are delivered as PDF; presentations as PDF and editable PowerPoint, unless you request otherwise. |
| [Understand the current document](.agents/skills/opendoc-current-document/SKILL.md) | Resolves what you mean by “this document,” “this slide,” or “the selected passage,” including the relevant theme or asset. Uses fresh browser context when available, or the task and workspace records in Headless, so edits target the right content. |
| [Apply comments and feedback](.agents/skills/opendoc-apply-comments/SKILL.md) | Reads saved comments and marked passages, makes the requested revisions, and verifies the result before resolving feedback. Preserves content anchors and comment history so corrections stay connected to the work. |
| [Create or refine a theme](.agents/skills/opendoc-create-theme/SKILL.md) | Builds a reusable visual system from your brief, brand materials, or references: typography, colors, spacing, page details, and shared components. Produces and reviews a specimen so the same design can carry across documents and presentations. |
| [Create or refine a template](.agents/skills/opendoc-create-template/SKILL.md) | Builds a reusable page layout, presentation skeleton, or recurring report structure. Separates content from layout where appropriate and verifies a specimen, giving future work a consistent starting point. Use the creation skill above for a single deliverable using an existing template. |
| [Review documents and presentations](.agents/skills/opendoc-review-document/SKILL.md) | Checks the actual rendered pages for clipping, missing glyphs, awkward spacing, broken tables, and reference problems. Inspects extracted text, reviews theme and template specimens, and checks editable PowerPoint exports. Reports any unverified rendering or failed output before delivery. |

Creation, theme, template, and feedback workflows call for review before completion. You can also request a review on its own. Skills use the same files and commands across agents; when automatic discovery is unavailable, the agent can read the linked instructions directly.

## Templates

A template gives your work a useful structure. Adapt its content, pair it with a theme, and keep the parts that serve your brief.

<table>
  <tr>
    <td width="33%"><img src="https://raw.githubusercontent.com/RyanYahya/OpenDoc/main/docs/showcase/template-editorial-essay.png" alt="Editorial essay template with a strong headline and readable prose" /></td>
    <td width="33%"><img src="https://raw.githubusercontent.com/RyanYahya/OpenDoc/main/docs/showcase/template-executive-brief.png" alt="Executive brief template with a decision summary and supporting analysis" /></td>
    <td width="33%"><img src="https://raw.githubusercontent.com/RyanYahya/OpenDoc/main/docs/showcase/template-consulting-report.png" alt="Consulting report template with structured analysis and exhibits" /></td>
  </tr>
  <tr><td><b>Editorial essay</b><br />Give an argument room to develop.</td><td><b>Executive brief</b><br />Make the decision and its evidence clear.</td><td><b>Consulting report</b><br />Structure a recommendation and its exhibits.</td></tr>
</table>

**Documents:** Editorial essay · Executive brief · Consulting report · Business proposal · Monthly report · Scientific paper · Magazine feature · Literary text · Image story · Invoice · Quotation

**Presentations:** Pitch deck · Brand guidelines · Company profile · Proposal deck

Browse them in the app or run `npx opendoc templates list`. Your agent can also create reusable templates of your own. [Template authoring →](docs/TEMPLATES.md)

## Themes

A theme gives documents their visual character: typography, color, spacing, page furniture, and reusable components. Keep a project consistent, or choose a different direction for a new audience.

<table>
  <tr>
    <td width="33%"><img src="https://raw.githubusercontent.com/RyanYahya/OpenDoc/main/docs/showcase/theme-opendoc-neutral.png" alt="OpenDoc Neutral theme specimen" /></td>
    <td width="33%"><img src="https://raw.githubusercontent.com/RyanYahya/OpenDoc/main/docs/showcase/theme-field-manual.png" alt="Field Manual theme specimen" /></td>
    <td width="33%"><img src="https://raw.githubusercontent.com/RyanYahya/OpenDoc/main/docs/showcase/theme-civic-spectrum.png" alt="Civic Spectrum theme specimen" /></td>
  </tr>
  <tr><td><b>OpenDoc Neutral</b><br />Warm paper, charcoal, and precise blue.</td><td><b>Field Manual</b><br />Technical clarity with a bold orange signal.</td><td><b>Civic Spectrum</b><br />Expressive color and confident typography.</td></tr>
</table>

Also included: **Neutral**, a quiet starting point, and **McKinsey Consulting**, an independent consulting-inspired theme with structured exhibits. OpenDoc is not affiliated with McKinsey & Company.

Themes and templates remain editable in your workspace. Shared font families include Geist, Inter, Roboto, Open Sans, Lato, and Merriweather, with their licenses. [Theme authoring →](docs/THEMES.md) · [Fonts and logos →](docs/ASSETS.md)

## Made with OpenDoc

The included **Welcome to OpenDoc** document is a working example of the framework: eight pages of typography, layouts, imagery, charts, and tables. Open it, inspect its source, or ask your agent to use it as a reference.

<p>
  <img src="https://raw.githubusercontent.com/RyanYahya/OpenDoc/main/docs/showcase/welcome-cover.png" width="48%" alt="Welcome to OpenDoc cover" />
  <img src="https://raw.githubusercontent.com/RyanYahya/OpenDoc/main/docs/showcase/welcome-imagery.png" width="48%" alt="Welcome page demonstrating imagery and captions" />
</p>

[Read the Welcome PDF](docs/showcase/welcome.pdf) · [Explore its source](documents/welcome/index.tsx) · [Explore the 14-slide Welcome presentation](documents/welcome-presentation/index.tsx)

The showcase uses the included example content. Illustrative data and generated artwork are identified in the examples; these are demonstrations, not client work.

## Update an existing workspace

Stop the browser edition with **Ctrl-C**, then run this from either edition's workspace:

```sh
npx opendoc update
```

Updates preserve your edition, documents, templates, themes, assets, and feedback. The default selects the latest compatible version and pins it exactly. Use `npx opendoc update --check` to inspect updates, or `--version <exact-version>` to choose one. Restart the browser edition afterward. [Workspace guide →](docs/WORKSPACE.md#update-an-existing-workspace)

## Go deeper

| Task | Guide |
| --- | --- |
| Use the browser, edit text, and manage exports | [Using OpenDoc](docs/WORKSPACE.md) |
| Produce finished files remotely | [Headless](docs/HEADLESS.md) |
| Author documents and presentations | [Authoring API](docs/AUTHORING.md) |
| Create reusable designs | [Templates](docs/TEMPLATES.md) · [Themes](docs/THEMES.md) |
| Work with images, fonts, and logos | [Media](docs/MEDIA.md) · [Assets](docs/ASSETS.md) |
| Apply precise corrections and feedback | [Selection](docs/SELECTION.md) |
| Contribute to the framework | [Contributing](CONTRIBUTING.md) · [Validation](VALIDATION.md) |

For development, use Node.js 24+ and the pnpm version pinned in `package.json`:

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Run `pnpm verify` before contributing. Build both distributions with `pnpm package:pack`; the packages share one repository and release version. npm distributes the installable editions; GitHub hosts source and release notes.

OpenDoc currently supports English content and TSX authoring. It runs trusted document code in your environment. PowerPoint supports editable text, rectangular shapes, images, and compatible embedded fonts; some visual effects are intentionally unsupported. [Security](SECURITY.md) · [Third-party notices](THIRD_PARTY.md)

## License

OpenDoc is released under the [MIT license](LICENSE). Bundled fonts and dependencies retain their own licenses.
