# Monthly operational report

A pure, reusable English report with flowing sections, a scorecard, risks, and an action register. The supplied data is clearly marked synthetic in every exported PDF.

Create a working instance with `pnpm run create -- monthly-report --project <project-id> --template monthly-report --title "Monthly report"`. It is also available from Templates in the app. Its source binds this template to a neighboring `data.json` through the generated `theme.tsx` adapter; retain that adapter and the exact selections in `assets.json`. Update the data for a new edition; the layout stays in one place. The project default theme applies at creation, with `--theme <id>` available to override it.

## Data contract

Use `examples/typical.json` as the complete starting point. `examples/sparse.json` demonstrates empty sections and missing targets. `examples/long.json` exercises long prose and a table that continues across pages.

Required fields are `schemaVersion: 1`, `title`, `organization`, `period.start`, `period.end`, `issuedOn`, `synthetic`, `sourceNote`, and `summary`. Dates use `YYYY-MM-DD` and must be real calendar dates. `preparedBy` is optional. Set `synthetic: true` for illustrative data; set it to `false` only when the report contains real supplied material. Keep `sourceNote` accurate about the basis of the report.

The five optional arrays are `metrics`, `highlights`, `risks`, `actions`, and `notes`. Omit a section, set it to `null`, or provide an empty array to leave it out of the PDF. Every record needs a stable `id`, unique within its array. Keep IDs when changing or moving the same record; do not generate IDs from row positions.

- Metrics require a `label` and finite numeric `value`. `target`, `unit`, `note`, and `precision` are optional. A missing target displays a dash; zero remains zero. Precision is an integer from 0 to 3 and defaults to 0. Units appear after values, with `%` directly attached. Use a clear unit such as `USD` for money; no currency or direction is inferred.
- Highlights and notes require `title` and `body`.
- Risks require `title`, `level` (`low`, `medium`, or `high`), `owner`, and `mitigation`.
- Actions require `title`, `owner`, `due`, and `status` (`planned`, `in-progress`, or `complete`). Dates and status are reported as supplied; the template does not invent overdue or completion claims.

`parseMonthlyReport(unknown)` validates the entire input and reports concise field paths in one error. Unknown fields are rejected so a misspelling cannot silently disappear. It returns a fresh normalized `MonthlyReportData` object without mutating the input. `monthlyReportTemplate(theme)` returns `parse`, `meta`, and `render` for the shared template binding and batch export commands, using the instance's adapted theme.

Narrative and risk comment targets use record IDs, so reordering preserves their identities. Tables keep their block identity through pagination; string cells use stable record bindings for quick text corrections. Calculated and numeric values remain protected. Long narratives split into flowing blocks and are edited by the agent in `data.json`; the reader explains this when selected. Prose and tables flow naturally; the template has no manually positioned pages or prescribed page count.

The instance `data.json` is normalized report input. Leave supplied spreadsheets or prior reports in the project’s existing organization; chart-specific derived rows belong in the document’s `media/<id>/`. See [document media](../../docs/MEDIA.md).
