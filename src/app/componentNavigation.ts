export interface ComponentBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface NavigableComponent extends ComponentBox {
  key: string;
  /** The component that owns this one regardless of geometry, such as a text slot's block. */
  owner?: string;
  /** Arrow keys visit this component. Others are reached through their parent or child. */
  linear?: boolean;
  /** Read contents row by row, as in a table. Other contents read column by column. */
  rowsFirst?: boolean;
}

export interface ComponentNavigation {
  /** Pre-order: each component precedes the components it contains. */
  order: string[];
  parents: Map<string, string>;
  linear: Set<string>;
}

export type NavigationMove = 'next' | 'previous' | 'first' | 'last' | 'parent' | 'child';

// PDF geometry carries fractional rounding, and text may overhang its
// container slightly. A point of tolerance separates touching siblings, and a
// component nests inside another that covers nearly all of it.
const TOLERANCE = 1;
const COVERAGE = 0.9;

const area = (box: ComponentBox) => box.width * box.height;
function contains(outer: ComponentBox, inner: ComponentBox) {
  const width = Math.min(outer.x + outer.width, inner.x + inner.width) - Math.max(outer.x, inner.x);
  const height = Math.min(outer.y + outer.height, inner.y + inner.height) - Math.max(outer.y, inner.y);
  if (width <= 0 || height <= 0) return false;
  return area(inner) > 0 ? (width * height) / area(inner) >= COVERAGE
    : outer.x <= inner.x + TOLERANCE && outer.y <= inner.y + TOLERANCE;
}

/** Group boxes separated by a clear gap along one axis. */
function bands<T extends ComponentBox>(items: T[], axis: 'x' | 'y'): T[][] {
  const size = axis === 'x' ? 'width' : 'height';
  const groups: T[][] = [];
  let reach = -Infinity;
  for (const item of [...items].sort((a, b) => a[axis] - b[axis])) {
    const end = item[axis] + item[size];
    if (groups.length && item[axis] < reach - TOLERANCE) {
      groups.at(-1)!.push(item);
      reach = Math.max(reach, end);
    } else {
      groups.push([item]);
      reach = end;
    }
  }
  return groups;
}

/**
 * Order siblings by recursively cutting along clear gaps. Columns are read
 * before rows, so a two-column page reads down each column. Where a
 * full-width component prevents a column cut, rows are separated only around
 * it: adjacent rows that share columns stay together and read column by
 * column. Table contents read across each row instead.
 */
function arrange<T extends ComponentBox>(items: T[], rowsFirst: boolean): T[] {
  if (items.length < 2) return items;
  const hasColumns = (group: T[]) => bands(group, 'x').length > 1;
  if (rowsFirst) {
    const rows = bands(items, 'y');
    if (rows.length > 1) return rows.flatMap(row => arrange(row, true));
  } else {
    const columns = bands(items, 'x');
    if (columns.length > 1) return columns.flatMap(column => arrange(column, false));
    const groups: T[][] = [];
    for (const row of bands(items, 'y')) {
      const previous = groups.at(-1);
      if (previous && hasColumns(previous) && hasColumns([...previous, ...row])) previous.push(...row);
      else groups.push([...row]);
    }
    if (groups.length > 1) return groups.flatMap(group => arrange(group, false));
  }
  const columns = bands(items, 'x');
  if (rowsFirst && columns.length > 1) return columns.flatMap(column => arrange(column, true));
  return [...items].sort((a, b) => a.y - b.y || a.x - b.x);
}

/**
 * Build the keyboard reading order of one page's selectable components.
 * Components nest by ownership or geometric containment; siblings follow the
 * page's visual columns and rows rather than source or stacking order.
 */
export function componentNavigation(items: readonly NavigableComponent[]): ComponentNavigation {
  const byKey = new Map(items.map(item => [item.key, item]));
  const index = new Map(items.map((item, position) => [item.key, position]));
  const parents = new Map<string, string>();
  for (const item of items) {
    if (item.owner && item.owner !== item.key && byKey.has(item.owner)) { parents.set(item.key, item.owner); continue; }
    let parent: NavigableComponent | undefined;
    for (const candidate of items) {
      if (candidate === item || candidate.owner === item.key || !contains(candidate, item)) continue;
      // Equal boxes nest in source order, so containment never forms a cycle.
      if (area(candidate) < area(item) || (area(candidate) === area(item) && index.get(candidate.key)! > index.get(item.key)!)) continue;
      if (!parent || area(candidate) < area(parent) || (area(candidate) === area(parent) && index.get(candidate.key)! > index.get(parent.key)!)) parent = candidate;
    }
    if (parent) parents.set(item.key, parent.key);
  }
  const children = new Map<string | undefined, NavigableComponent[]>();
  for (const item of items) {
    const parent = parents.get(item.key);
    children.set(parent, [...children.get(parent) ?? [], item]);
  }
  const order: string[] = [];
  const visit = (parent: NavigableComponent | undefined) => {
    for (const child of arrange(children.get(parent?.key) ?? [], !!parent?.rowsFirst)) {
      order.push(child.key);
      visit(child);
    }
  };
  visit(undefined);
  return { order, parents, linear: new Set(items.filter(item => item.linear !== false).map(item => item.key)) };
}

/** Map a key press to a movement, leaving modified and unrelated keys alone. */
export function navigationMove(event: { key: string; altKey: boolean; ctrlKey: boolean; metaKey: boolean; shiftKey: boolean }): NavigationMove | undefined {
  if (event.ctrlKey || event.metaKey || event.shiftKey) return undefined;
  if (event.altKey) return event.key === 'ArrowUp' ? 'parent' : event.key === 'ArrowDown' ? 'child' : undefined;
  switch (event.key) {
    case 'ArrowDown': case 'ArrowRight': return 'next';
    case 'ArrowUp': case 'ArrowLeft': return 'previous';
    case 'Home': return 'first';
    case 'End': return 'last';
    default: return undefined;
  }
}

/** The component that receives focus after a movement, or undefined at a boundary. */
export function moveComponentFocus(navigation: ComponentNavigation, current: string, move: NavigationMove): string | undefined {
  const { order, parents, linear } = navigation;
  const position = order.indexOf(current);
  switch (move) {
    case 'first': return order.find(key => linear.has(key));
    case 'last': return [...order].reverse().find(key => linear.has(key));
    case 'next': return order.slice(position + 1).find(key => linear.has(key));
    case 'previous': return position < 0 ? undefined : order.slice(0, position).reverse().find(key => linear.has(key));
    case 'parent': return parents.get(current);
    case 'child': return order.slice(position + 1).find(key => parents.get(key) === current);
  }
}

/** True when a component lies inside another in the navigation tree. */
export function isWithin(navigation: ComponentNavigation, key: string, ancestor: string) {
  for (let parent = navigation.parents.get(key); parent; parent = navigation.parents.get(parent)) {
    if (parent === ancestor) return true;
  }
  return false;
}

const kindLabels: Record<string, string> = { 'list-item': 'List item', code: 'Code block', title: 'Title block' };

export function componentKindLabel(kind: string | undefined) {
  if (!kind) return 'Component';
  const label = kindLabels[kind] ?? kind.replace(/[-_]+/g, ' ');
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export function textExcerpt(text: string, limit = 60) {
  const value = text.replace(/\s+/g, ' ').trim();
  if (value.length <= limit) return value;
  const cut = value.slice(0, limit);
  const space = cut.lastIndexOf(' ');
  return `${(space > limit * 0.6 ? cut.slice(0, space) : cut).replace(/[\s.,;:\u2013\u2014-]+$/u, '')}…`;
}

/**
 * Name a selectable component for assistive technology from what a reader can
 * see: its kind and opening words, or what it depicts. Identifiers are never
 * used; they are authoring data, not visible content.
 */
export function componentName({ kind, text = '', depicts, whole = false }: {
  kind?: string;
  text?: string;
  /** What a component without text shows, such as an image or logo. */
  depicts?: string;
  /** The whole component, when its text is also selectable on its own. */
  whole?: boolean;
}) {
  const quote = textExcerpt(text);
  if (!quote && depicts) return depicts;
  const label = `${componentKindLabel(kind)}${whole ? ' component' : ''}`;
  return quote ? `${label}: ${quote}` : label;
}
