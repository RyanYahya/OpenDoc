import { mkdir, readdir, writeFile, lstat, open, unlink, rm, realpath } from 'node:fs/promises';
import { constants, lstatSync, unlinkSync, renameSync, readFileSync } from 'node:fs';
import { resolve, relative } from 'node:path';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { atomicWrite } from '../server/files';
import { documentEntry } from '../server/render';
import { withCommentLock } from '../server/comments';
import { assetUsage } from './usage';
import { ensureDocumentAssetAdapter } from './adapter';
import type { DocumentState } from '../shared/types';
import { prepareLogo, prepareFonts, type PreparedFile, type UploadFile } from './imports';
import {
  AssetError,
  assetHash,
  assetDirectory,
  assetRevisionPath,
  assetFile,
  safeAssetPath,
  assertAssetId,
  assertKind,
  validAssetId,
  readAssetHead,
  readAssetRevision,
  readThemeAssetDefaults,
  parseThemeAssetDefaults,
  resolveThemeAssetDefaults,
  parseDocumentAssets,
  revisionFiles,
} from './files';
import type {
  AssetKind,
  AssetRevision,
  AssetHead,
  AssetInspection,
  AssetCatalog,
  AssetSummary,
  AssetFile,
  LogoRevision,
  FontRevision,
  ThemeAssetDefaults,
  DocumentAssets,
  AssetUsage,
  LogoBinding,
  ArchivedThemeDefault,
} from '../shared/assets';
import { fontCanBeDefault } from '../shared/assets';
export { AssetError } from './files';
type Meta = {
  id?: string;
  name: string;
  description?: string;
  variationName?: string;
  variationDescription?: string;
};
export type RevisionEdit = {
  expectedRevision: string;
  name?: string;
  description?: string;
  defaultVariation?: string;
  variation?: {
    id: string;
    name?: string;
    description?: string;
  };
  removeVariation?: string;
  removeFace?: string;
};
const slug = (value: string) =>
  value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 65)
    .replace(/-$/, '') || 'asset';
function label(value: unknown, name: string, optional = false) {
  if (value === undefined && optional) return '';
  if (typeof value !== 'string' || value.length > (name.includes('name') ? 200 : 4000) || (!optional && !value.trim()))
    throw new AssetError(`Enter ${name}${name.includes('name') ? ' (up to 200 characters)' : ''}.`);
  return value.trim();
}
const defaultsRevision = (defaults: ThemeAssetDefaults) => assetHash(JSON.stringify(defaults));
function withoutContents(prepared: PreparedFile): AssetFile {
  const { contents: _, ...file } = prepared;
  return file;
}

/** Recover interrupted acquisition while preserving fresh reservations and live owners. */
function releaseAbandonedAssetLock(lock: string) {
  try {
    const before = lstatSync(lock);
    if (!before.isFile() || before.isSymbolicLink() || before.size > 128) return;
    let pid: number | undefined;
    try { pid = (JSON.parse(readFileSync(lock, 'utf8')) as { pid?: number } | null)?.pid; }
    catch (error) { if (!(error instanceof SyntaxError)) throw error; }
    if (Number.isSafeInteger(pid) && pid! > 0) {
      try { process.kill(pid!, 0); return; }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ESRCH') return; }
    } else if (Date.now() - before.mtimeMs < 30_000) return;
    const current = lstatSync(lock);
    if (current.dev === before.dev && current.ino === before.ino && current.mtimeMs === before.mtimeMs) unlinkSync(lock);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
}

/** Cross-process lock shared by app and CLI. Slow parsing happens before acquiring it. */
async function withAssets<T>(root: string, run: () => Promise<T>) {
  const runtime = resolve(root, '.opendoc');
  await mkdir(runtime, { recursive: true });
  safeAssetPath(root, runtime, true);
  const lock = resolve(runtime, 'assets.lock');
  let handle;
  const start = Date.now();
  while (!handle) {
    try {
      handle = await open(
        lock,
        constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
        0o600,
      );
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      releaseAbandonedAssetLock(lock);
      if (Date.now() - start > 5000)
        throw new AssetError('The asset library is busy. Try again when the other change finishes.', 409);
      await delay(25);
    }
  }
  try {
    await handle.writeFile(JSON.stringify({ pid: process.pid }));
    return await run();
  } finally {
    await handle.close();
    await unlink(lock).catch(() => {});
  }
}
export class AssetStore {
  constructor(
    private root: string,
    private states?: () => DocumentState[],
  ) {}
  private async folder(kind: AssetKind, id: string) {
    const path = assetDirectory(this.root, kind, id);
    for (const directory of [
      resolve(this.root, 'assets'),
      resolve(path, '..'),
      path,
      resolve(path, 'files'),
      resolve(path, 'revisions'),
    ]) {
      await mkdir(directory, { recursive: true });
      safeAssetPath(this.root, directory, true);
    }
    return path;
  }
  private async files(kind: AssetKind, id: string, files: PreparedFile[]) {
    await this.folder(kind, id);
    for (const file of files) {
      if (assetHash(file.contents) !== file.hash)
        throw new AssetError('Prepared asset bytes changed before publication.');
      const path = resolve(assetDirectory(this.root, kind, id), file.file);
      if (!/^files\/[a-f0-9]{64}\.(png|svg|ttf|otf|pdf)$/.test(file.file))
        throw new AssetError('Invalid prepared asset path.');
      try {
        await writeFile(path, file.contents, { flag: 'wx' });
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
        assetFile(this.root, kind, id, file);
      }
    }
  }
  private head(kind: AssetKind, id: string, expected?: string, allowArchived = false): AssetHead {
    const head = readAssetHead(this.root, kind, id);
    if (expected === undefined || expected !== head.revision)
      throw new AssetError('This asset changed in another window or agent. Reload it before saving.', 409);
    if (head.archived && !allowArchived) throw new AssetError('Restore this archived asset before editing it.', 409);
    if (head.builtIn && !allowArchived)
      throw new AssetError('Built-in fonts are read-only. Import a separate family to customize it.');
    return head;
  }
  private async publish(value: Omit<LogoRevision, 'revision'> | Omit<FontRevision, 'revision'>, previous?: AssetHead) {
    const revision = assetHash(JSON.stringify(value));
    const record = { ...value, revision } as AssetRevision;
    await this.folder(record.kind, record.id);
    const path = assetRevisionPath(this.root, record.kind, record.id, revision);
    try {
      await writeFile(path, JSON.stringify(record, null, 2) + '\n', { flag: 'wx' });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    }
    readAssetRevision(this.root, record.kind, record.id, revision);
    for (const file of revisionFiles(record)) assetFile(this.root, record.kind, record.id, file);
    await atomicWrite(
      resolve(assetDirectory(this.root, record.kind, record.id), 'asset.json'),
      JSON.stringify(
        { version: 1, id: record.id, kind: record.kind, revision, ...(previous?.builtIn ? { builtIn: true } : {}) },
        null,
        2,
      ) + '\n',
    );
    return record;
  }
  private async newId(kind: AssetKind, name: string, id?: string) {
    if (id) {
      assertAssetId(id);
      try {
        readAssetHead(this.root, kind, id);
        throw new AssetError(
          'That asset ID already exists. Choose another name or add a version to the existing asset.',
          409,
        );
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      }
      return id;
    }
    const base = slug(name);
    for (let n = 1; n < 10000; n++) {
      const candidate = n === 1 ? base : `${base}-${n}`;
      try {
        await lstat(resolve(assetDirectory(this.root, kind, candidate), 'asset.json'));
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return candidate;
        throw error;
      }
    }
    throw new AssetError('Choose a different asset name.');
  }
  async list(kind?: AssetKind, includeArchived = false): Promise<AssetCatalog> {
    if (kind) assertKind(kind);
    const items: AssetSummary[] = [],
      issues: string[] = [];
    for (const category of kind ? [kind] : (['logo', 'font'] as AssetKind[])) {
      const parent = resolve(this.root, 'assets', category === 'logo' ? 'logos' : 'fonts');
      let entries;
      try {
        safeAssetPath(this.root, parent, true);
        entries = await readdir(parent, { withFileTypes: true });
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue;
        issues.push((error as Error).message);
        continue;
      }
      for (const entry of entries) {
        if (!entry.isDirectory() || !validAssetId(entry.name)) continue;
        try {
          const head = readAssetHead(this.root, category, entry.name);
          if (head.archived && !includeArchived) continue;
          const asset = readAssetRevision(this.root, category, head.id, head.revision);
          let error: string | undefined;
          try {
            for (const file of revisionFiles(asset)) assetFile(this.root, category, head.id, file);
          } catch (failure) {
            error = (failure as Error).message;
          }
          items.push({
            id: head.id,
            kind: category,
            name: asset.name,
            description: asset.description,
            revision: head.revision,
            archived: !!head.archived,
            builtIn: head.builtIn,
            count: asset.kind === 'logo' ? asset.variations.length : asset.faces.length,
            ...(asset.kind === 'logo'
              ? { preview: asset.variations.find((v) => v.id === asset.defaultVariation)!.image }
              : { compatibility: asset.compatibility }),
            ...(error ? { error } : {}),
          });
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue;
          items.push({
            id: entry.name,
            kind: category,
            name: entry.name,
            description: '',
            revision: '',
            archived: false,
            count: 0,
            error: (error as Error).message,
          });
        }
      }
    }
    return { items: items.sort((a, b) => a.name.localeCompare(b.name)), issues };
  }
  async inspect(kind: AssetKind, id: string, revision?: string): Promise<AssetInspection> {
    const head = readAssetHead(this.root, kind, id);
    const asset = readAssetRevision(this.root, kind, id, revision ?? head.revision);
    const versions: AssetInspection['versions'] = [];
    for (const name of await readdir(resolve(assetDirectory(this.root, kind, id), 'revisions'))) {
      if (!/^[a-f0-9]{64}\.json$/.test(name)) continue;
      try {
        const value = readAssetRevision(this.root, kind, id, name.slice(0, -5));
        versions.push({ revision: value.revision, createdAt: value.createdAt, name: value.name });
      } catch {
        /* A malformed historical neighbor never hides valid versions. */
      }
    }
    return {
      head,
      asset,
      versions: versions.sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
      folder: relative(this.root, assetDirectory(this.root, kind, id)),
      usage: await this.usage(kind, id),
      examples:
        kind === 'logo'
          ? [
              `npx opendoc assets bind <document> logo ${id} --revision ${asset.revision}`,
              '<Logo width={120} />',
              `<Logo variation="${asset.kind === 'logo' ? asset.variations[0].id : ''}" width={120} />`,
            ]
          : [`npx opendoc assets bind <document> body-font ${id} --revision ${asset.revision}`],
    };
  }
  async createLogo(meta: Meta, file: UploadFile) {
    const name = label(meta.name, 'a logo name'),
      description = label(meta.description, 'logo guidance', true);
    const prepared = await prepareLogo(file);
    const id = await withAssets(this.root, async () => {
      const id = await this.newId('logo', name, meta.id);
      await this.files('logo', id, [prepared.original, prepared.image]);
      await this.publish({
        version: 1,
        kind: 'logo',
        id,
        name,
        description,
        createdAt: new Date().toISOString(),
        defaultVariation: 'default',
        variations: [
          {
            id: 'default',
            name: label(meta.variationName ?? 'Default', 'a variation name'),
            description: label(meta.variationDescription, 'variation guidance', true),
            original: withoutContents(prepared.original),
            image: withoutContents(prepared.image),
          },
        ],
      });
      return id;
    });
    return this.inspect('logo', id);
  }
  async createFont(
    meta: {
      id?: string;
      name?: string;
      description?: string;
    },
    files: UploadFile[],
  ) {
    const prepared = await prepareFonts(this.root, files);
    const name = label(meta.name ?? prepared.name, 'a font name'),
      description = label(meta.description ?? prepared.description, 'font guidance', true);
    const id = await withAssets(this.root, async () => {
      const id = await this.newId('font', name, meta.id);
      await this.files('font', id, [
        ...prepared.faces.map((f) => f.file),
        ...(prepared.specimen ? [prepared.specimen] : []),
      ]);
      await this.publish({
        version: 1,
        kind: 'font',
        id,
        name,
        description,
        createdAt: new Date().toISOString(),
        faces: prepared.faces.map((face) => ({ ...face, file: withoutContents(face.file) })),
        compatibility: prepared.compatibility,
        ...(prepared.specimen ? { specimen: withoutContents(prepared.specimen) } : {}),
      });
      return id;
    });
    return this.inspect('font', id);
  }
  async revise(kind: AssetKind, id: string, input: RevisionEdit) {
    if (
      !input ||
      typeof input !== 'object' ||
      Array.isArray(input) ||
      Object.keys(input).some(
        (key) =>
          ![
            'expectedRevision',
            'name',
            'description',
            'defaultVariation',
            'variation',
            'removeVariation',
            'removeFace',
          ].includes(key),
      )
    )
      throw new AssetError('Invalid asset revision fields.');
    if (
      input.variation &&
      (typeof input.variation !== 'object' ||
        Array.isArray(input.variation) ||
        Object.keys(input.variation).some((key) => !['id', 'name', 'description'].includes(key)))
    )
      throw new AssetError('Invalid variation guidance fields.');
    let changedFaces: Awaited<ReturnType<typeof prepareFonts>> | undefined;
    if (kind === 'font' && input.removeFace) {
      const current = this.head(kind, id, input.expectedRevision),
        record = readAssetRevision(this.root, kind, id, current.revision);
      if (record.kind !== 'font') throw new AssetError('Choose a font family.');
      if (!record.faces.some((face) => face.id === input.removeFace))
        throw new AssetError('The font face was not found.', 404);
      const remaining = record.faces.filter((face) => face.id !== input.removeFace);
      if (!remaining.length) throw new AssetError('Keep at least one face or archive this family.');
      changedFaces = await prepareFonts(
        this.root,
        remaining.map((face) => ({
          filename: face.file.file,
          bytes: readFileSync(assetFile(this.root, 'font', id, face.file)),
        })),
      );
    }
    await withAssets(this.root, async () => {
      const head = this.head(kind, id, input.expectedRevision);
      const old = readAssetRevision(this.root, kind, id, head.revision);
      const { revision: _, ...next } = old;
      if (input.name !== undefined) next.name = label(input.name, 'an asset name');
      if (input.description !== undefined) next.description = label(input.description, 'asset guidance', true);
      next.createdAt = new Date().toISOString();
      if (next.kind === 'logo') {
        if (input.removeFace) throw new AssetError('Choose a font family to remove a face.');
        if (input.variation) {
          const variant = next.variations.find((v) => v.id === input.variation!.id);
          if (!variant) throw new AssetError('Variation not found.', 404);
          if (input.variation.name !== undefined) variant.name = label(input.variation.name, 'a variation name');
          if (input.variation.description !== undefined)
            variant.description = label(input.variation.description, 'variation guidance', true);
        }
        if (input.removeVariation) {
          if (!next.variations.some((v) => v.id === input.removeVariation))
            throw new AssetError('The variation was not found.', 404);
          next.variations = next.variations.filter((v) => v.id !== input.removeVariation);
        }
        if (input.defaultVariation) next.defaultVariation = input.defaultVariation;
        if (!next.variations.some((v) => v.id === next.defaultVariation))
          throw new AssetError('Choose another default before removing this variation.');
      } else {
        if (input.variation || input.defaultVariation || input.removeVariation)
          throw new AssetError('Choose a logo to edit its variations.');
        if (input.removeFace) {
          next.faces = next.faces.filter((f) => f.id !== input.removeFace);
          if (!next.faces.length) throw new AssetError('Keep at least one face or archive this family.');
          next.compatibility = changedFaces!.compatibility;
          if (changedFaces!.specimen) {
            await this.files('font', id, [changedFaces!.specimen]);
            next.specimen = withoutContents(changedFaces!.specimen);
          } else delete next.specimen;
        }
      }
      await this.publish(next, head);
    });
    return this.inspect(kind, id);
  }
  async addVariation(
    id: string,
    meta: {
      expectedRevision: string;
      id?: string;
      name: string;
      description?: string;
      replaceId?: string;
    },
    file: UploadFile,
  ) {
    const name = label(meta.name, 'a variation name'),
      prepared = await prepareLogo(file);
    await withAssets(this.root, async () => {
      const head = this.head('logo', id, meta.expectedRevision),
        old = readAssetRevision(this.root, 'logo', id, head.revision);
      if (old.kind !== 'logo') throw new AssetError('Choose a logo.');
      const { revision: _, ...next } = old;
      next.createdAt = new Date().toISOString();
      let variantId = meta.replaceId ?? meta.id ?? slug(name);
      assertAssetId(variantId);
      const oldVariant = next.variations.find((v) => v.id === variantId);
      if (meta.replaceId && !oldVariant) throw new AssetError('The variation to replace was not found.', 404);
      if (!meta.replaceId && oldVariant) {
        if (meta.id) throw new AssetError('That variation ID already exists.', 409);
        variantId = `${variantId}-${randomUUID().slice(0, 6)}`;
      }
      await this.files('logo', id, [prepared.original, prepared.image]);
      const variation = {
        id: variantId,
        name,
        description: label(meta.description ?? oldVariant?.description, 'variation guidance', true),
        original: withoutContents(prepared.original),
        image: withoutContents(prepared.image),
      };
      next.variations = meta.replaceId
        ? next.variations.map((v) => (v.id === variantId ? variation : v))
        : [...next.variations, variation];
      await this.publish(next, head);
    });
    return this.inspect('logo', id);
  }
  async addFaces(
    id: string,
    meta: {
      expectedRevision: string;
    },
    files: UploadFile[],
  ) {
    const before = this.head('font', id, meta.expectedRevision),
      old = readAssetRevision(this.root, 'font', id, before.revision);
    if (old.kind !== 'font') throw new AssetError('Choose a font family.');
    const incoming = await prepareFonts(this.root, files);
    if (incoming.faces[0].family !== old.faces[0].family)
      throw new AssetError('Add faces from the same font family. Import a different family as a separate asset.');
    const keys = new Set(incoming.faces.map((f) => `${f.weight}:${f.style}`));
    const combined: UploadFile[] = [
      ...old.faces
        .filter((f) => !keys.has(`${f.weight}:${f.style}`))
        .map((face) => ({
          filename: face.file.file.split('/').pop()!,
          bytes: readFileSync(assetFile(this.root, 'font', id, face.file)),
        })),
      ...files,
    ];
    const prepared = await prepareFonts(this.root, combined);
    await withAssets(this.root, async () => {
      const head = this.head('font', id, meta.expectedRevision);
      await this.files('font', id, [
        ...prepared.faces.map((f) => f.file),
        ...(prepared.specimen ? [prepared.specimen] : []),
      ]);
      await this.publish(
        {
          version: 1,
          kind: 'font',
          id,
          name: old.name,
          description: old.description,
          createdAt: new Date().toISOString(),
          faces: prepared.faces.map((face) => ({
            ...face,
            id: old.faces.find((f) => f.weight === face.weight && f.style === face.style)?.id ?? face.id,
            file: withoutContents(face.file),
          })),
          compatibility: prepared.compatibility,
          ...(prepared.specimen ? { specimen: withoutContents(prepared.specimen) } : {}),
        },
        head,
      );
    });
    return this.inspect('font', id);
  }
  async defaults(themeId: string) {
    assertAssetId(themeId);
    try {
      safeAssetPath(this.root, resolve(this.root, 'themes', themeId, 'index.ts'));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT')
        throw new AssetError(`Theme ${themeId} was not found. Choose an available theme.`, 404);
      throw error;
    }
    const defaults = readThemeAssetDefaults(this.root, themeId);
    return { defaults, revision: defaultsRevision(defaults) };
  }
  private validateDefaults(defaults: ThemeAssetDefaults) {
    const parsed = parseThemeAssetDefaults(defaults);
    resolveThemeAssetDefaults(this.root, parsed);
    return parsed;
  }
  async setDefaults(themeId: string, defaults: ThemeAssetDefaults, expectedRevision: string) {
    assertAssetId(themeId);
    await withAssets(this.root, async () => {
      safeAssetPath(this.root, resolve(this.root, 'themes', themeId), true);
      const before = await this.defaults(themeId);
      if (before.revision !== expectedRevision)
        throw new AssetError('These theme defaults changed. Reload them before saving.', 409);
      await atomicWrite(
        resolve(this.root, 'themes', themeId, 'assets.json'),
        JSON.stringify(this.validateDefaults(defaults), null, 2) + '\n',
      );
    });
    return this.defaults(themeId);
  }
  async archive(kind: AssetKind, id: string, expectedRevision: string, clearDefaults = false) {
    await withAssets(this.root, async () => {
      const head = this.head(kind, id, expectedRevision, true);
      if (head.builtIn) throw new AssetError('Built-in fonts stay available.');
      if (head.archived) return;
      const affected: ArchivedThemeDefault[] = [];
      for (const theme of await this.themeIds()) {
        const defaults = readThemeAssetDefaults(this.root, theme),
          next = structuredClone(defaults);
        if (kind === 'logo' && next.logo?.id === id) delete next.logo;
        if (kind === 'font') {
          if (next.bodyFont === id) delete next.bodyFont;
          if (next.headingFont === id) delete next.headingFont;
        }
        if (JSON.stringify(next) !== JSON.stringify(defaults))
          affected.push({ id: theme, defaults, cleared: defaultsRevision(next) });
      }
      if (affected.length && !clearDefaults)
        throw new AssetError('This asset is a theme default. Confirm clearing those defaults when archiving.', 409);
      const written: ArchivedThemeDefault[] = [];
      try {
        for (const item of affected) {
          const next = structuredClone(item.defaults);
          if (kind === 'logo') delete next.logo;
          else {
            if (next.bodyFont === id) delete next.bodyFont;
            if (next.headingFont === id) delete next.headingFont;
          }
          await atomicWrite(resolve(this.root, 'themes', item.id, 'assets.json'), JSON.stringify(next, null, 2) + '\n');
          written.push(item);
        }
        await atomicWrite(
          resolve(assetDirectory(this.root, kind, id), 'asset.json'),
          JSON.stringify({ ...head, archived: true, archivedDefaults: affected }, null, 2) + '\n',
        );
      } catch (error) {
        for (const item of written)
          await atomicWrite(
            resolve(this.root, 'themes', item.id, 'assets.json'),
            JSON.stringify(item.defaults, null, 2) + '\n',
          );
        throw error;
      }
    });
    return this.inspect(kind, id);
  }
  async restore(kind: AssetKind, id: string, expectedRevision: string) {
    await withAssets(this.root, async () => {
      const head = this.head(kind, id, expectedRevision, true);
      if (!head.archived) return;
      for (const item of head.archivedDefaults ?? []) {
        let current;
        try { current = await this.defaults(item.id); }
        catch (error) {
          // A deleted theme is no longer an undo target; restoring an asset must
          // never recreate that theme or strand an otherwise valid asset.
          if (error instanceof AssetError && error.status === 404) continue;
          throw error;
        }
        if (current.revision === item.cleared)
          await atomicWrite(
            resolve(this.root, 'themes', item.id, 'assets.json'),
            JSON.stringify(item.defaults, null, 2) + '\n',
          );
      }
      const { archivedDefaults: _, archived: __, ...restored } = head;
      await atomicWrite(
        resolve(assetDirectory(this.root, kind, id), 'asset.json'),
        JSON.stringify(restored, null, 2) + '\n',
      );
    });
    return this.inspect(kind, id);
  }
  /** Serialize against document deletion and detect file-first edits before publication. */
  private async changeBindings(documentId: string, change: (bindings: DocumentAssets) => boolean | Promise<boolean>) {
    const root = await realpath(this.root);
    const entry = await documentEntry(root, documentId),
      folder = resolve(entry, '..');
    const originalFolder = await lstat(folder);
    const changed = () =>
      new AssetError(
        'This document or its asset choices changed in another window or agent. Reload it before saving. Nothing was overwritten.',
        409,
      );
    const verifyFolder = () => {
      try {
        safeAssetPath(root, folder, true);
        safeAssetPath(root, entry);
        const info = lstatSync(folder);
        if (info.dev !== originalFolder.dev || info.ino !== originalFolder.ino) throw changed();
      } catch {
        throw changed();
      }
    };
    const file = resolve(folder, 'assets.json');
    const snapshot = () => {
      try {
        safeAssetPath(root, file);
        const info = lstatSync(file);
        if (info.size > 256000) throw new AssetError('Document asset metadata is too large.');
        return { text: readFileSync(file, 'utf8'), dev: info.dev, ino: info.ino };
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
        throw error;
      }
    };
    return withCommentLock(root, documentId, () =>
      withAssets(root, async () => {
        verifyFolder();
        let expected = snapshot();
        const bindings = expected ? parseDocumentAssets(JSON.parse(expected.text)) : ({ version: 1 } as DocumentAssets);
        const adapt = await change(bindings);
        if (adapt) {
          const prepared = await ensureDocumentAssetAdapter(root, documentId);
          // A first legacy upgrade creates only this known empty manifest. Any
          // different bytes belong to another writer and must win the conflict.
          if (!expected && prepared.changed) {
            const created = snapshot();
            if (!created || created.text !== '{"version":1}\n') throw changed();
            expected = created;
          }
        }
        const pending = resolve(folder, `.assets-${randomUUID()}.tmp`);
        try {
          // Never mkdir a document here: deletion must not resurrect a partial folder.
          await writeFile(pending, JSON.stringify(bindings, null, 2) + '\n', { flag: 'wx' });
          verifyFolder();
          const current = snapshot();
          if (
            !!current !== !!expected ||
            (current &&
              expected &&
              (current.dev !== expected.dev || current.ino !== expected.ino || current.text !== expected.text))
          )
            throw changed();
          // Match the text-edit commit path: no awaits between final checks and rename.
          renameSync(pending, file);
          return bindings;
        } finally {
          await rm(pending, { force: true }).catch(() => {});
        }
      }),
    );
  }
  async bind(
    documentId: string,
    role: 'logo' | 'body-font' | 'heading-font',
    assetId: string,
    options: {
      revision?: string;
      variation?: string;
      name?: string;
    } = {},
  ) {
    if (!['logo', 'body-font', 'heading-font'].includes(role))
      throw new AssetError('Choose logo, body-font, or heading-font.');
    return this.changeBindings(documentId, (bindings) => {
      const kind = role === 'logo' ? 'logo' : 'font',
        head = readAssetHead(this.root, kind, assetId);
      if (head.archived) throw new AssetError('Restore this asset before adding it to a document.');
      const record = readAssetRevision(this.root, kind, assetId, options.revision ?? head.revision);
      for (const file of revisionFiles(record)) assetFile(this.root, kind, assetId, file);
      if (record.kind === 'font' && !fontCanBeDefault(record))
        throw new AssetError('This family is not ready for body or heading text.');
      const pin: LogoBinding = { id: assetId, revision: record.revision };
      if (options.variation) {
        if (record.kind !== 'logo' || !record.variations.some((v) => v.id === options.variation))
          throw new AssetError('Choose an existing logo variation.');
        pin.variation = options.variation;
      }
      if (role === 'logo') {
        if (options.name) {
          assertAssetId(options.name);
          bindings.logos = { ...bindings.logos, [options.name]: pin };
        } else bindings.logo = pin;
      } else bindings[role === 'body-font' ? 'bodyFont' : 'headingFont'] = pin;
      return role !== 'logo';
    });
  }
  async unbind(documentId: string, role: 'logo' | 'body-font' | 'heading-font', name?: string) {
    if (!['logo', 'body-font', 'heading-font'].includes(role))
      throw new AssetError('Choose logo, body-font, or heading-font.');
    return this.changeBindings(documentId, (bindings) => {
      const adapt = !!(
        (role === 'body-font' && bindings.bodyFont) ||
        (role === 'heading-font' && bindings.headingFont)
      );
      if (role === 'logo') {
        if (name) {
          assertAssetId(name);
          if (bindings.logos) delete bindings.logos[name];
        } else delete bindings.logo;
      } else if (role === 'body-font') delete bindings.bodyFont;
      else delete bindings.headingFont;
      return adapt;
    });
  }
  private async themeIds() {
    try {
      return (await readdir(resolve(this.root, 'themes'), { withFileTypes: true }))
        .filter((e) => e.isDirectory() && validAssetId(e.name))
        .map((e) => e.name);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw error;
    }
  }
  async usage(kind: AssetKind, id: string): Promise<AssetUsage> {
    return assetUsage(this.root, kind, id, this.states?.());
  }
}
