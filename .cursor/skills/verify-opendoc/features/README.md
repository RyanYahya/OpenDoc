# OpenDoc verification map

This directory is the maintained source for verifying OpenDoc's user-facing behavior. Read this index before driving the app, then use the matching feature file as the recipe.

## Baseline preconditions

- Node.js 24 or newer (`.node-version`) and pnpm 12.3.4 are on `PATH`.
- From the repository root: `pnpm install --frozen-lockfile` has succeeded. For Normal production launch, `dist/` exists (`pnpm build` or `pnpm verify`).
- Primary proofs use the Normal server started by `helpers/launch.sh` (`OPENDOC_PORT=4318` unless that port is taken).
- `helpers/doctor.sh` reports `ok: true` for that origin, pid, and the shipped `welcome` / `welcome-presentation` library entries.
- Never drive a session that this run did not start. One checkout has one `.opendoc/server.json`.
- Do not leave comments, duplicate documents, or theme edits on the shipped Getting started library. Mutating features must create a disposable copy and delete it, or use a throwaway workspace.
- Headless recipes run in a disposable initialized workspace, not this checkout root.

## Driving conventions

- Start every recipe from the baseline unless its preconditions say otherwise.
- Prefer HTTP paths and documented CLIs over browser coordinates. When the GUI is in scope, use hash routes and ARIA names from `src/app/`.
- Treat every command as literal. Keep document ids (`welcome`, `welcome-presentation`) and theme ids unchanged unless the recipe creates a copy.
- Wait for `status: "ready"` (or a structured CLI `status: "ready"` / export `status: "success"`). Do not sleep for a fixed interval and assume the PDF exists.
- Restore disposable documents after a mutation. Do not remove proof artifacts during cleanup.

## Proof and skip reporting

- Capture the user action and the resulting state, not only the final file.
- HTTP proof includes the request, status code, and a second read (list, hash, or file bytes).
- CLI proof includes the command, stdout, stderr, and exit code. Use `--json`.
- Mutation proof includes a read-only second view (re-list comments, re-GET the document, or re-open the library).
- Record the feature ID and entry point with every artifact under `.cursor/skills/verify-opendoc/evidence/<run-id>/`.
- Report an unreachable path with the attempted command and the unmet precondition. Do not report a skipped entry point as verified through a different path.

## Feature entry contract

Each feature file starts with an H1 title and one paragraph describing the user-visible behavior. It then uses exactly four H2 sections in this order.

1. `Sub-features` lists short IDs with one line for each behavior.
2. `How to get to it (user POV)` lists every user entry point.
3. `Driving it with <harness>` starts with `Preconditions:` and uses labeled bullets that pair each user action with an exact command and observable result.
4. `Gotchas` lists traps that can waste or invalidate a verification run.

Keep implementation details out of the map. Name only user paths, stable handles, required state, commands, and observable proof.

## Features

- [Welcome review and PDF export](./welcome-review-export.md) covers opening Welcome, waiting for the live preview, exporting that PDF, and preparing review artifacts.
- [Presentation PDF and PowerPoint export](./presentation-export.md) covers the welcome presentation's PDF and editable PPTX.
- [Theme specimen review](./theme-specimen.md) covers catalog discovery and Neutral specimen preview/review.
- [Comments](./comments.md) covers adding, listing, and resolving feedback on a disposable copy.
- [Browser library](./browser-library.md) covers the Normal GUI shell: HTML boot, sidebar routes, and library/project JSON.
