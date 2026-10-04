# Projects and per-format default themes

Every document belongs to a project. A project's default themes choose the theme for new documents and new presentations separately; creation uses an explicit `--theme`, then the default for its format, then Neutral.

## Sub-features

- `project-create` creates a project with optional `--theme`, `--document-theme`, and `--presentation-theme`.
- `project-update` renames a project and sets or clears (`none`) each default.
- `project-defaults` reports `themeDefaults` for both formats in `projects list --json`.
- `project-create-doc` creates a document and a presentation that follow their format's default.
- `project-assign` moves a document; `project-delete` removes only an empty project.

## How to get to it (user POV)

- In the browser: the **+** beside Projects, **Project settings** (name, **Default theme for documents (PDF)**, **Default theme for presentations**), and **Move to project…** on a card.
- Installed workspace, either edition: `npx opendoc projects list|create|update|assign|delete`.

## Driving it with the Headless CLI

Preconditions:

- A throwaway Headless workspace; theme IDs from `npx opendoc themes list --json`.

- **Create.** `npx opendoc projects create verify --name "Verify" --document-theme civic-spectrum --presentation-theme field-manual --json`. `themeDefaults` is `{ "document": "civic-spectrum", "presentation": "field-manual" }`.
- **Create work.** `npx opendoc create verify-doc --project verify --title "Doc" --json` and `npx opendoc create verify-deck --project verify --title "Deck" --format presentation --json`. Each `documents/<id>/theme.tsx` imports its format's default theme.
- **Update.** `npx opendoc projects update verify --name "Verify renamed" --presentation-theme none --json`. `themeDefaults.presentation` is `null`, so new presentations fall back to Neutral; existing documents keep their themes.
- **Delete guard.** `npx opendoc projects delete verify` fails while documents belong to it; after `projects assign` of both to `getting-started`, it succeeds.
- **Proof.** Save each JSON result and the final `projects list --json`.

## Gotchas

- `--theme` sets both formats at once; an omitted flag leaves that default unchanged.
- A removed default theme is kept in `projects.json` and makes creation ask for an available theme rather than substituting one.
- Changing a default never rethemes existing documents.
