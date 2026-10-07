import { createHash } from 'node:crypto';
import { extname } from 'node:path';
import { isStableVersion } from '../cli/workspace';
import { limits, packPath, validatePaths } from './archive';

export type PackItem = { kind: 'theme' | 'template'; id: string; selected: boolean };
export type PackManifest = {
  format: 'opendoc-pack'; schemaVersion: 1; id: string; name: string; version: string;
  opendocVersion: string; author?: string; license?: string;
  items: PackItem[];
  assets: { kind: 'font' | 'logo'; id: string; revision: string }[];
  files: { path: string; bytes: number; sha256: string }[];
};
export const digest = (bytes: Uint8Array | string) => createHash('sha256').update(bytes).digest('hex');
export const validPackId = (value: unknown): value is string => typeof value === 'string' && value.length <= 80 && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
export const itemFolder = (item: Pick<PackItem, 'kind' | 'id'>) => `${item.kind === 'theme' ? 'themes' : 'templates'}/${item.id}`;
export const previewPath = (item: Pick<PackItem, 'kind' | 'id'>) => `previews/${item.kind}-${item.id}.pdf`;
export const sourceExtensions = new Set(['.ts', '.tsx', '.js', '.jsx']);
const assetExtensions = new Set(['.json', '.md', '.txt', '.png', '.svg', '.jpg', '.jpeg', '.webp', '.gif', '.ttf', '.otf', '.woff', '.woff2', '.pdf', '.csv']);

export function payloadPath(path: string): boolean {
  packPath(path);
  const parts = path.split('/'), extension = extname(path).toLowerCase();
  if (parts.some(part => ['node_modules', 'comments.json', 'package.json', 'tsconfig.json', 'jsconfig.json', 'package-lock.json', 'pnpm-lock.yaml'].includes(part))) return false;
  if (parts[0] === 'previews') return parts.length === 2 && /^(theme|template)-[a-z0-9]+(?:-[a-z0-9]+)*\.pdf$/.test(parts[1]);
  if (parts[0] === 'themes' || parts[0] === 'templates') {
    if (parts.length === 2) return sourceExtensions.has(extension);
    if (!validPackId(parts[1]) && parts[1] !== '_shared') return false;
    return sourceExtensions.has(extension) || assetExtensions.has(extension) || /^(LICENSE|NOTICE|COPYING)(\.[a-z]+)?$/i.test(parts.at(-1)!);
  }
  return parts[0] === 'assets' && parts.length >= 3 && (assetExtensions.has(extension) || /^(LICENSE|NOTICE|COPYING)$/i.test(parts.at(-1)!));
}

function text(value: unknown, limit = 200): value is string { return typeof value === 'string' && !!value.trim() && value.length <= limit; }
export function parseManifest(bytes: Buffer): PackManifest {
  if (bytes.length > 1024 * 1024) throw new Error('Pack manifest exceeds 1 MiB.');
  let value: PackManifest;
  try { value = JSON.parse(bytes.toString('utf8')); } catch { throw new Error('Pack manifest is not valid JSON.'); }
  if (!value || value.format !== 'opendoc-pack' || value.schemaVersion !== 1 || !validPackId(value.id)
    || !text(value.name) || !isStableVersion(value.version) || !isStableVersion(value.opendocVersion)
    || (value.author !== undefined && !text(value.author)) || (value.license !== undefined && !text(value.license, 1000))
    || !Array.isArray(value.items) || !value.items.length || value.items.length > 100
    || !Array.isArray(value.assets) || value.assets.length > 100 || !Array.isArray(value.files) || !value.files.length || value.files.length >= limits.files) {
    throw new Error('Invalid or unsupported OpenDoc pack manifest.');
  }
  const items = new Set<string>();
  for (const item of value.items) {
    if (!item || !['theme', 'template'].includes(item.kind) || !validPackId(item.id) || typeof item.selected !== 'boolean'
      || items.has(itemFolder(item))) throw new Error('Invalid or duplicate pack item.');
    items.add(itemFolder(item));
  }
  if (!value.items.some(item => item.selected)) throw new Error('A pack must select at least one theme or template.');
  const assets = new Set<string>();
  for (const asset of value.assets) {
    if (!asset || !['font', 'logo'].includes(asset.kind) || !validPackId(asset.id) || !/^[a-f0-9]{64}$/.test(asset.revision)
      || assets.has(`${asset.kind}/${asset.id}`)) throw new Error('Invalid or duplicate pack asset.');
    assets.add(`${asset.kind}/${asset.id}`);
  }
  for (const file of value.files) {
    if (!file || typeof file.path !== 'string' || !payloadPath(file.path) || !Number.isSafeInteger(file.bytes)
      || file.bytes < 0 || file.bytes > limits.file || typeof file.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(file.sha256)) throw new Error('Invalid pack file record.');
  }
  validatePaths(value.files.map(file => file.path));
  const paths = new Set(value.files.map(file => file.path));
  for (const item of value.items) {
    const required = item.kind === 'theme' ? ['index.ts', 'design.md', 'preview.tsx'] : ['index.tsx', 'template.json', 'AGENTS.md', 'preview.tsx', 'starter.tsx'];
    for (const name of required) if (!paths.has(`${itemFolder(item)}/${name}`)) throw new Error(`Pack is missing ${itemFolder(item)}/${name}.`);
    if (item.selected && !paths.has(previewPath(item))) throw new Error(`Pack is missing the preview for ${item.id}.`);
  }
  for (const file of value.files) {
    const parts = file.path.split('/');
    if (['themes', 'templates'].includes(parts[0]) && parts.length > 2 && parts[1] !== '_shared' && !items.has(parts.slice(0, 2).join('/'))) throw new Error(`Pack file belongs to an undeclared catalog item: ${file.path}.`);
  }
  return value;
}

export function verifyPack(files: Map<string, Buffer>): PackManifest {
  const bytes = files.get('manifest.json');
  if (!bytes) throw new Error('This ZIP has no OpenDoc pack manifest.');
  const manifest = parseManifest(bytes);
  if (manifest.files.length + 1 !== files.size) throw new Error('Pack contains missing or unlisted files.');
  for (const entry of manifest.files) {
    const contents = files.get(entry.path);
    if (!contents || contents.length !== entry.bytes || digest(contents) !== entry.sha256) throw new Error(`Pack file failed integrity verification: ${entry.path}.`);
    if (entry.path.startsWith('previews/') && !contents.subarray(0, 5).equals(Buffer.from('%PDF-'))) throw new Error(`Invalid preview PDF: ${entry.path}.`);
  }
  return manifest;
}

/** Conservative v1 compatibility: same minor line, no older patch. Both editions share this API. */
export function compatiblePack(manifest: PackManifest, version: string): boolean {
  if (!isStableVersion(version)) return false;
  const [major, minor, patch] = version.split('.').map(Number), expected = manifest.opendocVersion.split('.').map(Number);
  return major === expected[0] && minor === expected[1] && patch >= expected[2];
}
