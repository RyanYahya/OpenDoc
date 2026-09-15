# Browser library

The Normal edition's primary shell is the local browser workspace: the client HTML, sidebar, project library, and document cards. A user opens the printed URL and can reach Documents, Presentations, Themes, Templates, and Media & Assets.

## Sub-features

- `shell-html` serves the OpenDoc client at `/`.
- `shell-session` exposes `/api/session` for the running process.
- `library-documents` lists Welcome in Documents / Getting started.
- `library-presentations` lists the welcome presentation.
- `library-catalogs` lists themes and the Getting started project.

## How to get to it (user POV)

- Open the URL printed at launch (`OpenDoc is running at http://127.0.0.1:<port>`).
- Sidebar (`nav` `aria-label="Workspace"`):
  - Documents → `#library` (`aria-label="Documents"`)
  - Presentations → `#presentations`
  - Media & Assets → `#assets`
  - Templates → `#templates`
  - Themes → `#themes`
- Projects: `#project/getting-started` (`aria-label="Getting started"`).
- Open a card: `#document/welcome` or `#document/welcome-presentation`.
- Footer status reads **Local workspace** when the socket is connected.

## Driving it with HTTP and hash routes

Preconditions:

- Normal server started by this run; `helpers/doctor.sh` passed.
- Browser automation is optional. HTTP plus a GET of `/` is enough for a shell proof. Use CDP only when the claim is layout, keyboard, or the PDF canvas.

- **HTML boot.** `GET <origin>/` returns 200 HTML that contains `OpenDoc` (wordmark `alt="OpenDoc"` once the client runs).
- **Session.** `GET <origin>/api/session` returns 200 `{ token }` matching `.opendoc/server.json` (do not copy the token into evidence).
- **Documents.** `GET <origin>/api/documents?view=summary` includes `welcome` with a title that the UI shows as **Welcome to OpenDoc**.
- **Presentations.** The same list includes `welcome-presentation`. The Presentations view is `#presentations`.
- **Project.** `GET <origin>/api/projects` includes `getting-started` / `Getting started`, with assignments for both welcome ids.
- **Themes.** `GET <origin>/api/themes` includes `neutral` with a revision and no `error`.
- **Open a document (optional GUI).** Load `<origin>/#document/welcome`. The reader toolbar `aria-label` is `Document toolbar` and Export is `aria-label="Export document"`.
- **Proof.** Save the HTML snippet or a screenshot that shows the OpenDoc wordmark and Welcome, plus the documents/projects JSON (ids, statuses, page counts). After cleanup, those files remain under `evidence/<run-id>/`.

## Gotchas

- The client is a hash SPA. `GET /#library` and `GET /` return the same HTML; routing happens in the browser. HTTP JSON is the reliable library assertion.
- Writes to `/api/*` without `X-OpenDoc-Token` and a matching `Origin` return 403. Doctor uses GET only.
- `pnpm dev` and `pnpm start` share the API but not the client pipeline. A production-client proof needs `pnpm start` / the launch helper after `pnpm build`.
- Narrow-width layout uses **Open sidebar** (`aria-label="Open sidebar"`). Desktop shows the sidebar without that control.
- Do not treat `.opendoc/current.json` as the current request in Headless. It is browser context only, and may be stale.
