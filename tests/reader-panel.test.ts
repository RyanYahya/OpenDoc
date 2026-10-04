import test from 'node:test';
import assert from 'node:assert/strict';
import { closePanel, closedPanel, isShowing, panelFromPreference, readPanelPreference, selectTab, showPanel, togglePanel } from '../src/app/readerPanelState';

const block = (blockId: string) => ({ kind: 'block' as const, blockId });

test('each button opens its own view of the side panel and closes only that view', () => {
  const closed = closedPanel();
  const comments = togglePanel(closed, 'comments');
  assert.ok(isShowing(comments, 'comments', { kind: 'document' }));
  const history = togglePanel(comments, 'history');
  assert.ok(isShowing(history, 'history') && !isShowing(history, 'comments'), 'Another tab’s button switches tabs instead of closing');
  const blockHistory = togglePanel(history, 'history', block('intro'));
  assert.ok(isShowing(blockHistory, 'history', block('intro')), 'A block’s History button shows that block');
  assert.ok(isShowing(togglePanel(blockHistory, 'history'), 'history', { kind: 'document' }), 'The toolbar button returns to the whole document');
  assert.equal(togglePanel(blockHistory, 'history', block('intro')).open, false, 'Pressing the same view again closes the panel');
  assert.ok(isShowing(togglePanel(blockHistory, 'history', block('other')), 'history', block('other')));
});

test('switching tabs keeps each tab’s view, and closing remembers the tab but not the views', () => {
  const marker = showPanel(closedPanel(), 'comments', block('intro'));
  const switched = selectTab(showPanel(marker, 'history', block('table')), 'comments');
  assert.ok(isShowing(switched, 'comments', block('intro')));
  assert.ok(isShowing(selectTab(switched, 'history'), 'history', block('table')));
  const closed = closePanel(selectTab(switched, 'history'));
  assert.deepEqual(closed, closedPanel('history'));
  assert.equal(isShowing(closed, 'history'), false);
});

test('the remembered panel is read defensively and only reopens where it docks', () => {
  assert.deepEqual(readPanelPreference({ open: true, tab: 'history' }), { open: true, tab: 'history' });
  assert.deepEqual(readPanelPreference({ open: 'yes', tab: 'export' }), { open: false, tab: 'comments' });
  assert.deepEqual(readPanelPreference(null), { open: false, tab: 'comments' });
  assert.ok(isShowing(panelFromPreference({ open: true, tab: 'history' }, true), 'history', { kind: 'document' }));
  assert.deepEqual(panelFromPreference({ open: true, tab: 'history' }, false), closedPanel('history'), 'A bottom sheet does not cover a newly opened document');
});
