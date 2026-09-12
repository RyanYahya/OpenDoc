# Monthly report

Use this as an adaptable foundation for a recurring operational report. A clear opening, concise summary, scorecard, risks, and actions are useful defaults. Let the actual material determine which sections appear and how much space they need. A short report can omit empty sections; a longer report should flow without a forced page count. Adjust emphasis, title size, and exhibit proportions to serve the reader.

Each document owns its validated `data.json`; the shared template owns layout. Read [README.md](README.md) and `schema.ts` before changing the contract. Preserve explicit record IDs when editing or reordering data, and keep the existing `TextSlot` bindings for string fields. Numeric values, dates, units, targets, statuses, and source notes come from supplied records. Do not infer overdue work, improvement, or completion from dates or values alone.

Keep illustrative examples visibly synthetic until replaced with real supplied material. Omit absent optional arrays instead of filling them with invented observations. Keep references and evidence limits accurate.

Use the caller's adapted theme from the generated `theme.tsx`, retaining `assets.json` and data provenance. For one report's content correction, edit its local data; keep local design changes from altering every instance. Preserve block identities and comment history. Use native OpenDoc flow, repeated table headers, and bounded heading/lead groups.

Review every adapted PDF. Shared changes need sparse, typical, and long data, a second theme, invalid-input checks, representative text extraction, and a created instance with independent data. Catalog specimens use Neutral and stay outside the document library.
