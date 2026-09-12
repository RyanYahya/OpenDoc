# Structured reports

Use this branch only for repeated data-bound content. Read the workspace’s monthly report contract at `templates/monthly-report/README.md`, its schema and starter, and the binding rules in [Selection](../../../../docs/SELECTION.md).

1. Define varying fields, optional sections, units, and records that need stable IDs. Keep original inputs and distinguish supplied values from illustrative fixtures.
2. Implement `parse(unknown)`, `meta(data)`, and `render(data)`. Parse before metadata/rendering with useful field-path errors. Reject unknown fields, invalid dates, nonfinite numbers, missing required units, and duplicate record IDs.
3. Keep JSON beside the instance TSX. Export workspace-relative `provenance.template` and `provenance.dataFile`; use `bindTemplate` to parse once at the document boundary.
4. Bind editable original strings with `TextSlot` and use stable table `rowIds`. Protect calculated totals and formatted values. Omit empty optional sections or explain a meaningful absence.
5. Supply sparse, typical, long, and invalid fixtures. Confirm validation rejects each relevant invalid case and stable identities survive reordering. Mark synthetic sample material visibly in the PDFs.

**Complete:** the parser, bindings, provenance, and representative fixtures are verified; continue with the parent skill's creation and PDF review.
