import type { DocTheme } from 'opendoc/themes';

export const colors = {
  paper: '#FCFBF8', white: '#FFFFFF', ink: '#171A1D', muted: '#62686D',
  blue: '#3758F9', wash: '#ECEEF9', rule: '#D7D7D2', stone: '#EAE7DF',
  night: '#171A1D', inverse: '#F7F6F2', inverseMuted: '#B6BABE', inverseRule: '#41464B',
};
export const metrics = { margin: 48, bottom: 56, gutter: 24, rule: 0.6, unit: 6, measure: 499.28 };

export const theme: DocTheme = {
  id: 'opendoc-neutral', name: 'OpenDoc Neutral',
  description: 'The OpenDoc house style: warm paper, charcoal, a precise blue signal, generous typography, and a flexible editorial grid.',
  body: 'OpenDoc Sans', heading: 'OpenDoc Sans',
  ink: colors.ink, muted: colors.muted, accent: colors.blue, paper: colors.paper, line: colors.rule,
  fontSize: 10.5, lineHeight: 1.48, margin: metrics.margin, paragraphGap: 10,
  pageSize: 'A4', runningHeader: true, runningFooter: true, footerLabel: 'OpenDoc',
  useFor: ['Everyday documents with a considered identity', 'Editorial guides and visual reports', 'Proposals, evidence, and working papers'],
  principles: ['Use scale and whitespace before adding decoration.', 'Give the reader one clear point of entry.', 'Use blue to identify what matters.', 'Let long content flow; compose short material deliberately.'],
  palette: [
    { name: 'Paper', value: colors.paper, role: 'Warm reading pages' },
    { name: 'White', value: colors.white, role: 'Analytical pages and image fields' },
    { name: 'Ink', value: colors.ink, role: 'Primary text and dark page surface' },
    { name: 'Muted', value: colors.muted, role: 'Secondary explanations and captions' },
    { name: 'Blue', value: colors.blue, role: 'A single emphasis, citation, or chart focus' },
    { name: 'Wash', value: colors.wash, role: 'Occasional supporting panel' },
    { name: 'Stone', value: colors.stone, role: 'Neutral structure and diagram fields' },
    { name: 'Rule', value: colors.rule, role: 'Fine dividers and table boundaries' },
    { name: 'Inverse', value: colors.inverse, role: 'Text on charcoal pages' },
    { name: 'Inverse muted', value: colors.inverseMuted, role: 'Captions and secondary text on charcoal' },
    { name: 'Inverse rule', value: colors.inverseRule, role: 'Dividers on charcoal' },
  ],
  geometry: ['A4 portrait; 48 pt top/side and 56 pt bottom margins.', 'A 499 pt content field: equal columns or a 1:2 split, with 24 pt gutters.', 'A 6 pt spacing unit; 0.6 pt rules; square corners.', '10.5 pt reading type at 1.48 leading; 34 pt openings and 62 pt display type.', 'Warm reading pages, white analytical pages, and charcoal image or closing pages.'],
  design: {
    page: { margin: { top: 48, right: 48, bottom: 56, left: 48 }, style: { backgroundColor: colors.paper } },
    typography: {
      h1: { fontSize: 34, fontWeight: 600, lineHeight: 1.08, letterSpacing: -1.1, marginTop: 0, marginBottom: 18 },
      h2: { fontSize: 20, fontWeight: 600, lineHeight: 1.18, letterSpacing: -0.35, marginTop: 20, marginBottom: 10 },
      h3: { fontSize: 12, fontWeight: 600, lineHeight: 1.25, marginTop: 14, marginBottom: 8 },
      label: { fontFamily: 'OpenDoc Mono', fontSize: 7.5, letterSpacing: 0.7, color: colors.blue },
      lead: { fontSize: 13, lineHeight: 1.45, color: colors.muted },
      small: { fontFamily: 'OpenDoc Sans', fontSize: 8, lineHeight: 1.4, color: colors.muted },
      caption: { fontFamily: 'OpenDoc Sans', fontSize: 8.5, lineHeight: 1.4, color: colors.muted },
      code: { fontFamily: 'OpenDoc Mono', fontSize: 8, lineHeight: 1.5, color: colors.ink },
    },
    title: { block: { paddingBottom: 24, borderBottomWidth: 0, marginBottom: 18 }, heading: { fontSize: 34 }, eyebrow: { marginBottom: 16 }, subtitle: { fontSize: 13 }, uppercaseEyebrow: false },
    cover: { title: { fontSize: 62, lineHeight: 1.03, letterSpacing: -2.1 }, subtitle: { fontSize: 16 }, page: { backgroundColor: colors.paper } },
    furniture: { text: { fontFamily: 'OpenDoc Mono', fontSize: 7, color: colors.muted }, header: { paddingBottom: 18 }, footer: { borderTopWidth: 0.6, paddingTop: 10 }, pageNumber: 'page', uppercaseHeader: false },
    table: { block: { marginTop: 10, marginBottom: 18 }, header: { backgroundColor: colors.ink }, headerText: { fontSize: 8, fontWeight: 600, color: colors.white }, cell: { padding: 8, borderBottomWidth: 0.5 }, text: { fontSize: 9, lineHeight: 1.35 }, alternate: '#F1F1EE' },
    figure: { block: { marginTop: 10, marginBottom: 16 } },
    callout: { block: { backgroundColor: colors.wash, borderLeftWidth: 2, borderColor: colors.blue, padding: 16 }, title: { fontSize: 8, color: colors.blue }, text: { fontSize: 10, lineHeight: 1.45 } },
    code: { block: { marginTop: 8, marginBottom: 16 }, panel: { backgroundColor: colors.stone, padding: 16 } },
    list: { gap: 8, markerWidth: 16, item: { fontSize: 10.5, lineHeight: 1.45 } },
  },
};
