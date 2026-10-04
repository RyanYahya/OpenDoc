import test from 'node:test';
import assert from 'node:assert/strict';
import { notificationClearance } from '../src/app/notificationClearance';

test('notifications rise above the bottom controls they would cover, and only those', () => {
  const height = 800, band = { left: 876, right: 1256 };
  const saveBar = { top: 736, bottom: 780, left: 1060, right: 1260 };
  const selectionBar = { top: 734, bottom: 780, left: 330, right: 950 };
  const editPanel = { top: 400, bottom: 724, left: 330, right: 950 };
  assert.equal(notificationClearance(height, band, []), 0, 'Nothing in the way keeps the default position');
  assert.equal(notificationClearance(height, band, [saveBar]), 76, 'Above the save bar, with a gap');
  assert.equal(notificationClearance(height, band, [saveBar, selectionBar, editPanel]), 412, 'Above an open selection panel that shares their band');
  assert.equal(notificationClearance(height, { left: 1516, right: 1896 }, [selectionBar, editPanel]), 0, 'A centered bar on a wide window is not in the way');
  assert.equal(notificationClearance(height, undefined, [selectionBar]), 78, 'Without a measured band, every control counts');
  assert.equal(notificationClearance(height, band, [{ top: 780, bottom: 780, left: 900, right: 1000 }]), 0, 'An empty control is ignored');
});
