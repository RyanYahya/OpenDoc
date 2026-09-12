# App appearance

OpenDoc supports **Light**, **Dark**, and **System** through the sidebar footer and the reader's Document options menu. System is the default. The browser saves an explicit choice under `opendoc-appearance`, synchronizes it between workspace tabs, and applies it before the first paint. If storage is unavailable, the current session still works. System follows live device appearance changes.

## Source of truth

[colors.css](../src/app/colors.css) owns the semantic palette, including increased-contrast overrides. Reuse its roles for surfaces, text, controls, feedback, focus, and PDF inspection. Keep component styles in the existing app stylesheets and reuse [shared controls](../src/app/ui/ui.css). Do not duplicate palette values in documentation or component-local overrides.

The interface uses bundled Inter Regular and Medium, independently of the document font catalog. Shared typography and density tokens live in `src/app/ui/ui.css`: titles use 16/20px Medium, labels 13/16px Medium, and body text 14/20px Regular. Buttons use a 32px minimum height with a 10px radius; data rows use 40px and navigation/library rows 44px. Rows may grow for wrapped content. Existing status badges use a 20px height and 6px radius, with palette roles defined in `colors.css`. Switch dimensions are reserved as tokens (24×14px with a 10px thumb); no switch control is currently used in the app.

Preserve larger touch targets where the compact reader needs them. Keep labels and descriptions readable, long names and paths wrapping, visible keyboard focus, and usable controls at narrow widths. Use the existing reduced-motion behavior.

## Preserve the PDF boundary

Appearance changes the surrounding interface. Paper, media, logo variations, theme specimens, and exports retain their authored colors. Do not invert a PDF canvas or choose logo artwork from the app appearance. Media and asset preview backgrounds are inspection aids; they do not modify source files.

## Verify changes

Review affected views in light and dark appearance, then with increased contrast. Check text, actions, menus, notices, disabled states, and visible focus against their actual backgrounds. Check system switching, explicit overrides, reload persistence, and cross-tab synchronization when changing appearance state. Include the reader, comments, and a narrow workspace view after shared palette or shell changes.

Use measured contrast ratios and readable screenshots as evidence for the specific colors and states changed. Do not turn a palette measurement into a claim of complete accessibility conformance. A PDF rendered before and after an app-only appearance change should have identical bytes.
