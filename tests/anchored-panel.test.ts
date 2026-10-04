import test from 'node:test';
import assert from 'node:assert/strict';
import { anchoredPanelWidth, placeAnchoredPanel, unionBox } from '../src/app/anchoredPanel';

// The pages area of a 1440 × 900 window beside the docked side panel, above the bottom bars.
const bounds = { top: 64, left: 110, right: 1040, bottom: 820 };
const box = (top: number, bottom: number, left = 300, right = 900) => ({ top, bottom, left, right });

test('the editor opens below its component, above it when only that side fits, and inside the pages area', () => {
  assert.deepEqual(placeAnchoredPanel({ target: box(200, 260), width: 560, height: 240, bounds, sheet: false }),
    { top: 268, left: 300, placement: 'below', scroll: 0 });
  assert.deepEqual(placeAnchoredPanel({ target: box(600, 700), width: 560, height: 240, bounds, sheet: false }),
    { top: 352, left: 300, placement: 'above', scroll: 0 });
  assert.equal(placeAnchoredPanel({ target: box(200, 260, 700, 1030), width: 560, height: 240, bounds, sheet: false }).left, 468, 'It shifts left to stay inside');
  assert.equal(placeAnchoredPanel({ target: box(200, 260, 20, 200), width: 560, height: 240, bounds, sheet: false }).left, 122, 'It never slides under the page rail');
});

test('a tall component scrolls to its start so the editor follows below it, and otherwise the editor stays on screen', () => {
  const tall = placeAnchoredPanel({ target: box(300, 600), width: 560, height: 240, bounds, sheet: false });
  assert.deepEqual(tall, { top: 404, left: 300, placement: 'below', scroll: 204 });
  const huge = placeAnchoredPanel({ target: box(100, 1400), width: 560, height: 240, bounds, sheet: false });
  assert.equal(huge.placement, 'cover');
  assert.equal(huge.top, 572, 'Clamped to the bottom of the pages area');
  const above = placeAnchoredPanel({ target: box(-400, -300), width: 560, height: 240, bounds, sheet: false });
  assert.ok(above.top >= bounds.top, 'A component scrolled out of view leaves the editor at the edge, not off screen');
});

test('narrow screens use a bottom sheet and scroll the selection above it', () => {
  const narrow = { top: 60, left: 0, right: 375, bottom: 700 };
  const sheet = placeAnchoredPanel({ target: box(500, 560, 24, 351), width: anchoredPanelWidth(undefined, narrow, true), height: 300, bounds: narrow, sheet: true });
  assert.deepEqual(sheet, { top: 392, left: 12, placement: 'sheet', scroll: 188 });
  assert.equal(placeAnchoredPanel({ target: box(120, 180, 24, 351), width: 351, height: 300, bounds: narrow, sheet: true }).scroll, 0, 'A visible selection does not move');
  assert.equal(anchoredPanelWidth(undefined, narrow, true), 351);
});

test('the panel follows its component’s width within readable limits', () => {
  assert.equal(anchoredPanelWidth(box(0, 10, 300, 900), bounds, false), 560);
  assert.equal(anchoredPanelWidth(box(0, 10, 300, 420), bounds, false), 360);
  assert.equal(anchoredPanelWidth(box(0, 10, 300, 750), bounds, false), 450);
  assert.equal(anchoredPanelWidth(box(0, 10, 300, 900), { ...bounds, right: 400 }, false), 266, 'Never wider than the available area');
  assert.deepEqual(unionBox([box(10, 20, 50, 80), box(22, 32, 40, 70)]), { top: 10, bottom: 32, left: 40, right: 80 });
  assert.equal(unionBox([]), undefined);
});
