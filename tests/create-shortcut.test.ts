import test from 'node:test';
import assert from 'node:assert/strict';
import { createShortcutLabel, isCreateShortcut, type ShortcutEvent } from '../src/app/createShortcut';

const key = (overrides: Partial<ShortcutEvent> = {}): ShortcutEvent => ({ code: 'KeyN', altKey: true, ctrlKey: false, metaKey: false, shiftKey: false, ...overrides });
const page = { closest: () => null };
const inside = (selector: string) => ({ closest: (query: string) => query.split(', ').includes(selector) ? {} : null });

test('Alt+N opens Create from the page, by key position', () => {
  assert.equal(isCreateShortcut(key(), page), true);
  assert.equal(isCreateShortcut(key(), null), true);
  assert.equal(createShortcutLabel(true), 'Option+N');
  assert.equal(createShortcutLabel(false), 'Alt+N');
});

test('the Create shortcut never fires while typing, in menus or dialogs, or with other modifiers', () => {
  for (const selector of ['input', 'textarea', 'select', '[role="combobox"]', '[role="menu"]', '[role="dialog"]']) assert.equal(isCreateShortcut(key(), inside(selector)), false, selector);
  assert.equal(isCreateShortcut(key({ altKey: false }), page), false, 'N alone is a character key');
  assert.equal(isCreateShortcut(key({ ctrlKey: true }), page), false);
  assert.equal(isCreateShortcut(key({ metaKey: true }), page), false);
  assert.equal(isCreateShortcut(key({ shiftKey: true }), page), false);
  assert.equal(isCreateShortcut(key({ code: 'KeyM' }), page), false);
  assert.equal(isCreateShortcut(key({ repeat: true }), page), false, 'A held key opens Create once');
  assert.equal(isCreateShortcut(key({ isComposing: true }), page), false);
  assert.equal(isCreateShortcut(key({ defaultPrevented: true }), page), false);
});
