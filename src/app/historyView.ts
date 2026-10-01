import type { HistoryBlockChange } from '../shared/history';

/** Changed blocks to outline on the page: present now, and not inside another outlined block. */
export function outlinedChanges(changes: HistoryBlockChange[]) {
  const shown = changes.filter(change => change.status !== 'removed' && change.status !== 'contents');
  const inside = new Set(shown.flatMap(change => change.descendants.filter(id => id !== change.id)));
  return shown.filter(change => !inside.has(change.id)).map(change => change.id);
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

/** Page styles for the history panel: one outline per changed block, and a stronger one for the block in focus. */
export function historyHighlightCss(changed: string[], focused: string[] = []) {
  const rule = (ids: string[], declarations: string) => ids.length ? `:is(${ids.flatMap(blockSelectors).join(', ')}) { ${declarations} }` : '';
  return [
    rule(changed.filter(id => !focused.includes(id)), 'border-color: var(--history-mark-line); background: var(--history-mark);'),
    rule(focused, 'border-color: var(--history-focus-line); background: var(--history-mark-strong); box-shadow: 0 0 0 1px var(--history-focus-line);'),
  ].filter(Boolean).join('\n');
}
