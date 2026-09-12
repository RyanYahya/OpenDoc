import type { DocTheme } from 'opendoc/themes';

export const colors = {
  stock: '#F2F0E8', ink: '#16191B', orange: '#F05A28', muted: '#656B6E', rule: '#BFC2BC',
  panel: '#E5E3DB', paper: '#FCFAF4', dark: '#171A1C', inverse: '#F6F3EA',
  inverseMuted: '#AEB4B5', inverseRule: '#4B5154',
} as const;

export const metrics = {
  margin: 44, bottomMargin: 52, spine: 6, inset: 18, gutter: 16,
  baseline: 4, mainWidth: 328, labelWidth: 68, rule: 0.75,
} as const;

export const theme: DocTheme = {
  id: 'field-manual', name: 'Field Manual',
  description: 'Evidence-first technical publishing: warm stock, a safety-orange spine, mono codes and revisions, traceable chains, and decisive dark pages.',
  body: 'OpenDoc Sans', heading: 'OpenDoc Sans', ink: colors.ink, muted: colors.muted,
  accent: colors.orange, paper: colors.paper, line: colors.rule,
  fontSize: 10.5, lineHeight: 1.5, margin: metrics.margin, paragraphGap: 12,
  pageSize: 'A4', runningHeader: true, runningFooter: true, footerLabel: 'Field Manual / Revision 01',
  useFor: ['Technical manuals', 'Evidence and decision records', 'Operational handovers'],
  principles: ['Evidence before ornament.', 'Expose source, reasoning, and action.', 'Document what changes.'],
  palette: [
    { name: 'Safety orange', value: colors.orange, role: 'Priority, active step, change' },
    { name: 'Ink', value: colors.ink, role: 'Main text and structural emphasis' },
    { name: 'Stock', value: colors.stock, role: 'Technical-paper page surface' },
    { name: 'Paper', value: colors.paper, role: 'Evidence fields' },
    { name: 'Panel', value: colors.panel, role: 'Supporting modules and table bands' },
    { name: 'Rule', value: colors.rule, role: 'Fine structure' },
    { name: 'Muted', value: colors.muted, role: 'Annotations and qualifiers' },
    { name: 'Dark', value: colors.dark, role: 'Directive and revision surface' },
    { name: 'Inverse', value: colors.inverse, role: 'Main text on dark' },
    { name: 'Inverse muted', value: colors.inverseMuted, role: 'Notes on dark' },
  ],
  geometry: ['A4 portrait; 44 pt margins; 4 pt baseline.', '6 pt vertical orange spine; 18 pt content inset.', '328 pt reading field plus structured annotation strip.', 'Source → Reason → Act modules; straight connectors; 4 pt top rules.', 'Square corners, 0.75 pt structural rules, mono codes and revision furniture.'],
  design: {
    page: { margin: { top: 44, right: 44, bottom: 52, left: 44 }, style: { backgroundColor: colors.stock } },
    typography: {
      h1: { fontSize: 38, lineHeight: 1.02, letterSpacing: -0.75, marginBottom: 20 },
      h2: { fontSize: 21, lineHeight: 1.1, letterSpacing: -0.3, marginTop: 24, marginBottom: 12 },
      h3: { fontSize: 13, lineHeight: 1.2, marginTop: 20, marginBottom: 8 },
      label: { fontFamily: 'OpenDoc Mono', fontSize: 8, fontWeight: 400, letterSpacing: 0.6, color: colors.ink },
      lead: { fontSize: 14, lineHeight: 1.45, color: colors.muted },
      small: { fontFamily: 'OpenDoc Mono', fontSize: 7.5, fontWeight: 400, lineHeight: 1.4, color: colors.muted },
      caption: { fontFamily: 'OpenDoc Mono', fontSize: 8, fontWeight: 400, lineHeight: 1.4, color: colors.muted },
      code: { fontFamily: 'OpenDoc Mono', fontSize: 9, fontWeight: 400, lineHeight: 1.45, color: colors.ink },
    },
    title: { block: { borderBottomWidth: 0, borderLeftWidth: 6, borderColor: colors.orange, paddingLeft: 18, paddingBottom: 12, marginBottom: 28 }, eyebrow: { marginBottom: 16, color: colors.muted }, heading: { fontSize: 38, marginBottom: 18 }, byline: { fontFamily: 'OpenDoc Mono' } },
    cover: { page: { backgroundColor: colors.stock }, block: { borderTopWidth: 0, borderLeftWidth: 6, borderColor: colors.orange, paddingLeft: 18, paddingTop: 0, marginTop: 48 }, title: { fontSize: 50, lineHeight: 1.02, letterSpacing: -1 } },
    furniture: { uppercaseHeader: false, header: { paddingBottom: 12, borderBottomWidth: 0.75, borderColor: colors.rule, marginBottom: 12 }, text: { fontFamily: 'OpenDoc Mono', fontSize: 7.5, fontWeight: 400, color: colors.muted }, footer: { borderTopWidth: 0.75, paddingTop: 10 }, pageNumber: 'total' },
    table: { header: { backgroundColor: colors.panel, borderTopWidth: 1, borderBottomWidth: 0.75, borderColor: colors.ink }, headerText: { fontFamily: 'OpenDoc Mono', fontSize: 8, fontWeight: 400, color: colors.ink }, cell: { padding: 9, borderBottomWidth: 0.5, borderColor: colors.rule }, text: { fontSize: 9.5, color: colors.ink }, alternate: colors.paper },
    figure: { block: { marginTop: 12, marginBottom: 20 } },
    callout: { block: { backgroundColor: colors.paper, borderLeftWidth: 6, borderColor: colors.orange, padding: 16, marginTop: 12, marginBottom: 20 }, title: { fontFamily: 'OpenDoc Mono', fontSize: 8, fontWeight: 400, color: colors.ink, letterSpacing: 0.4 }, text: { fontSize: 10.5, color: colors.ink } },
    code: { panel: { backgroundColor: colors.panel, borderTopWidth: 0.75, borderColor: colors.rule, padding: 12 } },
    list: { block: { paddingLeft: 0 }, item: { marginBottom: 8 }, gap: 8, markerWidth: 16 },
  },
};
