# Neutral

Neutral is OpenDoc’s plain proofing system: dark type, white paper, and quiet gray structure. It is useful for working documents, correspondence, and evaluating a template’s proportions before choosing a more expressive theme. Its character comes from clarity and restraint. It should look finished enough to share, with no brand identity imposed on the material.

## Composition and rhythm

Use a dependable left edge and a comfortable reading column. The opening gives the title priority, followed by a short subtitle or byline when useful. Body sections retain a visible hierarchy without turning each heading into an event. Keep the document’s main reading path obvious; a second column is appropriate only when the chosen template or content needs it.

Maintain regular paragraph spacing and enough separation before a new section. Use headings to mark changes in thought and lists for genuinely parallel material. A heading belongs with its opening passage. Let longer prose and tables flow naturally instead of shrinking them to preserve a page count.

## Type and emphasis

The sans-serif family carries both display and reading text. Weight and scale establish hierarchy; grayscale distinguishes secondary notes. Use bold for a short emphasis and italic for a change of voice. Keep labels readable and avoid using uppercase for ordinary sentences. The executable definition in `index.ts` owns all sizes, spacing, and style values. The default A4 page uses 54 pt margins, 11 pt body type, 1.5 leading, and 12 pt paragraph gaps. Standard headings are 30, 21, and 14 pt with 1.2 leading and weight 600; title blocks start at 32 pt. Captions are 9 pt and small notes 8.5 pt. A template may supply different starting proportions; document styles can adapt them.

## Palette

Ink `#242424` carries main text; muted `#666666` carries annotations; accent `#424242` carries labels and table headers; surface `#ffffff` keeps panels and page fields white; rule `#d6d6d6` defines quiet boundaries. Use weights 400 and 600 from the bundled OpenDoc Sans family. OpenDoc Mono remains the code family.

## Supporting material

Tables should remain easy to scan, with consistent column alignment and numbers aligned for comparison. Captions state what is shown; source notes remain close enough to read as part of the exhibit. Grayscale row treatments and rules organize information without making a dense cage.

Charts use direct labels and a clear comparison basis. Use darker marks for a focal value and lighter marks for context. Distinguish multiple series through labels or shape when color adds no necessary information. Preserve evidence-critical colors in supplied media; neutral page furniture does not require recoloring a real chart.

Images follow the reading column or the template’s deliberate wider field. Keep the original aspect ratio, a useful crop, and a nearby caption. Callouts provide one restrained interruption, not a container around every paragraph.

## Branding and density

Neutral has no built-in logo, decorative motif, or institutional voice. Use the actual document’s author, title, and footer information. Add a supplied mark only when required by the brief and leave enough space around it.

The system should handle both a short note and a long report. For dense content, simplify the presentation or use the appropriate template rather than reducing all type. Avoid ornamental icons, shadows, decorative rules, invented brand marks, and arbitrary accent colors.

## Basis and review

This is an original OpenDoc proofing theme, not an extracted external brand. `preview.tsx` uses the shared specimen and the same executable theme as authored documents. Review line lengths, restrained contrast, table alignment, and running matter in the exported PDF. The specimen’s comparison values are illustrative only.
