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

function srgbChannel(value: number) {
  const channel = value / 255;
  return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
}

/** True for a #RRGGBB fill light enough to blend into the gallery page. */
export function lightPaletteChip(value: string): boolean {
  const match = /^#([0-9a-f]{6})$/i.exec(value.trim());
  if (!match) return false;
  const hex = match[1]!;
  const red = parseInt(hex.slice(0, 2), 16);
  const green = parseInt(hex.slice(2, 4), 16);
  const blue = parseInt(hex.slice(4, 6), 16);
  const luminance = 0.2126 * srgbChannel(red) + 0.7152 * srgbChannel(green) + 0.0722 * srgbChannel(blue);
  return luminance >= lightChipLuminance;
}
