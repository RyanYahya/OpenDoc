import type { DocTheme } from 'opendoc/themes';

/** The plain proofing system shared by the template catalog. */
export const neutral: DocTheme = {
  id: 'neutral', name: 'Neutral', description: 'A plain, adaptable proofing system with black type, gray details, and an open white page.',
  body: 'OpenDoc Sans', heading: 'OpenDoc Sans', ink: '#242424', muted: '#666666',
  accent: '#424242', paper: '#ffffff', line: '#d6d6d6',
  fontSize: 11, lineHeight: 1.5, margin: 54, paragraphGap: 12,
  pageSize: 'A4', runningHeader: false, runningFooter: true, footerLabel: '',
  useFor: ['Layout proofs', 'Everyday documents', 'A starting point for a custom system'],
  principles: ['Let content and structure lead.', 'Keep the page quiet.', 'Make every level easy to recognize.'],
  palette: [
    { name: 'Ink', value: '#242424', role: 'Main text and headings' },
    { name: 'Muted', value: '#666666', role: 'Secondary text and annotations' },
    { name: 'Accent', value: '#424242', role: 'Labels, table headers, and selected emphasis' },
    { name: 'Surface', value: '#ffffff', role: 'Covers, callouts, code panels, and alternate table rows' },
    { name: 'Rule', value: '#d6d6d6', role: 'Quiet structure and table boundaries' },
  ],
  geometry: ['A4 portrait; 54 pt default margins.', '11 pt body, 1.5 line height, 12 pt paragraph spacing.', 'Square corners, a clear left edge, and naturally flowing pages.'],
};
export const theme = neutral;
