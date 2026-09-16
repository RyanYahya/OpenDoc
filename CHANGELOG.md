# Changelog

## 0.5.0 — 2026-09-16

### Document review and authoring

- `opendoc review <id> --export` prepares PDF and editable PowerPoint from one captured presentation render. Failed preparation preserves the previous complete output set.
- Review reports include element bounds, parent coordinates, clipping ancestors, source locations, and line counts, plus changed and removed pages compared with the previous review.
- Layout warnings identify overlapping text, footer-area intrusion, split callouts, oversized keep-together blocks, and explicit paragraph line-limit violations.
- `Paragraph maxLines` expresses a review expectation without truncating text. `Block` and `Callout` accept `keepTogether`.

### PowerPoint export

- Uniform rounded panels export as editable rounded rectangles.
- Unsupported styling is reported during PDF review before PowerPoint export. Rounded containers that clip children are explicitly rejected for PowerPoint because separate child shapes cannot preserve that clipping; PDF output remains available.

### Reliability and contributor tooling

- Media freshness detects same-size source rewrites on filesystems with coarse timestamp resolution.
- Contributor verification helpers exercise the running application, exports, and review output. Startup requires an authenticated session handshake, cleans up failed launches, and supports linked checkout paths.
- Update acceptance uses the tested release's version instead of assuming a fixed baseline.

### Install or update

Both npm editions use version `0.5.0`: `@ryanyahya/opendoc` and `@ryanyahya/opendoc-headless`.

For an existing initialized workspace, stop its browser service first, then run:

```sh
npx opendoc update --version 0.5.0
```

The explicit version is necessary when moving from `0.4.x`, because the default updater stays within the current minor version before `1.0`. Restart the normal edition with `npx opendoc start` afterward.

Native PowerPoint appearance still requires inspection in PowerPoint; package and content checks do not establish visual equivalence.

## 0.4.0

Initial public npm release of the normal and Headless editions, including PDF production, editable PowerPoint export, shared themes and templates, and workspace-preserving updates.
