import test from 'node:test';
import assert from 'node:assert/strict';
import { belongsHere, briefExcerpt, handoffLifetime, parseHandoffs, readyLifetime, reconcileHandoffs, visibleHandoffs, type PendingHandoff } from '../src/app/pendingHandoffs';

const start = Date.UTC(2026, 9, 2, 9);
const workspace = [
  { id: 'welcome', projectId: 'getting-started', format: 'document' as const },
  { id: 'q2-report', projectId: 'client-work', format: 'document' as const },
];
function handoff(overrides: Partial<PendingHandoff> = {}): PendingHandoff {
  return { id: 'a', copiedAt: start, format: 'document', projectId: 'client-work', projectName: 'Client work', brief: 'A board summary', prompt: 'Create a document…', knownIds: workspace.map(item => item.id), ...overrides };
}

test('a handoff waits until a new document appears in its project', () => {
  const waiting = [handoff()];
  const unchanged = reconcileHandoffs(waiting, workspace, start + 60_000);
  assert.equal(unchanged.handoffs, waiting, 'Nothing new keeps the same list, so nothing is saved');
  assert.deepEqual(unchanged.resolved, []);

  const elsewhere = reconcileHandoffs(waiting, [...workspace, { id: 'other', projectId: 'getting-started', format: 'document' }], start + 60_000);
  assert.equal(elsewhere.resolved.length, 0, 'A new document in another project is not the answer');

  const now = start + 120_000;
  const arrived = reconcileHandoffs(waiting, [...workspace, { id: 'board-summary', projectId: 'client-work', format: 'document' }], now);
  assert.deepEqual(arrived.resolved.map(item => [item.documentId, item.resolvedAt]), [['board-summary', now]]);
  assert.equal(arrived.handoffs[0].documentId, 'board-summary');
  assert.equal(reconcileHandoffs(arrived.handoffs, [...workspace, { id: 'board-summary', projectId: 'client-work' }], now + 1000).resolved.length, 0, 'A resolved handoff resolves once');
});

test('documents that existed when the prompt was copied never count, even when moved into the project', () => {
  const moved = workspace.map(item => item.id === 'welcome' ? { ...item, projectId: 'client-work' } : item);
  assert.equal(reconcileHandoffs([handoff()], moved, start + 1000).resolved.length, 0);
});

test('each new document answers one handoff, oldest first, preferring the requested format', () => {
  const deck = handoff({ id: 'deck', format: 'presentation', copiedAt: start + 10 });
  const report = handoff({ id: 'report', copiedAt: start + 20 });
  const later = handoff({ id: 'later', copiedAt: start + 30 });
  const added = [...workspace, { id: 'new-report', projectId: 'client-work', format: 'document' as const }, { id: 'new-deck', projectId: 'client-work', format: 'presentation' as const }];
  const { handoffs, resolved } = reconcileHandoffs([later, report, deck], added, start + 1000);
  const answers = Object.fromEntries(handoffs.map(item => [item.id, item.documentId]));
  assert.deepEqual(answers, { later: undefined, report: 'new-report', deck: 'new-deck' });
  assert.equal(resolved.length, 2);
  // Without a matching format, the agent's actual choice still answers the wait.
  const onlyDeck = reconcileHandoffs([report], [...workspace, { id: 'new-deck', projectId: 'client-work', format: 'presentation' }], start + 1000);
  assert.equal(onlyDeck.handoffs[0].documentId, 'new-deck');
});

test('a handoff without a project accepts a new document in any project', () => {
  const open = handoff({ projectId: undefined, projectName: undefined });
  const { handoffs } = reconcileHandoffs([open], [...workspace, { id: 'fresh', projectId: 'getting-started' }], start + 1000);
  assert.equal(handoffs[0].documentId, 'fresh');
});

test('waiting handoffs expire after a day, ready ones soon after they arrive, and deleted results drop', () => {
  const stale = reconcileHandoffs([handoff()], workspace, start + handoffLifetime);
  assert.deepEqual(stale.handoffs, []);
  const ready = handoff({ documentId: 'q2-report', resolvedAt: start + 1000 });
  assert.equal(reconcileHandoffs([ready], workspace, start + readyLifetime).handoffs.length, 1);
  assert.deepEqual(reconcileHandoffs([ready], workspace, start + 1000 + readyLifetime).handoffs, []);
  assert.deepEqual(reconcileHandoffs([ready], workspace.filter(item => item.id !== 'q2-report'), start + 2000).handoffs, []);
});

test('handoffs copied in another workspace on the same address stay out of sight and untouched', () => {
  const foreign = handoff({ knownIds: ['someone-else'] });
  const ids = new Set(workspace.map(item => item.id));
  assert.equal(belongsHere(foreign, ids), false);
  assert.equal(belongsHere(handoff({ knownIds: [] }), ids), true, 'An empty workspace snapshot belongs anywhere');
  const result = reconcileHandoffs([foreign], [...workspace, { id: 'fresh', projectId: 'client-work' }], start + 1000);
  assert.equal(result.handoffs[0].documentId, undefined);
  assert.deepEqual(visibleHandoffs([foreign], workspace, { projectId: 'client-work' }), []);
});

test('pages show their own handoffs, newest first', () => {
  const deck = handoff({ id: 'deck', format: 'presentation', copiedAt: start + 10 });
  const report = handoff({ id: 'report', copiedAt: start + 20 });
  const unfiled = handoff({ id: 'unfiled', projectId: undefined, copiedAt: start + 30 });
  const all = [deck, report, unfiled];
  assert.deepEqual(visibleHandoffs(all, workspace, { projectId: 'client-work' }).map(item => item.id), ['report', 'deck']);
  assert.deepEqual(visibleHandoffs(all, workspace, { format: 'document' }).map(item => item.id), ['unfiled', 'report']);
  assert.deepEqual(visibleHandoffs(all, workspace, { format: 'presentation' }).map(item => item.id), ['deck']);
  // An answered handoff follows the format of what actually arrived.
  const answered = handoff({ id: 'answered', documentId: 'q2-report', resolvedAt: start });
  assert.deepEqual(visibleHandoffs([{ ...answered, format: 'presentation' }], workspace, { format: 'document' }).map(item => item.id), ['answered']);
});

test('stored handoffs are validated and brief excerpts stay short', () => {
  assert.deepEqual(parseHandoffs('not json'), []);
  assert.deepEqual(parseHandoffs('{"id":"a"}'), []);
  assert.deepEqual(parseHandoffs(JSON.stringify([handoff(), { id: 'broken' }])).map(item => item.id), ['a']);
  assert.equal(briefExcerpt('  one two\nthree  '), 'one two three');
  assert.equal(briefExcerpt('a b c d e', 3), 'a b c…');
  assert.equal(briefExcerpt(''), '');
});
