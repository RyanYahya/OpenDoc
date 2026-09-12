import { readFileSync, lstatSync, realpathSync, statSync } from 'node:fs';
import { resolve, relative, sep } from 'node:path';
import { createHash } from 'node:crypto';
import type {
  AssetKind,
  AssetFile,
  AssetHead,
  AssetRevision,
  DocumentAssets,
  ThemeAssetDefaults,
  AssetRef,
  LogoBinding,
} from '../shared/assets';
import { fontCanBeDefault } from '../shared/assets';
export class AssetError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export const validAssetId = (id: unknown): id is string =>
  typeof id === 'string' && id.length <= 80 && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id);
export const validRevision = (id: unknown): id is string => typeof id === 'string' && /^[a-f0-9]{64}$/.test(id);
export const assetHash = (bytes: Uint8Array | string) => createHash('sha256').update(bytes).digest('hex');
export function assertAssetId(id: unknown): asserts id is string {
  if (!validAssetId(id)) throw new AssetError('Use a short lowercase asset ID with single hyphens.');
}
export function assertKind(kind: unknown): asserts kind is AssetKind {
  if (kind !== 'logo' && kind !== 'font') throw new AssetError('Choose a logo or font asset.');
}
export function assetDirectory(root: string, kind: AssetKind, id: string) {
  assertKind(kind);
  assertAssetId(id);
  return resolve(root, 'assets', kind === 'logo' ? 'logos' : 'fonts', id);
}
export function assetRevisionPath(root: string, kind: AssetKind, id: string, revision: string) {
  if (!validRevision(revision)) throw new AssetError('Choose a valid saved asset version.');
  return resolve(assetDirectory(root, kind, id), 'revisions', `${revision}.json`);
}
export function safeAssetPath(root: string, file: string, directory = false) {
  const base = realpathSync(root),
    rel = relative(root, file);
  if (!rel || rel === '..' || rel.startsWith(`..${sep}`) || resolve(root, rel) !== file)
    throw new AssetError('Asset files must stay inside this workspace.');
  let cursor = base;
  for (const part of rel.split(sep)) {
    cursor = resolve(cursor, part);
    const info = lstatSync(cursor);
    if (info.isSymbolicLink()) throw new AssetError('Asset files must be ordinary local files, not symbolic links.');
  }
  const info = lstatSync(cursor);
  if (directory ? !info.isDirectory() : !info.isFile()) throw new AssetError('Expected an ordinary local asset file.');
  return cursor;
}
function json(root: string, file: string, limit = 256000): any {
  const path = safeAssetPath(root, file);
  if (statSync(path).size > limit) throw new AssetError('Asset metadata is too large.');
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    throw new AssetError(`Cannot read asset metadata: ${relative(root, file)}.`);
  }
}
function text(value: unknown, label: string, maximum = 4000, empty = false): asserts value is string {
  if (typeof value !== 'string' || value.length > maximum || (!empty && !value.trim()))
    throw new AssetError(`${label} must be ${empty ? '' : 'nonempty '}text, up to ${maximum} characters.`);
}
export function readAssetHead(root: string, kind: AssetKind, id: string): AssetHead {
  const value = json(root, resolve(assetDirectory(root, kind, id), 'asset.json'));
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    value.version !== 1 ||
    value.id !== id ||
    value.kind !== kind ||
    !validRevision(value.revision) ||
    (value.archived !== undefined && typeof value.archived !== 'boolean') ||
    (value.builtIn !== undefined && typeof value.builtIn !== 'boolean')
  )
    throw new AssetError(`Asset ${id} has invalid library metadata.`);
  if (value.archivedDefaults !== undefined) {
    if (!Array.isArray(value.archivedDefaults) || value.archivedDefaults.length > 512)
      throw new AssetError('The archived theme defaults are invalid.');
    const themes = new Set<string>();
    for (const saved of value.archivedDefaults) {
      if (!saved || !validAssetId(saved.id) || themes.has(saved.id) || !validRevision(saved.cleared))
        throw new AssetError('The archived theme defaults are invalid.');
      themes.add(saved.id);
      parseThemeAssetDefaults(saved.defaults);
    }
  }
  return value;
}
function validateFile(file: AssetFile) {
  if (
    !file ||
    !validRevision(file.hash) ||
    !/^files\/[a-f0-9]{64}\.(png|svg|ttf|otf|pdf)$/.test(file.file) ||
    !file.file.startsWith(`files/${file.hash}.`) ||
    !Number.isSafeInteger(file.bytes) ||
    file.bytes < 1 ||
    typeof file.mime !== 'string'
  )
    throw new AssetError('An asset file record is invalid.');
}
const inspectedVersions = new Map<
  string,
  {
    stamp: string;
    value: AssetRevision;
  }
>();
export function readAssetRevision(root: string, kind: AssetKind, id: string, revision: string): AssetRevision {
  const manifest = assetRevisionPath(root, kind, id, revision);
  let stamp: string;
  try {
    const info = statSync(safeAssetPath(root, manifest), { bigint: true });
    stamp = `${info.ino}:${info.size}:${info.mtimeNs}:${info.ctimeNs}`;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT')
      throw new AssetError(
        `The saved version of ${id} is missing. Restore its version manifest or rebind the document to an available version.`,
        404,
      );
    throw error;
  }
  const cached = inspectedVersions.get(manifest);
  if (cached?.stamp === stamp) return structuredClone(cached.value);
  let value: AssetRevision;
  try {
    value = json(root, assetRevisionPath(root, kind, id, revision)) as AssetRevision;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT')
      throw new AssetError(
        `The saved version of ${id} is missing. Restore its version manifest or rebind the document to an available version.`,
        404,
      );
    throw error;
  }
  if (
    !value ||
    value.version !== 1 ||
    value.id !== id ||
    value.kind !== kind ||
    value.revision !== revision ||
    !Number.isFinite(Date.parse(value.createdAt))
  )
    throw new AssetError(`Asset ${id} has invalid saved version metadata.`);
  const { revision: _, ...contents } = value;
  if (assetHash(JSON.stringify(contents)) !== revision)
    throw new AssetError(
      `Saved version of ${id} was changed outside OpenDoc. Restore the original version or import a new copy.`,
      409,
    );
  text(value.name, 'Asset name', 200);
  text(value.description, 'Asset guidance', 4000, true);
  const seen = new Set<string>();
  if (value.kind === 'logo') {
    if (!Array.isArray(value.variations) || !value.variations.length || value.variations.length > 64)
      throw new AssetError('A logo needs between one and 64 variations.');
    for (const variant of value.variations) {
      assertAssetId(variant.id);
      if (seen.has(variant.id)) throw new AssetError('Variation IDs must be unique.');
      seen.add(variant.id);
      text(variant.name, 'Variation name', 200);
      text(variant.description, 'Variation guidance', 4000, true);
      validateFile(variant.image);
      validateFile(variant.original);
    }
    if (!seen.has(value.defaultVariation)) throw new AssetError('Choose an existing default logo variation.');
  } else {
    if (
      !Array.isArray(value.faces) ||
      !value.faces.length ||
      value.faces.length > 24 ||
      !value.compatibility ||
      !['ready', 'needs-attention'].includes(value.compatibility.status) ||
      typeof value.compatibility.defaultEligible !== 'boolean'
    )
      throw new AssetError('The font family metadata is invalid.');
    for (const face of value.faces) {
      assertAssetId(face.id);
      if (seen.has(face.id)) throw new AssetError('Font face IDs must be unique.');
      seen.add(face.id);
      validateFile(face.file);
      text(face.family, 'Font family', 200);
      if (
        !Number.isInteger(face.weight) ||
        face.weight < 1 ||
        face.weight > 1000 ||
        !['normal', 'italic'].includes(face.style)
      )
        throw new AssetError('The font face needs a valid weight and style.');
    }
    if (value.specimen) validateFile(value.specimen);
  }
  if (inspectedVersions.size >= 256) inspectedVersions.delete(inspectedVersions.keys().next().value!);
  inspectedVersions.set(manifest, { stamp, value: structuredClone(value) });
  return value;
}
const verified = new Map<
  string,
  {
    stamp: string;
    hash: string;
  }
>();
export function assetFile(root: string, kind: AssetKind, id: string, file: AssetFile) {
  validateFile(file);
  let path: string;
  try {
    path = safeAssetPath(root, resolve(assetDirectory(root, kind, id), file.file));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT')
      throw new AssetError(
        `A saved file for ${id} is missing. Restore that file or rebind the document to an available version.`,
        404,
      );
    throw error;
  }
  const info = statSync(path, { bigint: true });
  const stamp = `${info.ino}:${info.size}:${info.mtimeNs}:${info.ctimeNs}`;
  let hash = verified.get(path)?.stamp === stamp ? verified.get(path)!.hash : undefined;
  if (!hash) {
    hash = assetHash(readFileSync(path));
    if (verified.size >= 256) verified.delete(verified.keys().next().value!);
    verified.set(path, { stamp, hash });
  }
  if (hash !== file.hash || info.size !== BigInt(file.bytes))
    throw new AssetError(
      `A saved file for ${id} was changed outside OpenDoc. Restore that file or import a new version.`,
      409,
    );
  return path;
}
export function revisionFiles(value: AssetRevision): AssetFile[] {
  return value.kind === 'logo'
    ? value.variations.flatMap((v) => [v.original, v.image])
    : [...value.faces.map((f) => f.file), ...(value.specimen ? [value.specimen] : [])];
}
function ref(value: unknown, logo = false): asserts value is AssetRef | LogoBinding {
  const v = value as LogoBinding;
  if (
    !v ||
    typeof v !== 'object' ||
    Array.isArray(v) ||
    !validAssetId(v.id) ||
    !validRevision(v.revision) ||
    Object.keys(v).some((key) => !['id', 'revision', ...(logo ? ['variation'] : [])].includes(key)) ||
    (v.variation !== undefined && !validAssetId(v.variation))
  )
    throw new AssetError('Document asset choices must identify an exact saved version.');
}
export function parseDocumentAssets(value: unknown): DocumentAssets {
  const v = value as DocumentAssets;
  if (
    !v ||
    typeof v !== 'object' ||
    Array.isArray(v) ||
    v.version !== 1 ||
    Object.keys(v).some((key) => !['version', 'logo', 'logos', 'bodyFont', 'headingFont'].includes(key))
  )
    throw new AssetError('Document assets must be a version 1 binding record.');
  if (v.logo !== undefined) ref(v.logo, true);
  if (v.bodyFont !== undefined) ref(v.bodyFont);
  if (v.headingFont !== undefined) ref(v.headingFont);
  if (v.logos !== undefined) {
    if (!v.logos || typeof v.logos !== 'object' || Array.isArray(v.logos) || Object.keys(v.logos).length > 64)
      throw new AssetError('Named logos must be a map of saved logo choices.');
    for (const [name, item] of Object.entries(v.logos)) {
      assertAssetId(name);
      ref(item, true);
    }
  }
  return v;
}
export function parseThemeAssetDefaults(value: unknown): ThemeAssetDefaults {
  const v = value as ThemeAssetDefaults;
  if (
    !v ||
    typeof v !== 'object' ||
    Array.isArray(v) ||
    v.version !== 1 ||
    Object.keys(v).some((key) => !['version', 'logo', 'bodyFont', 'headingFont'].includes(key))
  )
    throw new AssetError('Theme assets must be a version 1 defaults record.');
  if (v.logo !== undefined) {
    if (
      !v.logo ||
      typeof v.logo !== 'object' ||
      Array.isArray(v.logo) ||
      Object.keys(v.logo).some((key) => !['id', 'variation'].includes(key))
    )
      throw new AssetError('Choose a logo asset.');
    assertAssetId(v.logo.id);
    if (v.logo.variation !== undefined) assertAssetId(v.logo.variation);
  }
  if (v.bodyFont !== undefined) assertAssetId(v.bodyFont);
  if (v.headingFont !== undefined) assertAssetId(v.headingFont);
  return v;
}
export function readDocumentAssetsAt(root: string, directory: string): DocumentAssets {
  try {
    return parseDocumentAssets(json(root, resolve(directory, 'assets.json')));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { version: 1 };
    throw error;
  }
}
export function readDocumentAssets(root: string, id: string) {
  assertAssetId(id);
  return readDocumentAssetsAt(root, resolve(root, 'documents', id));
}
export function readThemeAssetDefaults(root: string, id: string): ThemeAssetDefaults {
  assertAssetId(id);
  try {
    return parseThemeAssetDefaults(json(root, resolve(root, 'themes', id, 'assets.json')));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { version: 1 };
    throw error;
  }
}
export function resolveThemeAssetDefaults(root: string, value: ThemeAssetDefaults): DocumentAssets {
  const defaults = parseThemeAssetDefaults(value),
    out: DocumentAssets = { version: 1 };
  function current(kind: AssetKind, id: string) {
    const head = readAssetHead(root, kind, id);
    if (head.archived) throw new AssetError(`Choose an active asset instead of archived ${id}.`);
    const record = readAssetRevision(root, kind, id, head.revision);
    for (const file of revisionFiles(record)) assetFile(root, kind, id, file);
    return record;
  }
  if (defaults.logo) {
    const record = current('logo', defaults.logo.id);
    if (record.kind !== 'logo') throw new AssetError('Choose a logo asset.');
    if (defaults.logo.variation && !record.variations.some((v) => v.id === defaults.logo!.variation))
      throw new AssetError('Choose an available logo variation.');
    out.logo = {
      id: record.id,
      revision: record.revision,
      ...(defaults.logo.variation ? { variation: defaults.logo.variation } : {}),
    };
  }
  for (const role of ['bodyFont', 'headingFont'] as const)
    if (defaults[role]) {
      const record = current('font', defaults[role]!);
      if (record.kind !== 'font' || !fontCanBeDefault(record))
        throw new AssetError(
          `Font ${record.name} is not ready as a theme default. Choose a family with a verified regular and emphasis face.`,
        );
      out[role] = { id: record.id, revision: record.revision };
    }
  return out;
}
export function resolveThemeAssets(root: string, id: string): DocumentAssets {
  return resolveThemeAssetDefaults(root, readThemeAssetDefaults(root, id));
}
export function bindingDependencies(root: string, bindings: DocumentAssets): string[] {
  const entries: [AssetKind, AssetRef][] = [];
  if (bindings.logo) entries.push(['logo', bindings.logo]);
  for (const logo of Object.values(bindings.logos ?? {})) entries.push(['logo', logo]);
  for (const font of [bindings.bodyFont, bindings.headingFont]) if (font) entries.push(['font', font]);
  const files = new Set<string>();
  for (const [kind, binding] of entries) {
    files.add(relative(root, assetRevisionPath(root, kind, binding.id, binding.revision)));
    try {
      const record = readAssetRevision(root, kind, binding.id, binding.revision);
      for (const file of revisionFiles(record))
        files.add(relative(root, resolve(assetDirectory(root, kind, binding.id), file.file)));
    } catch {
      /* Keep missing manifest in dependencies for repair. */
    }
  }
  return [...files];
}
