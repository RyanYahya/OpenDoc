import { formatDay } from './dates';

/** Where a recorded version came from, when OpenDoc knows. */
export type HistoryOrigin = 'baseline' | 'edit' | 'undo' | 'external' | 'restore';
export type RestoreScope = 'version' | 'block' | 'section';

/** Short, neutral names for where a version came from, shown as badges and in the CLI. */
export const historyOriginLabels: Record<HistoryOrigin, string> = {
  baseline: 'First version',
  edit: 'You',
  undo: 'Undo',
  external: 'Agent',
  restore: 'Restore',
};

/** How a changed block differs from the current source, as the history panel and command name it. */
export const historyChangeLabels: Record<HistoryBlockChange['status'], string> = {
  changed: 'Edited', contents: 'Changed inside', added: 'Added since', removed: 'Removed since', moved: 'Moved to another file', ambiguous: 'Appears more than once',
};

const kindNames: Record<string, string> = {
  TitleBlock: 'Title', Cover: 'Title', Heading: 'Heading', Paragraph: 'Paragraph', Section: 'Section', Slide: 'Slide',
  DataTable: 'Table', Table: 'Table', Callout: 'Callout', List: 'List', ListEntry: 'List item', CodeBlock: 'Code', Figure: 'Figure',
  Block: 'Group', View: 'Group', Note: 'Note', Notes: 'Notes', References: 'References', Media: 'Image', MediaFrame: 'Image', Logo: 'Logo',
  Image: 'Image', Text: 'Text', Quote: 'Quote',
};
const roleNames: Record<string, string> = { h1: 'Heading', h2: 'Heading', h3: 'Heading', label: 'Label', lead: 'Lead', small: 'Small print', caption: 'Caption', code: 'Code' };
// Custom document components are named by what their element name says they are.
const kindPatterns: [RegExp, string][] = [
  [/Title|Opening|Cover|Hero|Masthead/, 'Title'], [/Heading|Headline/, 'Heading'], [/Section|Chapter/, 'Section'], [/Slide/, 'Slide'],
  [/Table/, 'Table'], [/Quote/, 'Quote'], [/Chart|Figure|Graph/, 'Figure'], [/Image|Photo|Picture|Media/, 'Image'], [/Callout/, 'Callout'],
  [/List/, 'List'], [/Caption/, 'Caption'], [/Paragraph/, 'Paragraph'],
];

/**
 * A readable component kind such as "Title", "Paragraph", or "Table", from the JSX element name
 * and, for paragraphs, their literal `role`. Element names stay authoring data for agents.
 */
export function readableKind(element: string, role?: string) {
  const name = element.split('.').at(-1) ?? element;
  if ((name === 'Paragraph' || name === 'Text') && role && Object.hasOwn(roleNames, role)) return roleNames[role];
  if (Object.hasOwn(kindNames, name)) return kindNames[name];
  const pattern = kindPatterns.find(([test]) => test.test(name));
  if (pattern) return pattern[1];
  const words = name.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[-_]+/g, ' ').trim().toLowerCase();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : 'Block';
}

/** A block's opening words, for naming it in lists: the first text part, cut at a word boundary. */
export function blockName(text: string, limit = 48) {
  const value = (text.split(' · ')[0] ?? '').replace(/\s+/g, ' ').trim();
  if (value.length <= limit) return value;
  // A short opening sentence names a block better than a cut-off phrase.
  const sentence = /^(.{12,}?)[.!?\u061f](?:\s|$)/u.exec(value);
  if (sentence && sentence[1].length <= limit) return sentence[1];
  const cut = value.slice(0, limit);
  const space = cut.lastIndexOf(' ');
  return `${(space > limit * 0.5 ? cut.slice(0, space) : cut).replace(/[\s.,;:\u060c\u061b\u2013\u2014-]+$/u, '')}…`;
}

/** One changed block named for people: its readable kind and opening words. */
export interface HistoryChangeName {
  id: string;
  kindLabel: string;
  name: string;
  status: 'changed' | 'added' | 'removed' | 'moved' | 'ambiguous';
}

/** What changed relative to the previous version. `changes` names up to 12 blocks; older manifests may omit it. */
export interface HistorySummary { blocks: number; ids: string[]; files: string[]; changes?: HistoryChangeName[] }

/** A compact description of one recorded version, as listed in the history panel and CLI. */
export interface HistoryVersionSummary {
  id: string;
  at: string;
  origin: HistoryOrigin;
  label: string;
  /** Changes relative to the previous recorded version. */
  summary: HistorySummary;
  restore?: { from: string; scope: RestoreScope; blockId?: string };
  /** Text files whose stored bytes are missing or damaged, for example while sync is incomplete. */
  unavailable?: string[];
}

export interface HistoryList {
  documentId: string;
  retentionDays: number;
  versions: HistoryVersionSummary[];
}

export interface RestoreAvailability { ok: boolean; reason?: string }

/** One stable block that differs between a recorded version and the current source. */
export interface HistoryBlockChange {
  id: string;
  file: string;
  /** The JSX element name, such as Paragraph or Section. */
  kind: string;
  /** The readable kind, such as "Paragraph" or "Title". */
  kindLabel: string;
  /** The block's opening words, or an empty string when it has no text. */
  name: string;
  status: 'changed' | 'contents' | 'added' | 'removed' | 'moved' | 'ambiguous';
  /** Contains other blocks with literal IDs. */
  container: boolean;
  parent: string | null;
  /** Readable text excerpts from that version and from the current source. */
  before?: string;
  after?: string;
  /** IDs of blocks inside this one, in either version; used to highlight a section. */
  descendants: string[];
  block: RestoreAvailability;
  section: RestoreAvailability;
}

export interface HistoryFileChange { path: string; status: 'added' | 'removed' | 'modified' }

export interface HistoryComparison {
  documentId: string;
  version: HistoryVersionSummary;
  /** Digest of the current text sources; restores send it back to detect intervening changes. */
  base: string;
  blocks: HistoryBlockChange[];
  files: HistoryFileChange[];
  /** True when that version's text sources equal the current ones. */
  identical: boolean;
}

export interface BlockHistoryEntry {
  version: HistoryVersionSummary;
  text: string;
  container: boolean;
}

export interface BlockHistory {
  documentId: string;
  /** The requested rendered block and the authored block that holds it. */
  requested: string;
  id: string;
  resolution: 'exact' | 'enclosing';
  kind: string;
  kindLabel: string;
  name: string;
  container: boolean;
  current: string;
  base: string;
  entries: BlockHistoryEntry[];
}

export interface RestoreResult {
  documentId: string;
  scope: RestoreScope;
  blockId?: string;
  /** The version recorded for the restored state. */
  version: HistoryVersionSummary | null;
  /** The version holding the state immediately before the restore; restoring it undoes this restore. */
  previous: string;
  files: string[];
}

/** Part of a version description: plain words, or a block's own words to quote and isolate for bidirectional text. */
export type HistorySummaryPart = string | { quote: string };

const codeSource = /\.(?:tsx|jsx|ts|js|mjs)$/;
const verbs: Record<HistoryChangeName['status'], string> = { changed: 'edited', added: 'added', removed: 'removed', moved: 'moved', ambiguous: 'edited' };

/**
 * Describe one version, or a run of versions newest first, by what changed: "Edited “Budget”,
 * “Risks” and 3 more". Block IDs never appear; a version without named blocks falls back to counts.
 */
export function describeVersions(versions: HistoryVersionSummary[], shown = 2): HistorySummaryPart[] {
  const [first] = versions;
  if (!first) return [];
  if (versions.length === 1 && first.origin === 'baseline') return ['First recorded version'];
  if (versions.length === 1 && first.restore?.scope === 'version') return ['Restored an earlier version'];
  const restoring = versions.length === 1 && !!first.restore;
  const named = new Map<string, HistoryChangeName>();
  const ids = new Set<string>();
  let unlisted = 0;
  for (const version of versions) {
    for (const change of version.summary.changes ?? []) if (!named.has(change.id)) named.set(change.id, change);
    for (const id of version.summary.ids) ids.add(id);
    unlisted += Math.max(0, version.summary.blocks - version.summary.ids.length);
  }
  const total = ids.size + unlisted;
  if (named.size) {
    const parts: HistorySummaryPart[] = [];
    const listed = [...named.values()].slice(0, shown);
    // Several names share one line, so each gets fewer words.
    const limit = listed.length > 1 ? 28 : 48;
    let previous = '';
    for (const [index, change] of listed.entries()) {
      const verb = restoring ? 'restored' : verbs[change.status];
      const lead = verb === previous ? (index ? ', ' : '') : `${index ? ', ' : ''}${index ? verb : verb.charAt(0).toUpperCase() + verb.slice(1)} `;
      previous = verb;
      parts.push(lead, change.name ? { quote: blockName(change.name, limit) } : change.kindLabel.toLowerCase());
    }
    const rest = Math.max(total, named.size) - Math.min(shown, named.size);
    if (rest > 0) parts.push(` and ${rest} more`);
    return parts;
  }
  if (total) return [`${restoring ? 'Restored' : 'Edited'} ${total} ${total === 1 ? 'block' : 'blocks'}`];
  if (restoring) return [`Restored a ${first.restore!.scope}`];
  const files = [...new Set(versions.flatMap(version => version.summary.files))].filter(file => !codeSource.test(file));
  if (files.length) return [files.length === 1 ? `Updated ${files[0]}` : `Updated ${files.length} files`];
  return ['Layout or code change with no wording change'];
}

/** Plain text of a description, with block words in quotation marks. */
export const summaryText = (parts: HistorySummaryPart[]) => parts.map(part => typeof part === 'string' ? part : `“${part.quote}”`).join('');

/** Consecutive versions from one origin, newest first, shown as one expandable row. */
export interface VersionRun { key: string; origin: HistoryOrigin; versions: HistoryVersionSummary[] }
export interface VersionDay { key: string; day: string; runs: VersionRun[] }

// Restores and the first version stay on their own rows: each is a distinct event.
const groupable = new Set<HistoryOrigin>(['edit', 'external', 'undo']);

/**
 * Group versions (newest first) by day, then join consecutive versions of the same origin
 * that are at most `window` apart, so a burst of agent writes reads as one row.
 */
export function groupVersions(versions: HistoryVersionSummary[], { now = Date.now(), window = 10 * 60_000, locale }: { now?: number; window?: number; locale?: string } = {}): VersionDay[] {
  const days: VersionDay[] = [];
  for (const version of versions) {
    const day = formatDay(version.at, { now, locale });
    if (days.at(-1)?.day !== day) days.push({ key: version.id, day, runs: [] });
    const runs = days.at(-1)!.runs;
    const run = runs.at(-1);
    const oldest = run?.versions.at(-1);
    if (run && oldest && run.origin === version.origin && groupable.has(version.origin) && Date.parse(oldest.at) - Date.parse(version.at) <= window) run.versions.push(version);
    else runs.push({ key: version.id, origin: version.origin, versions: [version] });
  }
  return days;
}
