---
name: opendoc-create-theme
description: Design or refine an OpenDoc theme from a brief, brand material, or references when the user wants a reusable visual system for documents or presentations. Choose an existing theme for a new deliverable through opendoc-create.
---

Use the user's OpenDoc workspace as the working directory. `documents/`, `templates/`, `themes/`, `assets/`, and `.opendoc/` are workspace paths; guide links are relative to this installed skill. Use `npx opendoc` for commands and keep authoring changes out of `node_modules/opendoc`. In Headless, follow [the remote workflow](../../../docs/HEADLESS.md); these commands and imports stay the same, and no browser or recipient-side installation is needed.

## 1. Inspect the design basis

Resolve the requested theme explicitly or through [opendoc-current-document](../opendoc-current-document/SKILL.md). Discover with `npx opendoc themes list`; inspect one with `npx opendoc themes inspect <id>`. The list also reports each theme's `folder` from the user's optional `themes/folders.json` and its `tags` from `tags.json`; narrow it with `--folder <path>` or `--tag <tag>`. Organization never moves theme folders; change folders with `npx opendoc themes assign` or `themes folders` only when the user asks, as described in [Themes](../../../docs/THEMES.md#organize-the-catalog). Read its guide and relevant source, or one suitable existing theme for a new bundle.

Inspect supplied images, brand-guide pages, document PDFs, and referenced websites. Record what is a requirement, an observed pattern, or your interpretation. Identify unavailable references and font substitutions honestly. Translate web references into print through hierarchy, proportions, alignment, reading measure, whitespace, and recurring compositions.

**Ready:** the design basis is grounded in inspected material and the target is identified as a new theme, adaptation, or shared revision.

## 2. Establish the print system

Choose the palette, typography, spacing rhythm, page geometry, running matter, and evidence/imagery treatment needed by the intended documents. Make the system visible in interior reading pages as well as the opening. A theme supplies visual language; a template supplies adaptable document architecture. Keep subject-specific prose in documents and variable content able to flow.

**Ready:** one coherent direction explains both ordinary reading and the distinctive compositions needed by the brief.

## 3. Implement the bundle

Follow the [Themes contract](../../../docs/THEMES.md) and supported roles exported by `opendoc/themes`. Create or refine `themes/<id>/` with a discoverable pure-data `index.ts`, actionable `design.md`, and a real `preview.tsx`. Add native PDF components only where standard roles cannot express the system.

Keep exact guide values synchronized with executable tokens. Describe component inputs and link their source rather than duplicating implementations. Keep component text correctable: bind every string a document passes with `TextSlot`, mark generated counters and prefixes with `Decoration`, and give fixed or transformed labels a stated reason, as described in [editable text in components](../../../docs/THEMES.md#editable-text-in-components). Build the specimen with the actual theme/components and a plausible application; two to four pages is a starting point, not a quota. A theme specimen imports `./index`; an authored document imports its generated `./theme` adapter.

For logos or custom fonts, read [Assets](../../../docs/ASSETS.md) and the font section of Themes before implementing them. Verify local faces and licenses, preserve original artwork, and use semantic document font bindings inside reusable components. For generated visuals, follow [Media](../../../docs/MEDIA.md). Keep reference originals in their existing project location.

For a new theme, apply two to five fitting standard tags from `npx opendoc tags` once `npx opendoc themes inspect <id>` discovers it: its **Style** (such as `formal`, `minimal`, `editorial`, `bold`, or `playful`), the **Area** or **Type** it was designed for when it has one, and `arabic` or `bilingual` when it is built for that text. Add a custom tag, such as a brand or client name, only when no standard tag fits, reusing an existing custom spelling:

```sh
npx opendoc tags add theme <theme-id> minimal finance
```

When refining an existing theme, keep its tags; add one only when the change gives it a new fitting purpose. Never remove or rename the user's tags unless asked. See [Tags](../../../docs/TAGS.md#tagging-by-agents).

**Ready:** the bundle is discoverable, its guide matches its tokens, the specimen demonstrates the implemented print system, and a new theme is tagged.

## 4. Review its real use

Run `npx opendoc check`. In Headless, use `npx opendoc review --theme <id> --json` to prepare the specimen PDF, page images, and text. In normal OpenDoc, `npx opendoc themes preview <id>` produces `output/themes/<id>.pdf`; the review command is also available. `npx opendoc themes check <id>` is a render-only iteration check; a successful preview or review already renders. Complete [opendoc-review-document](../opendoc-review-document/SKILL.md) on the current specimen, reusing artifacts while source is unchanged.

For dense layouts or changed geometry, also exercise longer content or an intended template. For a used shared theme, inspect usage and review representative affected documents. Confirm `npx opendoc themes inspect <id>` discovers the bundle and its guide. In normal OpenDoc, also confirm the Themes page opens its PDF and guide.

When presentation use is part of the brief, also review a representative deck in PDF and PowerPoint. Check font embedding compatibility before promising editable delivery; follow [PowerPoint delivery](../../../docs/AUTHORING.md#powerpoint-delivery).

**Done:** the theme remains reusable in the workspace and the reviewed specimen PDF is delivered through an accessible file link or the host agent's existing delivery channel, with the design basis and concrete limitations reported. A remote recipient needs no OpenDoc installation. Include the reusable source and required assets when a portable theme is requested. A project-default change or rebinding existing documents requires that scope in the request; shared source refinements affect existing users of the theme.
