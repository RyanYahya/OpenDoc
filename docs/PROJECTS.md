# Projects

A workspace contains projects, and every newly created document must have a project. A new workspace starts with **Getting started** and the **Welcome to OpenDoc** document and welcome presentation. Paths in this guide refer to the workspace root; the installed guide itself lives in `node_modules/opendoc/docs`.

## In the app

Use the **+ beside Projects in the sidebar** to create a project. A name is required; a default theme is optional. Choose a project in the sidebar to create and find its documents. **Documents** shows all documents across the workspace, with project links beneath their previews. There is no separate projects overview page. On narrow screens, **Open sidebar** reveals the full project list and creation button. **Project settings** changes its name or default theme. **Move to project** changes an existing document’s membership. A project can be deleted only when it has no documents.

**Create document** and **Create presentation** provide agent prompts carrying the current project, without a title, purpose, or theme form. **Use this template** and theme-based creation carry the selected layout or theme in the prompt. The agent follows [opendoc-create](../.agents/skills/opendoc-create/SKILL.md), resolves any missing project from the brief or current context, and asks when a meaningful design preference is unclear. Naming the skill is optional. Creation requires project membership; the CLI uses an explicit theme override, then the project default, then Neutral. Those fallbacks apply after the agent resolves the user's direction. Explicitly requested starter examples retain their own fallback themes. Changing a project default applies to future work. Moving a document or presentation keeps its existing theme.

Switch between **Gallery** and **List** beside the document count in Documents or any project. List shows a compact first-page PDF thumbnail, name, document details, and a project link in Documents. The browser remembers one shared view preference. Switching views preserves the current search.

The **…** menu on every card or list row offers **Rename**, **Duplicate**, **Move to project…**, and **Delete**. These actions also appear in the reader’s **Document options** menu. Rename changes the library name; the PDF title stays authored in source. Duplicate copies saved source, local media, and feedback into the same project, rebinding supplied template instance IDs and local data paths. It does not include unsaved browser drafts. Delete asks for confirmation and shows an **Undo** notification. Its saved folder and receipt remain recoverable in `.opendoc/trash/<restore-id>/`; existing PDF exports remain in `output/`. Restore refuses to overwrite a reused ID and requires the original project to exist.

Opening a document hides the workspace sidebar and gives the reader the full window. The header’s back arrow returns to the project, Documents, or other workspace view you opened from and restores navigation. A directly opened document returns to its project, or Documents if it has no project. The same pattern applies on mobile.

If files from an older workspace have no assignment, **Documents** keeps them accessible and offers **Choose a project** beneath each unassigned document. OpenDoc does not invent a replacement project or silently discard these files.

## Local files

`projects.json` owns project names, optional default themes, document assignments, and optional library names:

```json
{
  "version": 1,
  "projects": [
    { "id": "getting-started", "name": "Getting started", "defaultTheme": "neutral" }
  ],
  "assignments": { "welcome": "getting-started" },
  "names": { "welcome": "Workspace guide" }
}
```

Documents remain at `documents/<id>/index.tsx`. Grouping is separate from physical folders. Renaming projects or documents and moving documents do not move files or rewrite imports, media, comments, or PDF contents. Document IDs are unique across the workspace. Templates and themes remain shared resources.

The creation service records membership before exposing a new document entry. Browser and command-line changes serialize through a local lock and atomically replace the manifest. Invalid registries are reported without being overwritten. If a process terminates while holding the project lock, the next operation recovers it only after confirming the owner is no longer running. An active or unrecognized lock remains protected; retry after the other operation finishes rather than deleting its lock blindly.

The optional `names` map is keyed by stable document ID. Without an override, the app uses the PDF metadata title. The generated `.opendoc/current.json` distinguishes the library `name` from the authored `title` and includes the active project and its default theme alongside the document or selection. Do not edit this generated context by hand.

## Commands

Run from the workspace root, or add `--workspace <path>`. Use `npx opendoc --help` for the command list and `--json` for machine-readable output.

```sh
npx opendoc projects list
npx opendoc projects create client-work --name "Client work" --theme neutral
npx opendoc projects update client-work --name "Client publications" --theme civic-spectrum
npx opendoc projects update client-work --theme none
npx opendoc create proposal --project client-work --title "A proposal"
npx opendoc create brief --project client-work --title "A technical brief" --theme field-manual
npx opendoc projects assign proposal client-work
npx opendoc projects delete empty-project
```

A missing or unknown project prevents creation before any document folder is written. Use the normal creation command for bespoke documents too, then replace its editable source. If importing existing document folders, assign each one using the project command. Preserve unrelated assignments and stable document IDs.
