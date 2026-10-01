# Update

An installed workspace updates its runtime explicitly. `update --check` reports versions without changing anything; `update` installs the newest compatible version, or an exact one with `--version`, and preserves the edition and all authored content.

## Sub-features

- `update-check` reports `currentVersion`, `latestCompatibleVersion`, and `status` (`current` or `available`).
- `update-install` pins the target version and keeps documents, themes, templates, assets, feedback, and projects.
- `update-guard` refuses to install while the normal edition's service runs.

## How to get to it (user POV)

- Stop the browser edition with Ctrl-C, then run `npx opendoc update` in the workspace.
- `npx opendoc update --check --json`; `npx opendoc update --version <exact-version>`.

## Driving it with an installed workspace

Preconditions:

- A throwaway workspace of either edition with network access to the npm registry. Never update a human's workspace.

- **Check.** `npx opendoc update --check --json` exits 0 with `status` `current` or `available`; `package.json` and `package-lock.json` are unchanged.
- **Guard.** In a normal workspace, `npx opendoc start --no-open` in the background, then `npx opendoc update --json` fails with a stop-the-service message; stop the service.
- **Install.** `npx opendoc update --version <published-version> --json` reports `status: "updated"`; `.opendoc/workspace.json` keeps its `edition`, and `npx opendoc check --json` passes.
- **Proof.** Save the JSON results and a hash of `documents/` before and after.

## Gotchas

- A locally packed, unpublished version cannot be the update target; the check still compares against the registry.
- Updates never merge new catalog examples into an existing workspace.
