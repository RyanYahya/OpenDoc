import type { DocumentProps, PageProps, Style } from '@formepdf/react';

export type ThemeTypeRole = 'h1' | 'h2' | 'h3' | 'label' | 'lead' | 'small' | 'caption' | 'code';
/** Local TTF/OTF files live under themes/<id>/ or assets/, with their license alongside. */
export type ThemeFont = Omit<NonNullable<DocumentProps['fonts']>[number], 'src' | 'fontWeight'> & { src: string; fontWeight?: number };

/** Optional design rules use native PDF styles. Document-specific styles still win. */
export interface ThemeDesign {
  typography?: Partial<Record<ThemeTypeRole, Style>>;
  page?: { margin?: PageProps['margin']; style?: Style };
  title?: { block?: Style; heading?: Style; eyebrow?: Style; subtitle?: Style; byline?: Style; uppercaseEyebrow?: boolean };
  cover?: { page?: Style; block?: Style; title?: Style; subtitle?: Style; eyebrow?: Style; byline?: Style; footer?: Style };
  furniture?: { header?: Style; footer?: Style; text?: Style; uppercaseHeader?: boolean; pageNumber?: 'page' | 'total' };
  table?: { block?: Style; header?: Style; headerText?: Style; cell?: Style; text?: Style; alternate?: string | false };
  figure?: { block?: Style };
  callout?: { block?: Style; title?: Style; text?: Style };
  code?: { block?: Style; panel?: Style };
  list?: { block?: Style; item?: Style; gap?: number; markerWidth?: number };
}

export interface DocTheme {
  id: string; name: string; description: string; body: string; heading: string;
  ink: string; muted: string; accent: string; paper: string; line: string;
  fontSize: number; lineHeight: number; margin: number; paragraphGap: number;
  pageSize: 'A4' | 'Letter'; runningHeader: boolean; runningFooter: boolean; footerLabel: string;
  useFor?: string[]; principles?: string[]; fonts?: ThemeFont[]; design?: ThemeDesign;
  palette?: { name: string; value: string; role: string }[];
  geometry?: string[];
}

/** Validate data at both catalog loading and render time; errors should identify the theme. */
export function validateTheme(theme: DocTheme): void {
  const fail = (message: string): never => { throw new Error(`Theme ${theme?.id || '(unnamed)'}: ${message}`); };
  if (!theme || typeof theme !== 'object' || Array.isArray(theme)) fail('export a theme object.');
  if (typeof theme.id !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(theme.id) || theme.id.length > 80) fail('id must be a short kebab-case identifier.');
  for (const key of ['name', 'description', 'body', 'heading', 'ink', 'muted', 'accent', 'paper', 'line'] as const) {
    if (typeof theme[key] !== 'string' || !theme[key].trim()) fail(`${key} must be nonempty text.`);
  }
  for (const key of ['fontSize', 'lineHeight', 'margin', 'paragraphGap'] as const) {
    if (!Number.isFinite(theme[key]) || (['margin', 'paragraphGap'].includes(key) ? theme[key] < 0 : theme[key] <= 0)) fail(`${key} must be a finite ${key === 'fontSize' || key === 'lineHeight' ? 'positive' : 'non-negative'} number.`);
  }
  if (!['A4', 'Letter'].includes(theme.pageSize)) fail('pageSize must be A4 or Letter.');
  if (typeof theme.runningHeader !== 'boolean' || typeof theme.runningFooter !== 'boolean' || typeof theme.footerLabel !== 'string') fail('provide runningHeader, runningFooter, and footerLabel.');
  for (const key of ['useFor', 'principles', 'geometry'] as const) {
    if (theme[key] !== undefined && (!Array.isArray(theme[key]) || theme[key]!.length > 8 || theme[key]!.some(item => typeof item !== 'string' || !item.trim() || item.length > 240))) fail(`${key} must contain up to eight short descriptions.`);
  }
  if (theme.palette !== undefined) {
    if (!Array.isArray(theme.palette) || theme.palette.length > 16) fail('palette must contain up to sixteen named colors.');
    const names = new Set<string>();
    for (const color of theme.palette) {
      if (!color || typeof color !== 'object' || typeof color.name !== 'string' || !color.name.trim() || color.name.length > 60) fail('each palette color needs a short name.');
      if (typeof color.value !== 'string' || !/^#[0-9a-f]{6}$/i.test(color.value)) fail(`palette color ${color.name} needs a #RRGGBB value.`);
      if (typeof color.role !== 'string' || !color.role.trim() || color.role.length > 240) fail(`palette color ${color.name} needs a short usage role.`);
      const name = color.name.trim().toLowerCase();
      if (names.has(name)) fail(`palette color name ${color.name} must be unique.`);
      names.add(name);
    }
  }
  if (theme.fonts !== undefined) {
    if (!Array.isArray(theme.fonts) || theme.fonts.length > 24) fail('fonts must be an array of up to 24 local faces.');
    const faces = new Set<string>();
    for (const font of theme.fonts) {
      if (!font || typeof font !== 'object' || typeof font.family !== 'string' || !font.family.trim()) fail('each font needs a family.');
      if (typeof font.src !== 'string' || !font.src || /^(?:[a-z]+:|[\\/])/i.test(font.src) || font.src.split(/[\\/]/).includes('..') || !/\.(ttf|otf)$/i.test(font.src)) fail('font src must be a workspace-relative local .ttf or .otf file.');
      if (!font.src.startsWith(`themes/${theme.id}/`) && !font.src.startsWith('assets/')) fail(`font files must live under themes/${theme.id}/ or assets/ so edits are tracked.`);
      if (font.fontWeight !== undefined && (!Number.isFinite(font.fontWeight) || font.fontWeight < 100 || font.fontWeight > 900)) fail('fontWeight must be a number from 100 to 900.');
      if (font.fontStyle !== undefined && !['normal', 'italic', 'oblique'].includes(font.fontStyle)) fail('fontStyle must be normal, italic, or oblique.');
      const face = `${font.family}:${font.fontWeight ?? 400}:${font.fontStyle ?? 'normal'}`;
      if (faces.has(face) || font.family.startsWith('OpenDoc ')) fail(`font ${face} duplicates a registered face.`);
      faces.add(face);
    }
  }
  if (theme.design !== undefined) {
    if (!theme.design || typeof theme.design !== 'object' || Array.isArray(theme.design)) fail('design must be an object of design rules.');
    const seen = new Set<object>();
    const check = (value: unknown, path: string) => {
      if (typeof value === 'number' && !Number.isFinite(value)) fail(`${path} must be finite.`);
      if (!value || typeof value !== 'object') return;
      if (seen.has(value)) fail('design rules cannot contain circular references.');
      seen.add(value);
      for (const [key, item] of Object.entries(value)) check(item, `${path}.${key}`);
      seen.delete(value);
    };
    check(theme.design, 'design');
    for (const [key, value] of Object.entries(theme.design.typography ?? {})) {
      if (value.fontSize !== undefined && value.fontSize <= 0) fail(`design.typography.${key}.fontSize must be positive.`);
      if (value.lineHeight !== undefined && value.lineHeight <= 0) fail(`design.typography.${key}.lineHeight must be positive.`);
    }
  }
}

/** Template geometry is a starting point; the theme's explicit semantic role comes after it. */
export function themeType(theme: DocTheme, role: ThemeTypeRole, base: Style = {}): Style {
  const heading: Style = { fontFamily: theme.heading, fontWeight: 600, color: theme.ink, lineHeight: 1.2, marginBottom: 10 };
  const defaults: Record<ThemeTypeRole, Style> = {
    h1: { ...heading, fontSize: 30, marginTop: 0 },
    h2: { ...heading, fontSize: 21, marginTop: 18 },
    h3: { ...heading, fontSize: 14, marginTop: 18 },
    label: { fontFamily: 'OpenDoc Sans', fontSize: 9, color: theme.accent, letterSpacing: 1.25 },
    lead: { fontSize: 13, color: theme.muted, lineHeight: 1.45 },
    small: { fontFamily: 'OpenDoc Sans', fontSize: 8.5, color: theme.muted },
    caption: { fontFamily: 'OpenDoc Sans', fontSize: 9, color: theme.muted },
    code: { fontFamily: 'OpenDoc Mono', fontSize: 9, lineHeight: 1.5, color: theme.ink },
  };
  return { ...defaults[role], ...base, ...theme.design?.typography?.[role] };
}

export function themePage(theme: DocTheme, fallbackMargin?: PageProps['margin']): Pick<PageProps, 'size' | 'margin' | 'style'> {
  return { size: theme.pageSize, margin: theme.design?.page?.margin ?? fallbackMargin ?? theme.margin, style: theme.design?.page?.style };
}
