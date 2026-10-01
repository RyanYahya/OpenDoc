import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { readJSON } from './files';
import { validId } from './render';
import { HistoryStore } from './history';
import { blockHistory, compareVersion, restoreVersion } from './history-restore';
import type { HistoryVersionSummary, RestoreScope } from '../shared/history';

const usage = `Usage: npx opendoc history list <doc> [--json]
       npx opendoc history show <doc> <version> [--json]
       npx opendoc history block <doc> <block-id> [--json]
       npx opendoc history restore <doc> <version> [--block <id> | --section <id>] [--json]

History is recorded automatically while OpenDoc runs and kept for 90 days in documents/<doc>/.history/.
restore without --block or --section restores the whole version. --block restores one block's own
content; --section restores a block together with everything inside it. Every restore is recorded,
so it can itself be undone by restoring the previous version it reports.`;

const time = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });
const describe = (version: HistoryVersionSummary) => {
  const changes = [version.summary.blocks ? `${version.summary.blocks} ${version.summary.blocks === 1 ? 'block' : 'blocks'} changed` : '',
    version.summary.files.filter(file => !/\.(?:tsx|jsx|ts|js|mjs)$/.test(file)).join(', ')].filter(Boolean).join('; ');
  return `${version.id}  ${time.format(new Date(version.at)).padEnd(22)}  ${version.label.padEnd(20)}  ${changes || (version.origin === 'baseline' ? 'First recorded state' : 'Text changed')}`;
};

export async function runHistoryCli(args: string[], root = process.cwd()): Promise<void> {
  const { values, positionals } = parseArgs({ args: args[0] === '--' ? args.slice(1) : args, allowPositionals: true, options: {
    json: { type: 'boolean' }, help: { type: 'boolean', short: 'h' }, block: { type: 'string' }, section: { type: 'string' },
  } });
  if (values.help) { console.log(values.json ? JSON.stringify({ usage }, null, 2) : usage); return; }
  const [action, doc, target] = positionals;
  if (!doc || !validId(doc)) throw new Error(usage);
  const store = new HistoryStore(root);
  const print = (value: unknown, text: string) => console.log(values.json ? JSON.stringify(value, null, 2) : text);
  if (action === 'list' && positionals.length === 2) {
    const versions = await store.list(doc);
    print({ documentId: doc, retentionDays: store.retentionDays, versions },
      versions.length ? [`Version history for ${doc}, newest first (kept ${store.retentionDays} days):`, ...versions.map(describe)].join('\n')
        : `No history recorded for ${doc} yet. OpenDoc records versions while it runs and before every restore.`);
  } else if (action === 'show' && target && positionals.length === 3) {
    const comparison = await compareVersion(store, doc, target);
    const lines = [`${describe(comparison.version)}`, comparison.identical ? 'Identical to the current source.' : 'Compared with the current source:'];
    for (const block of comparison.blocks) {
      lines.push(`  ${block.status.padEnd(9)} ${block.kind} ${block.id}${block.container ? ' (section)' : ''}`);
      if (block.before !== undefined) lines.push(`      then: ${block.before}`);
      if (block.after !== undefined) lines.push(`      now:  ${block.after}`);
      if (!block.block.ok && !block.section.ok && block.block.reason) lines.push(`      ${block.block.reason}`);
    }
    for (const file of comparison.files) if (!/\.(?:tsx|jsx|ts|js|mjs)$/.test(file.path)) lines.push(`  ${file.status.padEnd(9)} file ${file.path}`);
    print(comparison, lines.join('\n'));
  } else if (action === 'block' && target && positionals.length === 3) {
    const history = await blockHistory(store, doc, target);
    print(history, [`${history.kind} ${history.id}${history.resolution === 'enclosing' ? ` (contains ${target})` : ''}`, `  now: ${history.current}`,
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
    const what = scope === 'version' ? 'the whole version' : `${scope} ${blockId}`;
    const undo = `npx opendoc history restore ${doc} ${result.previous}${scope === 'version' ? '' : ` --${scope} ${blockId}`}`;
    print(result, `Restored ${what} from ${target} (${result.files.join(', ')}).\nUndo with: ${undo}`);
  } else throw new Error(`Unknown history command or missing arguments.\n${usage}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  runHistoryCli(process.argv.slice(2)).catch(error => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
}
