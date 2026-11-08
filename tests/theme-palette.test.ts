import test from 'node:test';
import assert from 'node:assert/strict';
import { theme as civic } from '../themes/civic-spectrum/index';
import { theme as fieldManual } from '../themes/field-manual/index';
import { theme as opendocNeutral } from '../themes/opendoc-neutral/index';
import { galleryInverseMutedLabel, galleryPaletteName, lightPaletteChip, nearDarkPageChip } from '../src/app/themePalette';

const themes = [civic, fieldManual, opendocNeutral];

test('the gallery uses Inverse muted for every secondary inverse color and leaves palette data alone', () => {
  assert.equal(galleryInverseMutedLabel, 'Inverse muted');
  assert.equal(civic.palette?.find(color => color.name === 'Inverse notes')?.value, '#B9C2C3');
  const secondary = themes.flatMap(theme => theme.palette?.filter(color => /inverse (notes|muted)/i.test(color.name)) ?? []);
  assert.equal(secondary.length, 3);
  assert.deepEqual(secondary.map(color => color.name).sort(), ['Inverse muted', 'Inverse muted', 'Inverse notes']);
  assert.deepEqual(secondary.map(color => galleryPaletteName(color.name)), Array(3).fill('Inverse muted'));
  assert.equal(galleryPaletteName('Inverse text'), 'Inverse text');
  assert.equal(galleryPaletteName('Inverse'), 'Inverse');
  assert.equal(galleryPaletteName('Inverse rule'), 'Inverse rule');
  assert.equal(galleryPaletteName('Signal blue'), 'Signal blue');
});

test('light gallery chips are the paper-like fills, not ink, rules, or signal colors', () => {
  for (const theme of themes) {
    for (const color of theme.palette ?? []) {
      if (color.name === 'Stock' || color.name === 'Paper' || color.name === 'White' || color.name === 'Panel') {
        assert.equal(lightPaletteChip(color.value), true, `${theme.id} ${color.name}`);
      }
      if (color.name === 'Ink' || color.name === 'Dark' || color.name === 'Rule' || color.name === 'Flame' || color.name === 'Safety orange') {
        assert.equal(lightPaletteChip(color.value), false, `${theme.id} ${color.name}`);
      }
    }
  }
  assert.equal(lightPaletteChip('#FFFFFF'), true);
  assert.equal(lightPaletteChip('#not-a-color'), false);
  assert.equal(lightPaletteChip('#fff'), false);
});

test('dark-page chips are the near-black fills, including Ink, not paper or mid colors', () => {
  for (const theme of themes) {
    for (const color of theme.palette ?? []) {
      if (color.name === 'Ink' || color.name === 'Dark') assert.equal(nearDarkPageChip(color.value), true, `${theme.id} ${color.name}`);
      if (color.name === 'Stock' || color.name === 'Paper' || color.name === 'White' || color.name === 'Muted' || color.name === 'Flame' || color.name === 'Safety orange') {
        assert.equal(nearDarkPageChip(color.value), false, `${theme.id} ${color.name}`);
      }
    }
  }
  assert.equal(nearDarkPageChip('#181818'), true);
  assert.equal(nearDarkPageChip('#000000'), true);
  assert.equal(nearDarkPageChip('#333333'), false);
  assert.equal(nearDarkPageChip('#not-a-color'), false);
});
