---
name: opendoc-organize
description: Tag, find, and organize OpenDoc documents, presentations, themes, and templates when the user asks to tag or label work, find items by type, status, language, or tag (such as all final minutes or every Arabic report), mark a document final or in review, clean up or rename tags, arrange themes into folders, group documents into projects, move a document to another project, rename or delete a project or set its default themes, or rename, duplicate, delete, or restore a document.
---

Use the user's OpenDoc workspace as the working directory. `documents/`, `templates/`, `themes/`, `assets/`, and `.opendoc/` are workspace paths; guide links are relative to this installed skill. Use `npx opendoc` for commands and keep authoring changes out of `node_modules/opendoc`. In Headless, follow [the remote workflow](../../../docs/HEADLESS.md); these commands and imports stay the same, and no browser or recipient-side installation is needed.

## 1. Read the vocabulary

Run `npx opendoc tags` for the types, statuses, languages, and custom tags with their counts; add `--kind <kind>` to count one kind. `<kind>` is `document`, `presentation`, `theme`, or `template`; a presentation is a document. Read [Tags](../../../docs/TAGS.md) for aliases and limits. Each item has up to four facets:

- **Type**: one per document or template, such as `report`, `minutes`, `proposal`, `brief`, or `guide`. Themes have none.
- **Status**: documents only: `draft`, `in-review`, `final`, or `archived`, or none.
- **Language**: `english`, `arabic`, or `bilingual`, detected from the item and never set.
- **Custom tags**: free text for reused names, such as a client or programme.

**Ready:** the types and the workspace's existing custom spellings are known.

## 2. Find the items

Resolve a named item directly, or "this document" through [opendoc-current-document](../opendoc-current-document/SKILL.md). Find items with the filters each list offers:

```sh
npx opendoc tags find --type minutes --status final
npx opendoc tags find "Client Acme" --language arabic --kind document
npx opendoc tags show document <document-id>
npx opendoc templates list --type invoice
npx opendoc themes list --language arabic
```

`find` requires every listed tag and filter, and reports each item's type, status, language, and custom tags; documents also report their name, format, and project. `--status none` finds documents without a status. Typing an alias selects the type, so "memo" finds `brief` and "quote" finds `invoice`. `npx opendoc projects list` maps documents to projects when the request is scoped to one.

**Ready:** the intended items are listed by kind and ID.

## 3. Apply and clean up

A type spelling sets the item's type and replaces any earlier one; other text is a custom tag. Status is separate:

```sh
npx opendoc tags add document <document-id> minutes "Client Acme"
npx opendoc tags status <document-id> in-review
npx opendoc tags status <document-id> --clear
```

Add a custom tag only for a name that will be reused, reusing an existing spelling. Never set a language. Change or remove tags the user applied only when asked. `tags remove <kind> <id> <tag>...` removes custom tags or the named type, `tags set <kind> <id> <tag>...` replaces an item's type and custom tags, and `tags delete "<custom-tag>"` removes an unused custom tag from the vocabulary; `--untag` also removes it from every item. There is no rename: add the new tag to each item, remove the old one, then delete it.

Before changing several items, replacing an item's tags, or deleting a tag in use, list the planned changes and confirm them with the user.

**Ready:** each requested item carries the intended type, status, and tags, and the user approved any bulk change.

## 4. Arrange theme folders

Change folders only when the user asks; see [Organize the catalog](../../../docs/THEMES.md#organize-the-catalog).

```sh
npx opendoc themes folders
npx opendoc themes folders create Acme
npx opendoc themes assign <theme-id> Acme
```

Folders are single-level: a folder cannot contain another folder, so offer a flat set of names (or a tag) when the user describes a hierarchy. `folders rename <name> <new-name>` renames a folder and keeps its themes, `folders delete <name>` leaves its themes outside any folder without deleting them, and `assign <theme-id> none` takes a theme out of its folder. Quote names with spaces. `folders create` refuses a `/` path and every command refuses `--parent`. Confirm a folder deletion or a move of several themes first. Folders live in `themes/folders.json`; never move, rename, or edit `themes/<id>/`, because documents and project defaults refer to it. A file from an earlier version with nested folders is flattened when read; if `themes folders` reports a `migration`, tell the user which folders were flattened, renamed, or removed before making further changes.

**Ready:** the requested folders and assignments are in place, or no folder change was requested.

## 5. Group documents and manage projects

Documents and presentations are grouped by project; see [Projects](../../../docs/PROJECTS.md). A direct request, such as "move the Q3 report to Client work" or "create a project for Acme", is its own approval: carry it out. Regroup only when asked, never on your own initiative or as a side effect of tagging. When you suggest a grouping yourself, such as documents that share a client, programme, or recurring series, or that sit in a catch-all project, present the proposed projects and memberships and wait for an explicit yes before creating projects or moving documents:

```sh
npx opendoc projects list
npx opendoc projects create <project-id> --name "Project name"
npx opendoc projects assign <document-id> <project-id>
```

Leave `--theme` off a new project unless the user chose its default theme. Moving a document keeps its theme, bindings, and content; do not rebind or edit it. Change project settings only when asked:

```sh
npx opendoc projects update <project-id> --name "New name"
npx opendoc projects update <project-id> --document-theme <theme-id> --presentation-theme <theme-id>
npx opendoc projects update <project-id> --theme none
npx opendoc projects delete <project-id>
```

`--theme` sets the default for both formats, `--document-theme` and `--presentation-theme` set one each, and `none` clears it; defaults apply to new documents only. `delete` succeeds only for an empty project; move or delete its documents first only when the user asks.

**Ready:** the requested projects, settings, and memberships are in place, any suggested regrouping was approved, or no grouping was requested.

## 6. Rename, duplicate, delete, and restore documents

Use the `documents` command, never folder moves; act only on the user's request:

```sh
npx opendoc documents rename <document-id> "New title"
npx opendoc documents duplicate <document-id> --id <new-id> --title "Title" --project <project-id>
npx opendoc documents delete <document-id>
npx opendoc documents trash
npx opendoc documents restore <restore-id>
```

`rename` changes the library name, not the PDF title in source. A duplicate copies saved source, data, media, comments, and tags, and starts with its own history and no status; omit the options for `<document-id>-copy` in the same project. `delete` moves the document, with its history, comments, tags, and status, to Trash and prints its restore command; report it. Confirm before deleting several documents or one whose ID is uncertain. `trash` lists restore IDs; `restore` also accepts a document ID when Trash holds one copy. Never move, edit, or empty folders in `.opendoc/trash/` by hand.

**Ready:** each requested document is renamed, copied, in Trash with its restore command, or restored.

## 7. Report

Confirm the result with `tags show`, `tags find`, `themes list`, `projects list`, or `documents trash`. Tags, folders, projects, and these document commands never change a document's source, rendering, or exports, so no check, review, or re-export is needed.

**Done:** the user has the found items or a concise list of every tag, folder, project, assignment, and document that changed, including restore commands for deleted documents, with anything left unchanged and why.
