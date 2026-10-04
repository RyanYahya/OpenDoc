import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { documentStatus, documentStatuses, hasTags, hasType, splitTags, standardType, standardTypes, tagCounts, tagKey, taggedKinds, typeCounts, type DocumentStatus, type TaggedKind, type TagsManifest } from '../shared/tags';
import { languages, parseLanguage, type Language } from '../shared/language';
import { readProjects } from './projects';
import { changeItemTags, createCustomTag, deleteCustomTag, detailsOf, itemTags, presentItems, readTags, setDocumentStatus, singularKind, taggedKind, tagsFile, TagsError, type ItemDetails } from './tags';
import { sourceLanguage } from './language';
import { ThemeCatalog } from './themes';

const usage = `Usage: npx opendoc tags [list] [--kind <kind>]
       npx opendoc tags show <kind> <id>
       npx opendoc tags add <kind> <id> <tag>...
       npx opendoc tags remove <kind> <id> <tag>...
       npx opendoc tags set <kind> <id> [<tag>...]
       npx opendoc tags status <document-id> [draft|in-review|final|archived|--clear]
       npx opendoc tags find [<tag>...] [--kind <kind>] [--type <type>] [--status <status|none>] [--language english|arabic|bilingual]
       npx opendoc tags create <custom-tag>
       npx opendoc tags delete <custom-tag> [--untag]
<kind> is document, presentation, theme, or template. A tag is a type such as report (documents
and templates have one), or a custom tag such as a client name. Quote tags with spaces; separate
several with commas. Status belongs to documents; language is detected, never set.`;

/** Positional tags may also be comma-separated, as in `"Client Acme, report"`. */
function tagArguments(values: string[]) {
  return values.flatMap(value => value.split(',')).filter(value => value.trim());
}

/** Item details as printed: always the same fields, with null for an absent type or status. */
function printed(details: ItemDetails, language?: Language) {
  return {
    kind: singularKind[details.kind], id: details.id,
    ...(hasType(details.kind) ? { type: details.type ?? null } : {}),
    ...(details.kind === 'documents' ? { status: details.status ?? null } : {}),
    ...(language ? { language } : {}),
    tags: details.tags,
  };
}

/** Types, statuses, languages, and custom tags, each with how many items use it. */
function vocabulary(manifest: TagsManifest, kind?: TaggedKind) {
  const kinds = kind ? [kind] : [...taggedKinds];
  const perKind = <T extends string>(count: (item: TaggedKind) => Map<T, number>, value: T) => {
    const counts = Object.fromEntries(kinds.map(item => [item, count(item).get(value) ?? 0])) as Record<TaggedKind, number>;
    const total = Object.values(counts).reduce((sum, value) => sum + value, 0);
    return kind ? { count: total } : { count: total, counts };
  };
  const typed = kinds.filter(hasType);
  const typeTotals = new Map(typed.map(item => [item, new Map(typeCounts(manifest, item).map(entry => [entry.id, entry.count]))]));
  const customTotals = new Map(kinds.map(item => [item, new Map(tagCounts(manifest, item).map(entry => [entry.key, entry.count]))]));
  const custom = [...manifest.custom];
  for (const item of taggedKinds) for (const entry of tagCounts(manifest, item)) if (!custom.some(tag => tagKey(tag) === entry.key)) custom.push(entry.tag);
  const statusCounts = new Map<DocumentStatus, number>();
  for (const status of Object.values(manifest.status)) statusCounts.set(status, (statusCounts.get(status) ?? 0) + 1);
  return {
    file: tagsFile,
    ...(typed.length ? { types: standardTypes.map(type => ({ id: type.id, label: type.label, description: type.description, aliases: type.aliases, ...perKind(item => typeTotals.get(item) ?? new Map(), type.id) })) } : {}),
    ...(kinds.includes('documents') ? { statuses: documentStatuses.map(status => ({ id: status.id, label: status.label, count: statusCounts.get(status.id) ?? 0 })) } : {}),
    languages: languages.map(language => ({ id: language.id, label: language.label })),
    custom: custom.sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base', numeric: true })).map(tag => ({ tag, ...perKind(item => customTotals.get(item)!, tagKey(tag)) })),
  };
}

/** Derived languages; theme definitions are read only when a theme needs one. */
function languageReader(root: string) {
  let themes: Promise<Map<string, Language | undefined>> | undefined;
  return async (kind: TaggedKind, id: string): Promise<Language | undefined> => {
    if (kind !== 'themes') return sourceLanguage(root, kind, id);
    themes ??= (async () => {
      const catalog = new ThemeCatalog(root);
      try { return new Map((await catalog.list()).map(theme => [theme.id, theme.language])); } finally { await catalog.close(); }
    })();
    return (await themes).get(id);
  };
}

interface Filters { type?: string; status?: DocumentStatus | 'none'; language?: Language }

/**
 * Items carrying every requested tag and matching each filter. A status filter selects documents
 * and a type filter documents and templates, unless `--kind` says otherwise. Documents also report
 * their library name, format, and project.
 */
async function find(root: string, wanted: string[], kind: TaggedKind | undefined, filters: Filters) {
  const manifest = await readTags(root);
  const projects = await readProjects(root).catch(() => undefined);
  const language = languageReader(root);
  const kinds = kind ? [kind] : taggedKinds.filter(item => (!filters.status || item === 'documents') && (!filters.type || hasType(item)));
  const results = [];
  for (const item of kinds) {
    for (const id of [...await presentItems(root, item)].sort((a, b) => a.localeCompare(b, 'en'))) {
      const stored = Object.hasOwn(manifest[item], id) ? manifest[item][id] : undefined;
      const details = detailsOf(manifest, item, id);
      if (!hasTags(stored, wanted)) continue;
      if (filters.type && splitTags(item, stored).type !== filters.type) continue;
      if (filters.status && (details.status ?? 'none') !== filters.status) continue;
      const detected = await language(item, id);
      if (filters.language && detected !== filters.language) continue;
      const entry = printed(details, detected);
      results.push(item === 'documents' ? { ...entry, name: projects?.names?.[id] ?? null, format: projects?.formats?.[id] ?? 'document', projectId: projects?.assignments[id] ?? null } : entry);
    }
  }
  return results;
}

function filterValues(values: { type?: string; status?: string; language?: string }): Filters {
  const filters: Filters = {};
  if (values.type !== undefined) {
    const type = standardType(values.type);
    if (!type) throw new TagsError(`“${values.type}” is not a type. Run npx opendoc tags to list them.`);
    filters.type = type.id;
  }
  if (values.status !== undefined) {
    const status = values.status.trim().toLowerCase() === 'none' ? 'none' : documentStatus(values.status);
    if (!status) throw new TagsError(`Choose a status of ${documentStatuses.map(item => item.id).join(', ')}, or none.`);
    filters.status = status;
  }
  if (values.language !== undefined) {
    const language = parseLanguage(values.language);
    if (!language) throw new TagsError('Choose a language of english, arabic, or bilingual.');
    filters.language = language;
  }
  return filters;
}

export async function runTagsCli(args: string[], root = process.cwd()): Promise<void> {
  const { values, positionals } = parseArgs({ args: args[0] === '--' ? args.slice(1) : args, allowPositionals: true, options: {
    json: { type: 'boolean' }, help: { type: 'boolean', short: 'h' }, kind: { type: 'string' }, untag: { type: 'boolean' },
    type: { type: 'string' }, status: { type: 'string' }, language: { type: 'string' }, clear: { type: 'boolean' },
  } });
  if (values.help) { console.log(values.json ? JSON.stringify({ usage }, null, 2) : usage); return; }
  const [command = 'list', ...rest] = positionals;
  const kind = values.kind === undefined ? undefined : taggedKind(values.kind);
  const filtering = values.type !== undefined || values.status !== undefined || values.language !== undefined;
  if ((values.kind !== undefined && !['list', 'find'].includes(command)) || (values.untag && command !== 'delete') || (filtering && command !== 'find') || (values.clear && command !== 'status')) throw new Error(usage);
  let result: unknown;
  if (command === 'list' && !rest.length) result = vocabulary(await readTags(root), kind);
  else if (command === 'show' && rest.length === 2) {
    const shown = await itemTags(root, rest[0], rest[1]);
    result = printed(shown, await languageReader(root)(shown.kind, shown.id));
  } else if (['add', 'remove', 'set'].includes(command) && rest.length >= (command === 'set' ? 2 : 3)) {
    const [kindName, id, ...tags] = rest;
    const list = tagArguments(tags);
    result = printed(await changeItemTags(root, kindName, id, command === 'set' ? { set: list } : { [command]: list }));
  } else if (command === 'status' && (rest.length === 1 || (rest.length === 2 && !values.clear))) {
    // `status <id>` prints the status; a value or --clear changes it.
    const [id, value] = rest;
    if (value === undefined && !values.clear) result = { id, status: (await itemTags(root, 'documents', id)).status ?? null };
    else result = { id, status: (await setDocumentStatus(root, id, values.clear ? null : value)).status ?? null };
  } else if (command === 'find' && (rest.length || filtering)) result = await find(root, tagArguments(rest), kind, filterValues(values));
  else if (command === 'create' && rest.length === 1) result = { created: (await createCustomTag(root, rest[0])).tag };
  else if (command === 'delete' && rest.length === 1) {
    const { deleted, untagged } = await deleteCustomTag(root, rest[0], { untag: values.untag });
    result = { deleted, untagged: untagged.map(item => ({ kind: singularKind[item.kind], id: item.id })) };
  } else throw new Error(usage);
  console.log(JSON.stringify(result, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  runTagsCli(process.argv.slice(2)).catch(error => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
}
