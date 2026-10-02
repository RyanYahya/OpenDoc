import test from 'node:test';
import assert from 'node:assert/strict';
import { saveBarStatus, saveBarVisible, type SaveBarState } from '../src/app/saveBar';

const idle: SaveBarState = { count: 0, saving: false, undoing: false, saved: false, savedId: null, canRedo: false, error: '' };

test('the save bar appears only while there is something to save, undo, redo, or report', () => {
  assert.equal(saveBarVisible(idle), false, 'A selection with nothing to save shows no save bar');
  for (const state of [{ count: 2 }, { saving: true }, { undoing: true }, { saved: true }, { savedId: 'edit-1' }, { canRedo: true }, { error: 'Refresh your draft.' }]) {
    assert.equal(saveBarVisible({ ...idle, ...state }), true, JSON.stringify(state));
  }
});

test('the save bar reports the editing state in plain words', () => {
  assert.equal(saveBarStatus({ ...idle, count: 1 }), '1 unsaved change');
  assert.equal(saveBarStatus({ ...idle, count: 2 }), '2 unsaved changes');
  assert.equal(saveBarStatus({ ...idle, count: 2, saving: true, savedId: 'edit-1' }), 'Saving changes…');
  assert.equal(saveBarStatus({ ...idle, undoing: true }), 'Undoing saved changes…');
  assert.equal(saveBarStatus({ ...idle, saved: true }), 'All changes saved');
  assert.equal(saveBarStatus({ ...idle, saved: true, count: 1 }), '1 unsaved change', 'New typing replaces the saved confirmation');
  assert.equal(saveBarStatus({ ...idle, canRedo: true }), 'No unsaved changes');
});
