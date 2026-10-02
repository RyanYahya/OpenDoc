import test from 'node:test';
import assert from 'node:assert/strict';
import { blockName, describeVersions, groupVersions, readableKind, summaryText, type HistoryBlockChange, type HistoryOrigin, type HistoryVersionSummary } from '../src/shared/history';
import { blockSelectors, historyHighlightCss, outlinedChanges, versionGroups } from '../src/app/historyView';
import { formatDay, formatTimeRange, formatWhen } from '../src/shared/dates';

// Intl output uses narrow no-break spaces in some locales; compare words, not space characters.
const plain = (value: string) => value.replace(/\s+/gu, ' ');
const now = new Date(2026, 9, 1, 21, 0).getTime();
// Day 0 is September 30, the day before `now`.
const at = (day: number, hour: number, minute: number) => new Date(2026, 9, day, hour, minute).toISOString();
let sequence = 0;
function version(origin: HistoryOrigin, when: string, changes: [string, string][] = [], extra: Partial<HistoryVersionSummary> = {}): HistoryVersionSummary {
  return {
    id: `v${++sequence}`, at: when, origin, label: origin,
    summary: { blocks: changes.length, ids: changes.map(([id]) => id), files: ['index.tsx'], changes: changes.map(([id, name]) => ({ id, kindLabel: 'Paragraph', name, status: 'changed' as const })) },
    ...extra,
  };
}

test('readable kinds come from element names and paragraph roles, never IDs', () => {
  assert.equal(readableKind('TitleBlock'), 'Title');
  assert.equal(readableKind('DataTable'), 'Table');
  assert.equal(readableKind('Section'), 'Section');
  assert.equal(readableKind('Slide'), 'Slide');
  assert.equal(readableKind('Heading'), 'Heading');
  assert.equal(readableKind('Paragraph', 'caption'), 'Caption');
  assert.equal(readableKind('Paragraph', 'unknown-role'), 'Paragraph');
  assert.equal(readableKind('NeutralOpening'), 'Title', 'Custom components are named by what their name says they are.');
  assert.equal(readableKind('NeutralQuote'), 'Quote');
  assert.equal(readableKind('PaperStudy'), 'Paper study');
  assert.equal(readableKind('D.Paragraph'), 'Paragraph');
});

test('block names are the opening words, cut at a word boundary', () => {
  assert.equal(blockName('Quarterly results · A short lead.'), 'Quarterly results');
  assert.equal(blockName('The current lease ends on 31 December, and the new floor gives each team a room.'), 'The current lease ends on 31 December, and the…');
  assert.equal(blockName('تنتهي مدة الإيجار الحالي في ديسمبر، وتحصل كل الفرق على مساحة أكبر للعمل'), 'تنتهي مدة الإيجار الحالي في ديسمبر، وتحصل كل…');
  assert.equal(blockName(''), '');
});

test('version descriptions name what changed', () => {
  assert.equal(summaryText(describeVersions([version('external', at(1, 20, 40), [['a', 'Quarterly results'], ['b', 'Budget']])])), 'Edited “Quarterly results”, “Budget”');
  assert.equal(summaryText(describeVersions([version('external', at(1, 20, 40), [['a', 'One'], ['b', 'Two'], ['c', 'Three']])])), 'Edited “One”, “Two” and 1 more');
  const mixed = version('external', at(1, 20, 40));
  mixed.summary = { blocks: 2, ids: ['a', 'b'], files: ['index.tsx'], changes: [{ id: 'a', kindLabel: 'Paragraph', name: 'Plan', status: 'changed' }, { id: 'b', kindLabel: 'Image', name: '', status: 'added' }] };
  assert.equal(summaryText(describeVersions([mixed])), 'Edited “Plan”, added image');
  assert.equal(summaryText(describeVersions([version('baseline', at(1, 8, 0))])), 'First recorded version');
  assert.equal(summaryText(describeVersions([version('restore', at(1, 9, 0), [['a', 'Plan']], { restore: { from: 'x', scope: 'block', blockId: 'a' } })])), 'Restored “Plan”');
  assert.equal(summaryText(describeVersions([version('restore', at(1, 9, 0), [], { restore: { from: 'x', scope: 'version' } })])), 'Restored an earlier version');
  assert.equal(summaryText(describeVersions([version('external', at(1, 9, 0))])), 'Layout or code change with no wording change');
  const data = version('external', at(1, 9, 0));
  data.summary.files = ['data.json', 'index.tsx'];
  assert.equal(summaryText(describeVersions([data])), 'Updated data.json');
  const unnamed = version('external', at(1, 9, 0));
  unnamed.summary = { blocks: 3, ids: ['a', 'b', 'c'], files: ['index.tsx'] };
  assert.equal(summaryText(describeVersions([unnamed])), 'Edited 3 items', 'Versions without names fall back to a count, never to IDs.');
  // A run names each block once, newest first.
  const run = [version('external', at(1, 20, 52), [['b', 'Budget']]), version('external', at(1, 20, 40), [['a', 'Results'], ['b', 'Budget']])];
  assert.deepEqual(describeVersions(run), ['Edited ', { quote: 'Budget' }, ', ', { quote: 'Results' }]);
});

test('consecutive versions of one origin within ten minutes share a row; every version stays listed', () => {
  const versions = [
    version('external', at(1, 20, 52)), version('external', at(1, 20, 47)), version('external', at(1, 20, 40)),
    version('edit', at(1, 20, 30)),
    version('external', at(1, 19, 0)), version('external', at(1, 18, 30)),
    version('restore', at(1, 9, 1)), version('restore', at(1, 9, 0)),
    version('external', at(0, 15, 10)),
    version('baseline', at(-2, 9, 0)),
  ];
  const days = groupVersions(versions, { now, locale: 'en-US' });
  assert.deepEqual(days.map(day => day.day), ['Today', 'Yesterday', 'Mon, Sep 28']);
  assert.deepEqual(days[0].runs.map(run => [run.origin, run.versions.length]), [['external', 3], ['edit', 1], ['external', 1], ['external', 1], ['restore', 1], ['restore', 1]],
    'Gaps over ten minutes and restores start new rows.');
  assert.equal(days.flatMap(day => day.runs.flatMap(run => run.versions)).length, versions.length);
});

const change = (id: string, status: HistoryBlockChange['status'], descendants: string[] = []): HistoryBlockChange =>
  ({ id, file: 'index.tsx', kind: 'Paragraph', kindLabel: 'Paragraph', name: id, status, container: descendants.length > 0, parent: null, descendants, block: { ok: true }, section: { ok: true } });

test('page outlines use the outermost changed block and never stack', () => {
  const changes = [change('plan', 'changed', ['inner', 'later']), change('inner', 'changed'), change('later', 'added'), change('gone', 'removed'),
    change('wrapper', 'contents', ['note']), change('note', 'changed')];
  assert.deepEqual(outlinedChanges(changes), ['plan', 'note']);
  const [own, through] = blockSelectors('plan');
  assert.equal(own, '.component-target[data-block-id="plan"]');
  assert.match(through, /:not\(:has\(\.component-target\[data-block-id="plan"\]\)\)/, 'Derived targets outline only where the block has no target of its own.');
  assert.match(through, /data-block-id="plan-heading"/);
  const css = historyHighlightCss(['plan', 'note'], ['note']);
  assert.equal(css.split('\n').length, 2);
  assert.match(css.split('\n')[0], /"plan"/);
  assert.doesNotMatch(css.split('\n')[0], /"note"/, 'The block in focus gets only the stronger outline.');
  assert.equal(historyHighlightCss([], []), '');
});

test('a version lists each change once, grouped by the item it belongs to', () => {
  const inside = (item: HistoryBlockChange, parent: string) => ({ ...item, parent });
  const changes = [
    // A callout and a section whose only change is inside them, a section whose own heading changed too, and a lone title.
    change('feature', 'contents', ['feature-try']), inside(change('feature-try', 'changed'), 'feature'),
    change('opening', 'changed'),
    change('summary', 'contents', ['summary-move', 'summary-reason']), inside(change('summary-move', 'changed'), 'summary'), inside(change('summary-reason', 'changed'), 'summary'),
    change('timeline', 'changed', ['timeline-prep']), inside(change('timeline-prep', 'changed'), 'timeline'),
    // Contents changed, but nothing inside it has a literal ID of its own to list.
    change('budget', 'contents', ['budget-row']),
  ];
  const groups = versionGroups(changes, () => true);
  assert.deepEqual(groups.map(group => group.rows.map(row => `${row.type}:${row.change.id}`)), [
    ['label:feature', 'item:feature-try'], ['item:opening'], ['label:summary', 'item:summary-move', 'item:summary-reason'],
    ['item:timeline', 'item:timeline-prep'], ['item:budget'],
  ], 'Containers that only changed inside label their group; a container with its own change leads it as an item.');
  const actions = groups.flatMap(group => group.rows).filter(row => row.type === 'item').length;
  assert.equal(actions, 7, 'Labels add no rows of actions; only changes do.');
  assert.ok(groups.flatMap(group => group.rows).every(row => row.type === 'item' || !row.restorable), 'Labels need no restore while each change inside restores on its own.');
  const stuck = versionGroups(changes, item => item.id !== 'summary-reason');
  const summary = stuck.flatMap(group => group.rows).find(row => row.change.id === 'summary');
  assert.ok(summary?.type === 'label' && summary.restorable, 'A change that cannot be restored alone keeps its section restorable from the label.');
  const unsafe = versionGroups([{ ...changes[3], section: { ok: false, reason: 'Generated' } }, changes[4], changes[5]], () => false);
  assert.ok(unsafe[0].rows[0].type === 'label' && !unsafe[0].rows[0].restorable, 'A section that cannot be restored offers nothing.');
});

test('one date vocabulary: time today, yesterday, then a short date', () => {
  assert.equal(plain(formatWhen(new Date(2026, 9, 1, 20, 42), { now, locale: 'en-US' })), '8:42 PM');
  assert.equal(plain(formatWhen(new Date(2026, 8, 30, 15, 10), { now, locale: 'en-US' })), 'Yesterday 3:10 PM');
  assert.equal(plain(formatWhen(new Date(2026, 8, 28, 15, 10), { now, locale: 'en-US' })), 'Sep 28, 3:10 PM');
  assert.equal(plain(formatWhen(new Date(2025, 9, 1, 15, 10), { now, locale: 'en-US' })), 'Oct 1, 2025, 3:10 PM');
  assert.equal(formatDay(new Date(2026, 9, 1, 1, 0), { now, locale: 'en-US' }), 'Today');
  assert.equal(plain(formatTimeRange(new Date(2026, 9, 1, 20, 40), new Date(2026, 9, 1, 20, 52), 'en-US')), '8:40 – 8:52 PM');
  assert.equal(plain(formatTimeRange(new Date(2026, 9, 1, 20, 40), new Date(2026, 9, 1, 20, 40, 30), 'en-US')), '8:40 PM');
});
