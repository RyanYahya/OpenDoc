/**
 * Labels and light-chip detection for the Themes gallery palette.
 * Theme palette names, token keys, and color values stay as authored.
 */

/** Gallery label for the secondary inverse color. The token is `inverseMuted`. */
export const galleryInverseMutedLabel = 'Inverse muted';

/**
 * One gallery label for the secondary inverse color.
 * Field Manual and OpenDoc Neutral already say "Inverse muted". Civic Spectrum
 * says "Inverse notes" for the same `inverseMuted` token. Other names pass through.
 */
export function galleryPaletteName(name: string): string {
  return name.trim().toLowerCase() === 'inverse notes' ? galleryInverseMutedLabel : name;
}

/** Relative luminance of paper, stock, white, and similarly light fills. */
const lightChipLuminance = 0.75;
/** Dark appearance page is #181818 (`--background`), about 9% HSL lightness. */
const darkPageLightness = 0x18 / 255;
/** Chips this close to that page need an edge in dark mode. */
const nearDarkPageSpan = 0.10;

function hexRgb(value: string) {
  const match = /^#([0-9a-f]{6})$/i.exec(value.trim());
  if (!match) return undefined;
  const hex = match[1]!;
  return [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16)] as const;
}

function srgbChannel(value: number) {
  const channel = value / 255;
  return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
}

/** True for a #RRGGBB fill light enough to blend into the light gallery page. */
export function lightPaletteChip(value: string): boolean {
  const rgb = hexRgb(value);
  if (!rgb) return false;
  const luminance = 0.2126 * srgbChannel(rgb[0]) + 0.7152 * srgbChannel(rgb[1]) + 0.0722 * srgbChannel(rgb[2]);
  return luminance >= lightChipLuminance;
}

/** True when a fill is within about 10% lightness of the dark gallery page, including Ink. */
export function nearDarkPageChip(value: string): boolean {
  const rgb = hexRgb(value);
  if (!rgb) return false;
  const lightness = (Math.max(...rgb) + Math.min(...rgb)) / 2 / 255;
  return Math.abs(lightness - darkPageLightness) <= nearDarkPageSpan;
}
