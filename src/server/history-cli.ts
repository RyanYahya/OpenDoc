import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { readJSON } from './files';
import { validId } from './render';
import { HistoryStore } from './history';
import { recordAgentChanges } from './history-capture';
import { blockHistory, compareVersion, restoreVersion } from './history-restore';
import { describeVersions, groupVersions, historyChangeLabels, summaryText, type HistoryBlockChange, type HistoryVersionSummary, type RestoreScope } from '../shared/history';
import { formatTime, formatTimeRange, formatWhen } from '../shared/dates';
import { changedPassages } from '../shared/word-diff';

const usage = `Usage: npx opendoc history list <doc> [--json]
       npx opendoc history show <doc> <version> [--json]
       npx opendoc history block <doc> <block-id> [--json]
       npx opendoc history restore <doc> <version> [--block <id> | --section <id>] [--json]

History is recorded automatically and kept for 90 days in documents/<doc>/.history/. Without a running
OpenDoc service, as in OpenDoc Headless, create, check, review, export, comments, documents, and
history record the edits made since the previous version.
list groups versions by day, and joins a burst from one source within ten minutes into one entry,
as the History panel does; --json also gives each version its description and the same groups.
show names each changed block by its kind and opening words, with the changed words; --json adds
them to each block as words: [{ removed, added }].
restore without --block or --section restores the whole version. --block restores one block's own
content; --section restores a block together with everything inside it. Every restore is recorded,
so it can itself be undone by restoring the previous version it reports.`;

// The same wording as the History panel rows.
const description = (versions: HistoryVersionSummary[]) => summaryText(describeVersions(versions));
const describe = (version: HistoryVersionSummary) => `${version.id}  ${formatWhen(version.at).padEnd(18)}  ${version.label.padEnd(13)}  ${description([version])}`;

/** The History panel's rows as text: days, then one line per version or per burst from one source. */
function listText(versions: HistoryVersionSummary[]) {
  const lines: string[] = [];
  for (const day of groupVersions(versions)) {
    lines.push('', day.day);
    for (const run of day.runs) {
      const [newest] = run.versions, oldest = run.versions.at(-1)!;
      if (run.versions.length === 1) { lines.push(`  ${newest.id}  ${formatTime(newest.at).padEnd(17)}  ${newest.label.padEnd(13)}  ${description([newest])}`); continue; }
      lines.push(`  ${`${run.versions.length} versions`.padEnd(newest.id.length)}  ${formatTimeRange(oldest.at, newest.at).padEnd(17)}  ${newest.label.padEnd(13)}  ${description(run.versions)}`);
      for (const version of run.versions) lines.push(`    ${version.id}  ${formatTime(version.at).padEnd(15)}  ${description([version])}`);
    }
  }
  return lines;
}

const quoted = (text: string) => `“${text.length > 60 ? `${text.slice(0, 59)}…` : text}”`;
/** Changed passages as "“12%” → “15%”", "added “…”", or "removed “…”", the first few of them. */
function passagesText(passages: { removed: string; added: string }[], shown = 4) {
  const parts = passages.slice(0, shown).map(({ removed, added }) => removed && added ? `${quoted(removed)} → ${quoted(added)}` : added ? `added ${quoted(added)}` : `removed ${quoted(removed)}`);
  return parts.join('; ') + (passages.length > shown ? `; and ${passages.length - shown} more` : '');
}

/** A changed block as the panel names it, then its wording and how to restore it. */
function changeText(block: HistoryBlockChange & { words?: { removed: string; added: string }[] }, inside: number) {
  const lines = [`  ${historyChangeLabels[block.status].padEnd(22)} ${block.kindLabel}${block.name ? ` “${block.name}”` : ''}  [${block.id}]`];
  if (block.status === 'contents') lines.push(`      ${inside ? `${inside} ${inside === 1 ? 'change' : 'changes'} inside it, listed separately.` : 'Its contents changed.'}`);
  else {
    if (block.before !== undefined && block.after !== undefined && block.words?.length) lines.push(`      words: ${passagesText(block.words)}`);
    if (block.before) lines.push(`      then:  ${block.before}`);
    if (block.after) lines.push(`      now:   ${block.after}`);
  }
  const kind = block.kindLabel.toLowerCase();
  const options = [
    // The same scopes the History panel offers: a container's own text, or the container with its contents.
    ...(block.block.ok ? [`--block ${block.id}${block.container ? ` (its own text only)` : ''}`] : []),
    ...(block.container && block.section.ok ? [`--section ${block.id} (the ${kind} with its contents)`] : []),
  ];
  if (options.length) lines.push(`      restore: ${options.join(' or ')}`);
  else if (block.block.reason ?? block.section.reason) lines.push(`      ${block.block.reason ?? block.section.reason}`);
  return lines;
}

export async function runHistoryCli(args: string[], root = process.cwd()): Promise<void> {
  const { values, positionals } = parseArgs({ args: args[0] === '--' ? args.slice(1) : args, allowPositionals: true, options: {
    json: { type: 'boolean' }, help: { type: 'boolean', short: 'h' }, block: { type: 'string' }, section: { type: 'string' },
  } });
  if (values.help) { console.log(values.json ? JSON.stringify({ usage }, null, 2) : usage); return; }
  const [action, doc, target] = positionals;
  if (!doc || !validId(doc)) throw new Error(usage);
  const store = new HistoryStore(root);
  // Without a running service, edits since the last command are recorded here first. Restore records them itself.
  if (['list', 'show', 'block'].includes(action)) await recordAgentChanges(root, [doc]);
  const print = (value: unknown, text: string) => console.log(values.json ? JSON.stringify(value, null, 2) : text);
  if (action === 'list' && positionals.length === 2) {
    const versions = await store.list(doc);
    const groups = groupVersions(versions).map(day => ({ day: day.day, runs: day.runs.map(run => ({
      origin: run.origin, label: run.versions[0].label, description: description(run.versions), from: run.versions.at(-1)!.at, to: run.versions[0].at, versions: run.versions.map(version => version.id),
    })) }));
    print({ documentId: doc, retentionDays: store.retentionDays, versions: versions.map(version => ({ ...version, description: description([version]) })), groups },
      versions.length ? [`Version history for ${doc}, newest first (kept ${store.retentionDays} days):`, ...listText(versions)].join('\n')
        : `No history recorded for ${doc} yet. OpenDoc records versions while it runs and when commands such as check and review see a change.`);
  } else if (action === 'show' && target && positionals.length === 3) {
    const comparison = await compareVersion(store, doc, target);
    // Word changes, as the panel marks them, for blocks whose wording exists in both versions.
    const blocks = comparison.blocks.map(block => block.before !== undefined && block.after !== undefined && block.status !== 'contents'
      ? { ...block, words: changedPassages(block.before, block.after) } : block);
    const lines = [describe(comparison.version), comparison.identical ? 'Identical to the current source.' : 'Compared with the current source:'];
    for (const block of blocks) lines.push(...changeText(block, blocks.filter(item => item.parent === block.id).length));
    for (const file of comparison.files) if (!/\.(?:tsx|jsx|ts|js|mjs)$/.test(file.path)) lines.push(`  ${(file.status === 'added' ? 'Added since' : file.status === 'removed' ? 'Removed since' : 'Changed').padEnd(22)} file ${file.path}`);
    if (!comparison.identical) lines.push(`Restore the whole version with: npx opendoc history restore ${doc} ${comparison.version.id}`);
    print({ ...comparison, blocks }, lines.join('\n'));
  } else if (action === 'block' && target && positionals.length === 3) {
    const history = await blockHistory(store, doc, target);
    print(history, [`${history.kindLabel}${history.name ? ` “${history.name}”` : ''}  [${history.id}]${history.resolution === 'enclosing' ? `, the ${history.kindLabel.toLowerCase()} containing ${target}` : ''}`, `  now: ${history.current}`,
      ...(history.entries.length ? history.entries.map(entry => `  ${describe(entry.version)}\n      ${entry.text}`) : ['  No earlier versions of this block.'])].join('\n'));
  } else if (action === 'restore' && target && positionals.length === 3) {
    if (values.block && values.section) throw new Error('Choose --block or --section, not both.');
    const scope: RestoreScope = values.block ? 'block' : values.section ? 'section' : 'version';
    const blockId = values.block ?? values.section;
    // A running service may hold unsaved browser drafts against the current source.
    const server = await readJSON<{ pid?: number } | null>(resolve(root, '.opendoc/server.json'), null);
    if (server) {
      const current = await readJSON<{ documentId?: string; manualEdit?: { pendingEdits?: number } } | null>(resolve(root, '.opendoc/current.json'), null);
      if (current?.documentId === doc && (current.manualEdit?.pendingEdits ?? 0) > 0) throw new Error('This document has unsaved text edits in OpenDoc. Save or discard them before restoring.');
    }
    const result = await restoreVersion(store, doc, target, { scope, blockId });
    const what = scope === 'version' ? 'the whole version' : scope === 'section' ? `${blockId} with its contents` : blockId;
    const undo = `npx opendoc history restore ${doc} ${result.previous}${scope === 'version' ? '' : ` --${scope} ${blockId}`}`;
    print(result, `Restored ${what} from ${target} (${result.files.join(', ')}).\nUndo with: ${undo}`);
  } else throw new Error(`Unknown history command or missing arguments.\n${usage}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  runHistoryCli(process.argv.slice(2)).catch(error => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
}
