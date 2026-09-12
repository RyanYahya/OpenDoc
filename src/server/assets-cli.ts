import { readFile, stat } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { AssetStore } from '../assets/store';
import type { UploadFile } from '../assets/imports';
import type { AssetKind, ThemeAssetDefaults } from '../shared/assets';

const usage = `Usage: npx opendoc assets list [logo|font] [--archived]
       npx opendoc assets inspect <logo|font> <id> [--revision <revision>]
       npx opendoc assets import logo --file <svg-or-png> --name "Name" [--id <id>] [--description "Guidance"] [--variation-name "Name"] [--variation-description "When to use"]
       npx opendoc assets import font --file <ttf-or-otf> [--file <another-face> ...] [--id <id>] [--name "Name"] [--description "Guidance"]
       npx opendoc assets revise <logo|font> <id> --metadata <json-file>
       npx opendoc assets add-variation <logo-id> --file <svg-or-png> --name "Name" --expected-revision <revision> [--id <variation-id>] [--description "When to use"] [--replace <variation-id>]
       npx opendoc assets add-faces <font-id> --file <ttf-or-otf> [--file <another-face> ...] --expected-revision <revision>
       npx opendoc assets archive <logo|font> <id> --expected-revision <revision> [--clear-defaults]
       npx opendoc assets restore <logo|font> <id> --expected-revision <revision>
       npx opendoc assets defaults <theme-id> [--metadata <json-file> --expected-revision <revision>]
       npx opendoc assets bind <document-id> <logo|body-font|heading-font> <asset-id> [--revision <revision>] [--variation <variation-id>] [--name <logo-binding>]
       npx opendoc assets unbind <document-id> <logo|body-font|heading-font> [--name <logo-binding>]

Successful commands print JSON. Inspect before editing: revisions prevent overwriting another writer.
revise metadata requires expectedRevision plus the fields to change. defaults metadata is the complete ThemeAssetDefaults object.
Binding saves an exact version now; changing a theme default affects only new documents.
See docs/ASSETS.md for file contracts and authoring examples.`;

function kind(value: string | undefined): AssetKind {
  if (value !== 'logo' && value !== 'font') throw new Error('Choose asset kind logo or font.\n' + usage);
  return value;
}

function role(value: string | undefined): 'logo' | 'body-font' | 'heading-font' {
  if (value !== 'logo' && value !== 'body-font' && value !== 'heading-font') throw new Error('Choose document role logo, body-font, or heading-font.\n' + usage);
  return value;
}

async function localFile(file: string): Promise<UploadFile> {
  const path = resolve(file);
  const info = await stat(path);
  if (!info.isFile()) throw new Error(`Choose a regular local file: ${file}`);
  if (!info.size || info.size > 100 * 1024 * 1024) throw new Error('Choose a nonempty asset file no larger than 100 MB.');
  const bytes = await readFile(path);
  if (!bytes.length || bytes.length > 100 * 1024 * 1024) throw new Error('Choose a nonempty asset file no larger than 100 MB.');
  return { filename: basename(path), bytes };
}

async function metadata(file: string) {
  const path = resolve(file);
  const info = await stat(path);
  if (!info.isFile() || info.size > 256_000) throw new Error('Choose a regular JSON metadata file no larger than 256 KB.');
  const bytes = await readFile(path);
  if (bytes.length > 256_000) throw new Error('Asset metadata must be no larger than 256 KB.');
  const data: unknown = JSON.parse(bytes.toString('utf8'));
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Asset metadata must be a JSON object.');
  return data as Record<string, unknown>;
}

/** The CLI and HTTP routes deliberately delegate all asset rules to the same store. */
export async function runAssetsCli(args: string[], root = process.cwd()) {
  const { values, positionals } = parseArgs({
    args: args[0] === '--' ? args.slice(1) : args, allowPositionals: true,
    options: {
      help: { type: 'boolean', short: 'h' }, json: { type: 'boolean' }, archived: { type: 'boolean' },
      file: { type: 'string', multiple: true }, name: { type: 'string' }, id: { type: 'string' },
      description: { type: 'string' }, 'variation-name': { type: 'string' }, 'variation-description': { type: 'string' },
      revision: { type: 'string' }, 'expected-revision': { type: 'string' }, metadata: { type: 'string' },
      variation: { type: 'string' }, replace: { type: 'string' }, 'clear-defaults': { type: 'boolean' },
    },
  });
  if (values.help) { console.log(values.json ? JSON.stringify({ usage }, null, 2) : usage); return; }
  const [command = 'list', first, second, third] = positionals;
  const store = new AssetStore(root);
  const shape = (count: number | number[], flags: string[]) => {
    if (!(Array.isArray(count) ? count : [count]).includes(positionals.length)) throw new Error(usage);
    const unexpected = Object.keys(values).filter(key => !['json', ...flags].includes(key));
    if (unexpected.length) throw new Error(`Option --${unexpected[0]} is not used by ${command}.\n${usage}`);
  };
  const required = (value: string | undefined, name: string) => {
    if (!value?.trim()) throw new Error(`Provide --${name}.\n${usage}`);
    return value;
  };
  const expected = () => required(values['expected-revision'], 'expected-revision');
  const files = async (single = false) => {
    if (!values.file?.length || (single && values.file.length !== 1)) throw new Error(`Provide ${single ? 'exactly one --file' : 'at least one --file'}.\n${usage}`);
    if (values.file.length > 24) throw new Error('Import at most 24 font faces together.');
    const uploads: UploadFile[] = [];
    let total = 0;
    for (const path of values.file) {
      const upload = await localFile(path);
      total += upload.bytes.byteLength;
      if (total > 100 * 1024 * 1024) throw new Error('A font import must be 100 MB or smaller.');
      uploads.push(upload);
    }
    return uploads;
  };
  let result: unknown;
  switch (command) {
    case 'list':
      shape([0, 1, 2], ['archived']);
      result = await store.list(first === undefined ? undefined : kind(first), values.archived ?? false);
      break;
    case 'inspect':
      shape(3, ['revision']);
      result = await store.inspect(kind(first), second, values.revision);
      break;
    case 'import': {
      const assetKind = kind(first);
      shape(2, ['file', 'id', 'name', 'description', ...(assetKind === 'logo' ? ['variation-name', 'variation-description'] : [])]);
      result = assetKind === 'logo'
        ? await store.createLogo({ id: values.id, name: required(values.name, 'name'), description: values.description, variationName: values['variation-name'], variationDescription: values['variation-description'] }, (await files(true))[0])
        : await store.createFont({ id: values.id, name: values.name, description: values.description }, await files());
      break;
    }
    case 'revise': {
      shape(3, ['metadata']);
      const input = await metadata(required(values.metadata, 'metadata'));
      if (typeof input.expectedRevision !== 'string' || !input.expectedRevision) throw new Error('Revision metadata needs expectedRevision from the latest inspection.');
      result = await store.revise(kind(first), second, input as Parameters<AssetStore['revise']>[2]);
      break;
    }
    case 'add-variation':
      shape(2, ['file', 'name', 'id', 'description', 'expected-revision', 'replace']);
      result = await store.addVariation(first, { expectedRevision: expected(), id: values.id, name: required(values.name, 'name'), description: values.description, replaceId: values.replace }, (await files(true))[0]);
      break;
    case 'add-faces':
      shape(2, ['file', 'expected-revision']);
      result = await store.addFaces(first, { expectedRevision: expected() }, await files());
      break;
    case 'archive':
      shape(3, ['expected-revision', 'clear-defaults']);
      result = await store.archive(kind(first), second, expected(), values['clear-defaults'] ?? false);
      break;
    case 'restore':
      shape(3, ['expected-revision']);
      result = await store.restore(kind(first), second, expected());
      break;
    case 'defaults':
      shape(2, values.metadata ? ['metadata', 'expected-revision'] : []);
      result = values.metadata
        ? await store.setDefaults(first, await metadata(values.metadata) as unknown as ThemeAssetDefaults, expected())
        : await store.defaults(first);
      break;
    case 'bind': {
      const documentRole = role(second);
      shape(4, ['revision', ...(documentRole === 'logo' ? ['variation', 'name'] : [])]);
      result = await store.bind(first, documentRole, third, { revision: values.revision, variation: values.variation, name: values.name });
      break;
    }
    case 'unbind': {
      const documentRole = role(second);
      shape(3, documentRole === 'logo' ? ['name'] : []);
      result = await store.unbind(first, documentRole, values.name);
      break;
    }
    default: throw new Error(usage);
  }
  console.log(JSON.stringify(result, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  runAssetsCli(process.argv.slice(2)).catch(error => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
}
