# Headless initialization

OpenDoc Headless initializes a complete workspace without a browser or service, with the full starter library and every shipped agent skill as a stub that forward to the installed package.

## Sub-features

- `init` creates a workspace in a new or empty folder and refuses a non-empty one.
- `init-marker` writes `.opendoc/workspace.json` with `edition: "headless"`.
- `init-skills` writes `.agents/skills/opendoc-*/SKILL.md` stubs, `.claude/skills` as a link to them, and an `AGENTS.md` that lists every skill.
- `init-check` leaves a workspace whose `check`, `review`, and `export` succeed.

## How to get to it (user POV)

- `npx --yes @ryanyahya/opendoc-headless init <folder> --json`.
- From a packed checkout, with `OPENDOC_PACKAGE_TARBALL` set to the absolute Headless tarball path: `npm exec --yes --package="$OPENDOC_PACKAGE_TARBALL" -- opendoc-headless init <folder> --json` (see [VALIDATION.md](../../../../VALIDATION.md)).

## Driving it with the Headless CLI

Preconditions:

- An empty scratch folder; Node 24 and npm on `PATH`.

- **Init.** `npx --yes @ryanyahya/opendoc-headless init <folder> --json` prints `{ workspace, version, edition: "headless" }`.
- **Skills.** `ls <folder>/.agents/skills` lists the same `opendoc-*` folders as the package's `.agents/skills`; each `SKILL.md` links `../../../node_modules/opendoc/.agents/skills/<name>/SKILL.md`, and `AGENTS.md` links every one.
- **Refusal.** Running init again on the same folder fails and leaves it unchanged.
- **Produce.** `npx opendoc check --json`, `npx opendoc review welcome --json`, and `npx opendoc export welcome --json` succeed; `npx opendoc start` is not a Headless command.
- **Proof.** Save the init JSON, the skill listing, and the export result.

## Gotchas

- Headless never opens a browser or writes `.opendoc/server.json`.
- Read the new workspace's `AGENTS.md` explicitly; a host does not always reload instructions after `cd`.
