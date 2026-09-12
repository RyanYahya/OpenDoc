import test from 'node:test';
import assert from 'node:assert/strict';
import { createSession, createSessionStore, materializeTarget, pendingEdits, rebaseSession, redo, sessionForDocument, sourceIdentity, undo, updateComponent } from '../src/app/editSession';
import type { EditSession } from '../src/app/editSession';
import type { TextSourceValue, TextTarget } from '../src/shared/selection';

function source(value: string, start = 100): TextSourceValue {
  return { file: 'documents/proof/index.tsx', digest: 'original-digest', start, end: start + value.length + 2, kind: 'string', value };
}
function target(id: string, parts: (TextSourceValue | string)[]): TextTarget {
  let text = '';
  const runs = parts.map(part => {
    const start = text.length;
    text += typeof part === 'string' ? part : part.value;
    return { start, end: text.length, ...(typeof part === 'string' ? { protected: true } : { source: part }) };
  });
  return { id, blockId: id.split(':')[0], slot: 'text', text, runs, lines: [] };
}
function baseline(targets = [target('body:text', [source('Original text')])]) { return { revision: 3, hash: 'original-hash', targets }; }
function update(session: EditSession, id: string, text: string, now = 0) {
  const result = updateComponent(session, id, text, now);
  assert.equal(result.error, undefined);
  return result.session;
}
function memoryStorage() {
  const values = new Map<string, string>();
  return {
    values,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
  };
}

test('external updates retire cancelled drafts but preserve pending changes and redo', () => {
  const initial = createSession(baseline());
  const draft = update(initial, 'body:text', 'Temporary wording');
  const cancelled = update(draft, 'body:text', 'Original text', 100);
  assert.equal(sessionForDocument(cancelled, baseline()), cancelled);
  assert.equal(sessionForDocument(cancelled, { revision: 4, hash: 'latest-hash' }), null);
  assert.equal(sessionForDocument(cancelled, { revision: 4, hash: initial.hash }), null, 'Source-only changes also retire old bindings.');
  assert.equal(sessionForDocument(draft, { revision: 4, hash: 'latest-hash' }), draft);
  const undone = undo(draft);
  assert.equal(sessionForDocument(undone, { revision: 4, hash: 'latest-hash' }), undone, 'Redo remains available for explicit reconciliation.');
  assert.equal(materializeTarget(redo(undone), 'body:text')!.text, 'Temporary wording');
});

test('linked source edits coalesce and keep canonical offsets when another component changes them', () => {
  const shared = source('Shared');
  const initial = createSession(baseline([target('title:text', [shared]), target('body:text', ['Before ', shared, ' after'])]));
  const draft = update(initial, 'body:text', 'Before A longer value after');
  assert.equal(materializeTarget(draft, 'title:text')!.text, 'A longer value');
  const body = materializeTarget(draft, 'body:text')!;
  assert.equal(body.text, 'Before A longer value after');
  assert.deepEqual(body.runs.map(run => [run.start, run.end]), [[0, 7], [7, 21], [21, 27]]);
  assert.deepEqual(body.runs[1].source, { ...shared, value: 'A longer value' });
  assert.deepEqual(pendingEdits(draft), [{ targetId: 'title:text', start: 0, end: 6, replacement: 'A longer value' }]);
  const later = update(draft, 'title:text', 'Final', 600);
  assert.equal(later.pending.length, 1);
  assert.equal(materializeTarget(later, 'body:text')!.text, 'Before Final after');
  assert.equal(initial.targets[0].text, 'Shared');
  assert.equal(draft.pending[0].replacement, 'A longer value');
});

test('sequential formatted value edits use shifted draft ranges but submit original ranges', () => {
  const initial = createSession(baseline([target('body:text', [source('Plain ', 100), source('bold', 200), source(' ending ', 300), '[1]'])]));
  const first = update(initial, 'body:text', 'Plain stronger ending [1]');
  const second = update(first, 'body:text', 'Plain stronger finish [1]', 100);
  assert.deepEqual(pendingEdits(second), [
    { targetId: 'body:text', start: 6, end: 10, replacement: 'stronger' },
    { targetId: 'body:text', start: 10, end: 18, replacement: ' finish ' },
  ]);
  assert.equal(materializeTarget(second, 'body:text')!.text, 'Plain stronger finish [1]');
  const invalid = updateComponent(second, 'body:text', 'Other new finish [1]', 200);
  assert.ok(invalid.error);
  assert.equal(invalid.session, second);
  assert.ok(updateComponent(second, 'body:text', 'Plain stronger finish [2]').error);
  assert.equal(undo(second).pending.length, 1, 'Different source values are separate undo groups.');
});

test('a source repeated in one component changes every occurrence and can refresh safely', () => {
  const shared = source('Shared');
  const initial = createSession(baseline([target('body:text', [shared, ' and ', shared])]));
  const changed = update(initial, 'body:text', 'Draft and Shared');
  assert.equal(materializeTarget(changed, 'body:text')!.text, 'Draft and Draft');
  assert.equal(pendingEdits(changed).length, 1);
  const rebased = rebaseSession(changed, { ...baseline(initial.targets), revision: 4 });
  assert.equal(rebased.error, undefined);
  assert.equal(materializeTarget(rebased.session, 'body:text')!.text, 'Draft and Draft');
});

test('empty text is a draft value; unchanged and cancelled typing do not add history', () => {
  const initial = createSession(baseline());
  assert.equal(update(initial, 'body:text', 'Original text'), initial);
  assert.equal(undo(initial), initial);
  assert.equal(redo(initial), initial);
  const empty = update(initial, 'body:text', '', 0);
  assert.equal(materializeTarget(empty, 'body:text')!.text, '');
  assert.equal(empty.pending[0].replacement, '');
  const restored = update(empty, 'body:text', 'Original text', 100);
  assert.equal(restored.pending.length, 0);
  assert.equal(restored.past.length, 0);
  assert.equal(restored.future.length, 0);
});

test('typing groups for 500ms, undo and redo retain immutable snapshots, new typing discards redo', () => {
  const first = update(createSession(baseline()), 'body:text', 'A', 0);
  const grouped = update(first, 'body:text', 'AB', 500);
  assert.equal(grouped.past.length, 1);
  const separate = update(grouped, 'body:text', 'ABC', 1001);
  assert.equal(separate.past.length, 2);
  const backwards = undo(separate);
  assert.equal(materializeTarget(backwards, 'body:text')!.text, 'AB');
  assert.equal(materializeTarget(redo(backwards), 'body:text')!.text, 'ABC');
  const changed = update(backwards, 'body:text', 'ABD', 1002);
  assert.equal(changed.future.length, 0);
  assert.equal(changed.past.length, 2);
  assert.equal(first.pending[0].replacement, 'A');
  assert.equal(grouped.pending[0].replacement, 'AB');
  assert.equal(separate.pending[0].replacement, 'ABC');
});

test('undo history is bounded at fifty changes', () => {
  let session = createSession(baseline());
  for (let index = 0; index < 65; index++) session = update(session, 'body:text', `Edit ${index}`, index * 1000);
  assert.equal(session.past.length, 50);
  for (let index = 0; index < 60; index++) session = undo(session);
  assert.equal(session.past.length, 0);
  assert.equal(session.future.length, 50);
  assert.equal(materializeTarget(session, 'body:text')!.text, 'Edit 14');
});

test('session persistence retains history, scopes documents and classifies drift without dropping the draft', () => {
  const storage = memoryStorage(), store = createSessionStore(storage);
  const initial = createSession(baseline());
  const first = update(initial, 'body:text', 'First', 0);
  const session = undo(update(first, 'body:text', 'Second', 600));
  assert.equal(store.write('document one', session), true);
  assert.equal(store.read('another document'), undefined);
  const current = store.read('document one', baseline())!;
  assert.equal(current.stale, false);
  assert.equal(current.session.group, undefined);
  assert.equal(materializeTarget(redo(current.session), 'body:text')!.text, 'Second');
  const stale = store.read('document one', { revision: 4, hash: 'changed-hash' })!;
  assert.equal(stale.stale, true);
  assert.equal(stale.session.targets[0].runs[0].source!.digest, 'original-digest');
  assert.equal(materializeTarget(stale.session, 'body:text')!.text, 'First');
  assert.equal(store.clear('document one'), true);
  assert.equal(store.read('document one'), undefined);
});

test('malformed storage and invalid source, snapshot and history descriptors are safely rejected', () => {
  const cases: ((value: any) => void)[] = [
    value => { value.version = 2; },
    value => { value.session.targets[0].runs[0].source.value = 'Forged text'; },
    value => { value.session.targets[0].runs[0].source.start = -1; },
    value => { value.session.pending[0].sourceId = 'unknown'; },
    value => { value.session.pending[0].start = 1; },
    value => { value.session.pending.push(value.session.pending[0]); },
    value => { value.session.pending[0].replacement = 'Original text'; },
    value => { value.session.past = Array.from({ length: 51 }, () => []); },
    value => { value.session.future = [[{ ...value.session.pending[0], targetId: 'unknown' }]]; },
  ];
  for (const mutate of cases) {
    const storage = memoryStorage(), store = createSessionStore(storage);
    store.write('document', update(createSession(baseline()), 'body:text', 'Draft'));
    const [key, raw] = [...storage.values][0], value = JSON.parse(raw);
    mutate(value);
    storage.setItem(key, JSON.stringify(value));
    assert.equal(store.read('document'), undefined);
    assert.equal(storage.getItem(key), null);
  }
  const storage = memoryStorage(), store = createSessionStore(storage);
  store.write('document', createSession(baseline()));
  const key = [...storage.values.keys()][0];
  storage.setItem(key, 'not json');
  assert.equal(store.read('document'), undefined);
  const failing = createSessionStore({ getItem() { throw Error('blocked'); }, setItem() { throw Error('quota'); }, removeItem() { throw Error('blocked'); } });
  assert.equal(failing.read('document'), undefined);
  assert.equal(failing.write('document', createSession(baseline())), false);
  assert.equal(failing.clear('document'), false);
  const inaccessible = createSessionStore(() => { throw Error('blocked getter'); });
  assert.equal(inaccessible.read('document'), undefined);
  assert.equal(inaccessible.write('document', createSession(baseline())), false);
  assert.equal(inaccessible.clear('document'), false);
});

test('refresh rebases unchanged source values across digest and token offset shifts', () => {
  const shared = source('Shared');
  const original = baseline([target('title:text', [shared]), target('body:text', ['Before ', shared, ' after'])]);
  const session = update(createSession(original), 'title:text', 'Draft');
  const moved = { ...shared, digest: 'new-digest', start: 200, end: 208 };
  const latest = { revision: 4, hash: 'new-hash', targets: [target('title:text', [moved]), target('body:text', ['Before ', moved, ' after'])] };
  const rebased = rebaseSession(session, latest);
  assert.equal(rebased.error, undefined);
  assert.equal(rebased.session.hash, 'new-hash');
  assert.equal(rebased.session.pending[0].sourceId, sourceIdentity(moved));
  assert.equal(materializeTarget(rebased.session, 'body:text')!.text, 'Before Draft after');
  assert.equal(rebased.session.past.length, 1);
  assert.equal(materializeTarget(undo(rebased.session), 'title:text')!.text, 'Shared');
  assert.equal(session.hash, 'original-hash');
});

test('refresh preserves the original draft when values changed, targets vanished or linked values split', () => {
  const shared = source('Shared');
  const original = baseline([target('title:text', [shared]), target('body:text', [shared])]);
  const session = update(createSession(original), 'title:text', 'Draft');
  const variants = [
    [target('title:text', [source('Changed')]), target('body:text', [source('Changed')])],
    [target('title:text', [shared])],
    [target('title:text', [shared]), target('body:text', [source('Shared', 400)])],
    [{ ...target('title:text', [shared]), stable: false }, target('body:text', [shared])],
  ];
  for (const targets of variants) {
    const result = rebaseSession(session, { revision: 4, hash: 'changed', targets });
    assert.ok(result.error);
    assert.equal(result.session, session);
  }
});
