import type { HistoryBlockChange } from '../shared/history';

/** Changed blocks to outline on the page: present now, and not inside another outlined block. */
export function outlinedChanges(changes: HistoryBlockChange[]) {
  const shown = changes.filter(change => change.status !== 'removed' && change.status !== 'contents');
  const inside = new Set(shown.flatMap(change => change.descendants.filter(id => id !== change.id)));
  return shown.filter(change => !inside.has(change.id)).map(change => change.id);
}

/** One row of a version comparison: a changed item, or a container label over the changes inside it. */
export type VersionRow = { type: 'item'; change: HistoryBlockChange } | {
  type: 'label'; change: HistoryBlockChange;
  /** Some change inside it cannot be restored on its own, so the label keeps the container's restore. */
  restorable: boolean;
};
export interface VersionGroup { key: string; rows: VersionRow[] }

/**
 * Changes grouped by the top-level item they belong to, in document order. A container whose only change
 * is what is inside it becomes the label of that group instead of a row of its own, so its changes are
 * listed once. It has nothing to compare and no ID worth showing; it keeps its restore only when some
 * change inside it cannot be restored alone, so “restore the section that contains it” stays possible.
 */
export function versionGroups(changes: HistoryBlockChange[], restorable: (change: HistoryBlockChange) => boolean): VersionGroup[] {
  const listed = new Map(changes.map(change => [change.id, change]));
  const childrenOf = (id: string) => changes.filter(change => change.parent === id);
  const groups: VersionGroup[] = [];
  const groupOf = new Map<string, VersionGroup>();
  for (const change of changes) {
    const row: VersionRow = change.status === 'contents' && childrenOf(change.id).length
      ? { type: 'label', change, restorable: change.section.ok && changes.some(inner => inner !== change && change.descendants.includes(inner.id) && !restorable(inner)) }
      : { type: 'item', change };
    // A change starts a group unless its container is listed too; nested changes join their container's group.
    const container = change.parent && listed.has(change.parent) ? groupOf.get(change.parent) : undefined;
    const group = container ?? { key: `${change.file}:${change.id}`, rows: [] };
    if (!container) groups.push(group);
    group.rows.push(row);
    groupOf.set(change.id, group);
  }
  return groups;
}

// Composite blocks render child targets from their own literal ID, such as a section's heading.
const derivedSuffixes = ['-heading', '-lead', '-title', '-subtitle', '-byline', '-eyebrow', '-caption'];
const quoted = (value: string) => `"${value.replace(/["\\]/g, '\\$&')}"`;

/**
 * Selectors for one block's outline: its own page target, or, on a page where it has none,
 * the targets it renders through. Nested targets are never added, so outlines do not stack.
 */
export function blockSelectors(id: string) {
  const own = `.component-target[data-block-id=${quoted(id)}]`;
  const through = [...derivedSuffixes.map(suffix => `.component-target[data-block-id=${quoted(id + suffix)}]`), `.component-target[data-text-target^=${quoted(`${id}:`)}]`];
  return [own, `.inspection-layer:not(:has(${own})) :is(${through.join(', ')})`];
}

/**
 * Page styles for the history panel: one outline per changed block, and a stronger one for the block in focus.
 * The tint and line sit a few pixels outside the target, so they frame the words instead of touching them,
 * while the target keeps its exact geometry for clicks.
 */
export function historyHighlightCss(changed: string[], focused: string[] = []) {
  const rule = (ids: string[], declarations: string) => ids.length ? `:is(${ids.flatMap(blockSelectors).join(', ')}) { ${declarations} }` : '';
  return [
    rule(changed.filter(id => !focused.includes(id)), 'border-radius: 3px; background: var(--history-mark); box-shadow: 0 0 0 3px var(--history-mark), 0 0 0 4px var(--history-mark-line);'),
    rule(focused, 'border-radius: 3px; background: var(--history-mark-strong); box-shadow: 0 0 0 3px var(--history-mark-strong), 0 0 0 5px var(--history-focus-line);'),
  ].filter(Boolean).join('\n');
}
