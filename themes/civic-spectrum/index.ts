import type { DocTheme } from 'opendoc/themes';

/** Civic Spectrum signal colors with the owner's requested white page surface. */
export const colors = {
  stock: '#FFFFFF', ink: '#17232B', blue: '#2F7EA5', muted: '#68747A', rule: '#C9CEC7',
  sky: '#7ABED0', leaf: '#5F9D7A', sun: '#E3C84F', flame: '#E27D47', violet: '#7D6FA6',
  inverse: '#F8F5EC', inverseMuted: '#B9C2C3', inverseRule: '#516068',
} as const;

export const metrics = {
  margin: 48, bottomMargin: 56, columns: 6, gutter: 12, baseline: 4,
  mainWidth: 328, railHeight: 12, signalSize: 8, badgeSize: 132,
  railWeights: [2, 1, 3, 1.5, 2, 1],
} as const;

export const theme: DocTheme = {
  id: 'civic-spectrum', name: 'Civic Spectrum',
  description: 'Warm civic modernism: an unequal spectrum rail, square signals, compact grotesk type, and generous asymmetric space.',
  body: 'OpenDoc Sans', heading: 'OpenDoc Sans',
  ink: colors.ink, muted: colors.muted, accent: colors.blue, paper: colors.stock, line: colors.rule,
  fontSize: 11, lineHeight: 1.5, margin: metrics.margin, paragraphGap: 12,
  pageSize: 'A4', runningHeader: true, runningFooter: true, footerLabel: 'Civic Spectrum',
  useFor: ['Public information', 'Community and cultural reports', 'Editorial explainers'],
  principles: ['One grid, many voices.', 'Use color to classify.', 'Make space part of the structure.'],
  palette: [
    { name: 'Signal blue', value: colors.blue, role: 'Orientation and the primary emphasis' },
    { name: 'Sky', value: colors.sky, role: 'Supporting information' },
    { name: 'Leaf', value: colors.leaf, role: 'Progress and participation' },
    { name: 'Sun', value: colors.sun, role: 'Attention and selected evidence' },
    { name: 'Flame', value: colors.flame, role: 'Action and urgency' },
    { name: 'Violet', value: colors.violet, role: 'Context and reflection' },
    { name: 'Stock', value: colors.stock, role: 'White page surface' },
    { name: 'Ink', value: colors.ink, role: 'Primary text and inverse surface' },
    { name: 'Muted', value: colors.muted, role: 'Secondary text' },
    { name: 'Rule', value: colors.rule, role: 'Quiet structural boundaries' },
  ],
  geometry: ['A4 portrait; 48 pt margins; six columns with 12 pt gutters.', 'Unequal rail: 2 : 1 : 3 : 1.5 : 2 : 1; 12 pt high.', 'Square 8 pt signals and 132 pt outlined or solid badges.', 'Four-column reading field with a two-column supporting field.', '4 pt baseline; square corners; no gradients or shadows.'],
  design: {
    page: { margin: { top: 48, right: 48, bottom: 56, left: 48 }, style: { backgroundColor: colors.stock } },
    typography: {
      h1: { fontSize: 42, lineHeight: 1.04, letterSpacing: -0.8, marginBottom: 20 },
      h2: { fontSize: 23, lineHeight: 1.1, letterSpacing: -0.35, marginTop: 24, marginBottom: 12 },
      h3: { fontSize: 14, lineHeight: 1.2, marginTop: 20, marginBottom: 8 },
      label: { fontSize: 8, fontWeight: 600, letterSpacing: 1.1, color: colors.ink },
      lead: { fontSize: 16, lineHeight: 1.4, color: colors.muted },
      small: { fontSize: 8, lineHeight: 1.35, color: colors.muted },
      caption: { fontSize: 9, lineHeight: 1.4, color: colors.muted },
    },
    title: { block: { borderBottomWidth: 0, borderTopWidth: 5, borderColor: colors.blue, paddingTop: 20, paddingBottom: 0, marginBottom: 28 }, heading: { fontSize: 42 }, eyebrow: { marginBottom: 16 } },
    cover: { page: { backgroundColor: colors.stock }, block: { borderTopWidth: 12, borderColor: colors.blue, marginTop: 40, paddingTop: 32 }, title: { fontSize: 52, lineHeight: 1.02, letterSpacing: -1.1 } },
    furniture: { uppercaseHeader: false, header: { fontSize: 8, letterSpacing: 0.4, paddingBottom: 20 }, footer: { borderTopWidth: 0.75, borderColor: colors.rule, paddingTop: 12 }, text: { fontSize: 8, fontWeight: 600, color: colors.ink }, pageNumber: 'page' },
    table: { header: { backgroundColor: colors.ink, borderBottomWidth: 0 }, headerText: { color: colors.inverse, fontWeight: 600, fontSize: 9 }, cell: { padding: 10, borderBottomWidth: 0.5, borderColor: colors.rule }, text: { fontSize: 10 }, alternate: colors.stock },
    figure: { block: { marginTop: 12, marginBottom: 24 } },
    callout: { block: { backgroundColor: colors.sun, borderLeftWidth: 0, padding: 16, marginTop: 12, marginBottom: 20 }, title: { color: colors.ink, fontSize: 10, letterSpacing: 0 }, text: { color: colors.ink } },
    list: { block: { paddingLeft: 0 }, item: { marginBottom: 8 }, gap: 8, markerWidth: 12 },
  },
};
