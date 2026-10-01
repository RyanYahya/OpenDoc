import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { hasTags, standardTagGroups, standardTags, tagCounts, tagKey, taggedKinds, type TaggedKind, type TagsManifest } from '../shared/tags';
import { readProjects } from './projects';
import { changeItemTags, createCustomTag, deleteCustomTag, itemTags, presentItems, readTags, taggedKind, tagsFile } from './tags';

const usage = `Usage: npx opendoc tags [list] [--kind <kind>]
       npx opendoc tags show <kind> <id>
       npx opendoc tags add <kind> <id> <tag>...
       npx opendoc tags remove <kind> <id> <tag>...
       npx opendoc tags set <kind> <id> [<tag>...]
       npx opendoc tags find <tag>... [--kind <kind>]
       npx opendoc tags create <custom-tag>
       npx opendoc tags delete <custom-tag> [--untag]
<kind> is document, presentation, theme, or template. A tag is a standard tag ID such as
in-review, its label, or a custom tag. Quote tags with spaces; separate several with commas.`;

const singular: Record<TaggedKind, string> = { documents: 'document', themes: 'theme', templates: 'template' };

/** Positional tags may also be comma-separated, as in `--set "Draft, Finance"`. */
function tagArguments(values: string[]) {
  return values.flatMap(value => value.split(',')).filter(value => value.trim());
}

function counts(manifest: TagsManifest, kind?: TaggedKind) {
  const kinds = kind ? [kind] : taggedKinds;
  const byKind = Object.fromEntries(kinds.map(item => [item, new Map(tagCounts(manifest, item).map(entry => [entry.key, entry.count]))])) as Record<TaggedKind, Map<string, number>>;
  return (tag: string) => {
    const key = tagKey(tag);
    if (kind) return { count: byKind[kind].get(key) ?? 0 };
    const perKind = Object.fromEntries(kinds.map(item => [item, byKind[item].get(key) ?? 0])) as Record<TaggedKind, number>;
    return { count: Object.values(perKind).reduce((sum, value) => sum + value, 0), counts: perKind };
  };
}

/** The standard vocabulary by group, then custom tags, each with how many items use it. */
function vocabulary(manifest: TagsManifest, kind?: TaggedKind) {
  const count = counts(manifest, kind);
  const custom = [...manifest.custom];
  for (const item of taggedKinds) for (const entry of tagCounts(manifest, item)) if (!entry.standard && !custom.some(tag => tagKey(tag) === entry.key)) custom.push(entry.tag);
  return {
    file: tagsFile,
    standard: standardTagGroups.map(group => ({
      group: group.id, label: group.label, description: group.description, fits: group.kinds.map(item => singular[item]),
      tags: standardTags.filter(tag => tag.group === group.id).map(tag => ({ id: tag.id, label: tag.label, ...(tag.aliases ? { aliases: tag.aliases } : {}), ...count(tag.id) })),
    })),
    custom: custom.sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base', numeric: true })).map(tag => ({ tag, ...count(tag) })),
  };
}

/** Items carrying every requested tag. Documents also report their library name, format, and project. */
async function find(root: string, wanted: string[], kind?: TaggedKind) {
  const manifest = await readTags(root);
  const projects = await readProjects(root).catch(() => undefined);
  const results = [];
  for (const item of kind ? [kind] : taggedKinds) {
    const present = await presentItems(root, item);
    for (const [id, tags] of Object.entries(manifest[item]).sort(([a], [b]) => a.localeCompare(b, 'en'))) {
      if (!present.has(id) || !hasTags(tags, wanted)) continue;
      results.push({
        kind: singular[item], id,
        ...(item === 'documents' ? { name: projects?.names?.[id] ?? null, format: projects?.formats?.[id] ?? 'document', projectId: projects?.assignments[id] ?? null } : {}),
        tags,
      });
    }
  }
  return results;
}

export async function runTagsCli(args: string[], root = process.cwd()): Promise<void> {
  const { values, positionals } = parseArgs({ args: args[0] === '--' ? args.slice(1) : args, allowPositionals: true, options: {
    json: { type: 'boolean' }, help: { type: 'boolean', short: 'h' }, kind: { type: 'string' }, untag: { type: 'boolean' },
  } });
  if (values.help) { console.log(values.json ? JSON.stringify({ usage }, null, 2) : usage); return; }
  const [command = 'list', ...rest] = positionals;
  const kind = values.kind === undefined ? undefined : taggedKind(values.kind);
  if ((values.kind !== undefined && !['list', 'find'].includes(command)) || (values.untag && command !== 'delete')) throw new Error(usage);
  let result: unknown;
  if (command === 'list' && !rest.length) result = vocabulary(await readTags(root), kind);
  else if (command === 'show' && rest.length === 2) {
    const shown = await itemTags(root, rest[0], rest[1]);
    result = { kind: singular[shown.kind], id: shown.id, tags: shown.tags };
  } else if (['add', 'remove', 'set'].includes(command) && rest.length >= (command === 'set' ? 2 : 3)) {
    const [kindName, id, ...tags] = rest;
    const list = tagArguments(tags);
    const changed = await changeItemTags(root, kindName, id, command === 'set' ? { set: list } : { [command]: list });
    result = { kind: singular[changed.kind], id: changed.id, tags: changed.tags };
  } else if (command === 'find' && rest.length) result = await find(root, tagArguments(rest), kind);
  else if (command === 'create' && rest.length === 1) result = { created: (await createCustomTag(root, rest[0])).tag };
  else if (command === 'delete' && rest.length === 1) {
    const { deleted, untagged } = await deleteCustomTag(root, rest[0], { untag: values.untag });
    result = { deleted, untagged: untagged.map(item => ({ kind: singular[item.kind], id: item.id })) };
  } else throw new Error(usage);
  console.log(JSON.stringify(result, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  runTagsCli(process.argv.slice(2)).catch(error => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
}
