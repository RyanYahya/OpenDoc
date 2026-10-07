import { link, lstat, mkdir, mkdtemp, readFile, readdir, realpath, rm, rmdir, unlink, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { withWorkspaceLock } from '../cli/lock';
import { checkWorkspace } from '../cli/check';
import { applicationRoot } from '../runtime/paths';
import { runningSession } from '../cli/start';
import { isStableVersion, packageMetadata } from '../cli/workspace';
import { readAssetHead, readAssetRevision, revisionFiles, assetFile } from '../assets/files';
import { limits, readArchive, writeArchive } from './archive';
import { collectPack } from './collect';
import { exists, localPath, readLocal, writeSnapshot } from './files';
import { compatiblePack, digest, itemFolder, previewPath, validPackId, verifyPack, type PackItem, type PackManifest } from './manifest';

export async function readPack(file: string) {
  const info = await lstat(file);
  if (!info.isFile() || info.size > limits.archive) throw new Error('Choose an ordinary OpenDoc ZIP file of at most 64 MiB.');
  const bytes = await readFile(file), files = readArchive(bytes), manifest = verifyPack(files);
  return { files, manifest, sha256: digest(bytes) };
}

/** Typecheck the whole captured design, including starters and helpers outside the preview graph. */
async function checkSnapshot(root: string) {
  const preset = JSON.parse(await readFile(resolve(applicationRoot, 'tsconfig.workspace.json'), 'utf8'));
  const runtime = JSON.parse(await readFile(resolve(applicationRoot, 'package.json'), 'utf8'));
  const paths: Record<string, string[]> = { ...preset.compilerOptions.paths };
  for (const [name, file] of Object.entries(runtime.exports)) {
    if (typeof file === 'string') paths[name === '.' ? 'opendoc' : `opendoc/${name.slice(2)}`] = [resolve(applicationRoot, file)];
  }
  await writeFile(resolve(root, 'tsconfig.json'), JSON.stringify({
    extends: resolve(applicationRoot, 'tsconfig.workspace.json'),
    compilerOptions: { baseUrl: applicationRoot, paths }, include: ['themes', 'templates'],
  }), { flag: 'wx' });
  try { await checkWorkspace(root, true, true); }
  finally { await unlink(resolve(root, 'tsconfig.json')); } // Type-only aliases must not affect the render worker.
}

/** This is the only step that executes design code. Inspection and conflict planning never call it. */
async function renderPreviews(root: string, items: PackItem[]) {
  const { ThemeCatalog } = await import('../server/themes');
  const { TemplateCatalog } = await import('../server/templates');
  const { RenderFailure } = await import('../server/render-error');
  const themes = new ThemeCatalog(root), templates = new TemplateCatalog(root);
  const files = new Map<string, Buffer>();
  const previews: { path: string; pages: number }[] = [];
  try {
    for (const item of items.filter(item => item.selected)) {
      const catalog = item.kind === 'theme' ? themes : templates;
      const preview = await catalog.preview(item.id);
      if (!preview.artifact) throw new RenderFailure(`${item.kind} ${item.id}: ${preview.error ?? 'Preview failed.'}`, preview.issues);
      const path = previewPath(item);
      files.set(path, await catalog.pdf(item.id, preview.artifact.hash));
      previews.push({ path, pages: preview.artifact.pages.length });
    }
    return { files, previews };
  } finally { await themes.close(); await templates.close(); }
}

export type ExportPackOptions = {
  themes?: string[]; templates?: string[]; include?: string[]; id?: string; name?: string;
  version?: string; author?: string; license?: string; output?: string;
};
export async function exportPack(root: string, options: ExportPackOptions) {
  root = await realpath(root);
  const selected = [...(options.themes ?? []).map(id => ({ kind: 'theme' as const, id })), ...(options.templates ?? []).map(id => ({ kind: 'template' as const, id }))];
  if (options.id !== undefined && !validPackId(options.id)) throw new Error('Choose a short lowercase pack ID with single hyphens.');
  if (options.version !== undefined && !isStableVersion(options.version)) throw new Error('Choose an exact stable pack version, such as 1.0.0.');
  if (!selected.length) throw new Error('Choose at least one --theme or --template to share.');
  const output = options.output ? resolve(options.output) : resolve(root, 'output/packs', `${options.id ?? selected[0].id}-${options.version ?? '1.0.0'}.opendoc.zip`);
  if (await exists(output)) throw new Error(`Pack output already exists (EEXIST): ${output}. Choose a new output path or pack version.`);
  const collected = await collectPack(root, selected, options.include);
  const opendocVersion = (await packageMetadata()).version;
  const manifest: PackManifest = {
    format: 'opendoc-pack', schemaVersion: 1, id: options.id ?? selected[0].id,
    name: options.name ?? options.id ?? selected[0].id, version: options.version ?? '1.0.0', opendocVersion,
    ...(options.author ? { author: options.author } : {}), ...(options.license ? { license: options.license } : {}),
    items: collected.items, assets: collected.assets, files: [],
  };
  const stage = await mkdtemp(resolve(tmpdir(), 'opendoc-pack-export-'));
  try {
    await writeSnapshot(stage, collected.files);
    await checkSnapshot(stage);
    const rendered = await renderPreviews(stage, manifest.items);
    for (const [path, bytes] of collected.files) if (!(await readLocal(stage, path)).equals(bytes)) throw new Error(`Preview changed pack source: ${path}.`);
    const files = new Map([...collected.files, ...rendered.files]);
    manifest.files = [...files].sort(([a], [b]) => a.localeCompare(b, 'en')).map(([path, bytes]) => ({ path, bytes: bytes.length, sha256: digest(bytes) }));
    files.set('manifest.json', Buffer.from(JSON.stringify(manifest, null, 2) + '\n'));
    verifyPack(files);
    const archive = writeArchive(files);
    // Rendering happens against the captured source. Do not publish if that source changed meanwhile.
    for (const [path, bytes] of collected.files) if (!(await readLocal(root, path)).equals(bytes)) throw new Error(`Pack dependency changed while exporting: ${path}. Retry after edits finish.`);
    // New files in an item could be dependencies too; compare a fresh closed collection.
    const current = await collectPack(root, selected, options.include);
    if (current.files.size !== collected.files.size || [...current.files].some(([path, bytes]) => !collected.files.get(path)?.equals(bytes))) throw new Error('Pack dependencies changed while exporting. Retry after edits finish.');
    await mkdir(dirname(output), { recursive: true });
    const publication = await mkdtemp(resolve(dirname(output), '.opendoc-pack-'));
    try {
      const pending = resolve(publication, 'pack.zip');
      await writeFile(pending, archive, { flag: 'wx' });
      await link(pending, output);
    } finally { await rm(publication, { recursive: true, force: true }); }
    return { output, sha256: digest(archive), manifest, previews: rendered.previews, visualReview: 'required' as const };
  } finally { await rm(stage, { recursive: true, force: true }); }
}

export type InstallPlan = { compatible: boolean; requiredVersion: string; currentVersion: string; added: string[]; reused: string[]; conflicts: string[] };
export async function planInstall(root: string, pack: Awaited<ReturnType<typeof readPack>>, version = undefined as string | undefined): Promise<InstallPlan> {
  const { manifest, files } = pack;
  const currentVersion = version ?? (await packageMetadata()).version;
  const plan: InstallPlan = { compatible: compatiblePack(manifest, currentVersion), requiredVersion: manifest.opendocVersion, currentVersion, added: [], reused: [], conflicts: [] };
  for (const entry of manifest.files.filter(entry => !entry.path.startsWith('previews/'))) {
    const path = await localPath(root, entry.path, true), info = await exists(path);
    if (!info) plan.added.push(entry.path);
    else if (info.isFile() && info.size === entry.bytes && (await readLocal(root, entry.path)).equals(files.get(entry.path)!)) plan.reused.push(entry.path);
    else plan.conflicts.push(entry.path);
  }
  // An existing ID is reusable only as a whole. Never complete or overlay a different design.
  for (const item of manifest.items) {
    const folder = itemFolder(item), location = await localPath(root, folder, true);
    const info = await exists(location);
    if (!info) continue;
    if (!info.isDirectory()) { plan.conflicts.push(folder); continue; }
    const expected = new Set(manifest.files.filter(entry => entry.path.startsWith(folder + '/')).map(entry => entry.path));
    async function check(directory: string) {
      for (const entry of await readdir(resolve(root, directory), { withFileTypes: true })) {
        if (entry.name.startsWith('.') || ['comments.json', 'node_modules', 'output'].includes(entry.name)) continue;
        const path = `${directory}/${entry.name}`;
        if (entry.isDirectory()) await check(path);
        else if (!expected.has(path)) plan.conflicts.push(path);
      }
    }
    await check(folder);
    if (plan.added.some(path => path.startsWith(folder + '/'))) plan.conflicts.push(`${folder} (existing ID has different contents)`);
  }
  plan.conflicts = [...new Set(plan.conflicts)].sort();
  return plan;
}

async function validateSnapshot(root: string, manifest: PackManifest) {
  for (const asset of manifest.assets) {
    const head = readAssetHead(root, asset.kind, asset.id);
    if (head.revision !== asset.revision || head.archived) throw new Error(`Pack asset pointer does not match its pinned revision: ${asset.id}.`);
    for (const file of revisionFiles(readAssetRevision(root, asset.kind, asset.id, asset.revision))) assetFile(root, asset.kind, asset.id, file);
  }
  const selection = manifest.items.filter(item => item.selected);
  const collected = await collectPack(root, selection, manifest.files.filter(file => !file.path.startsWith('previews/')).map(file => file.path));
  const included = new Set(manifest.files.map(file => file.path));
  for (const path of collected.files.keys()) if (!included.has(path)) throw new Error(`Pack is missing a required dependency: ${path}.`);
  for (const item of collected.items) if (!manifest.items.some(candidate => candidate.kind === item.kind && candidate.id === item.id)) throw new Error(`Pack has an undeclared catalog item: ${itemFolder(item)}.`);
  for (const asset of collected.assets) if (!manifest.assets.some(candidate => candidate.kind === asset.kind && candidate.id === asset.id && candidate.revision === asset.revision)) throw new Error(`Pack has an undeclared asset revision: ${asset.id}.`);
}

export async function installPack(root: string, file: string, options: { trust?: boolean; dryRun?: boolean } = {}) {
  root = await realpath(root);
  const pack = await readPack(file);
  if (options.dryRun) return { installed: false, manifest: pack.manifest, plan: await planInstall(root, pack) };
  if (!options.trust) throw new Error('Themes and templates execute TypeScript when OpenDoc loads or renders them. Inspect this pack first; use --trust only for a source you trust.');
  const control = await exists(resolve(root, '.opendoc'));
  if (control && (!control.isDirectory() || control.isSymbolicLink())) throw new Error('OpenDoc needs an ordinary .opendoc directory for installation.');
  return withWorkspaceLock(root, async () => {
    if ((await packageMetadata()).opendoc?.edition !== 'headless' && await runningSession(root)) throw new Error('Stop OpenDoc with Ctrl+C before installing a pack, then restart with npx opendoc start. This keeps partially installed source out of the running catalog.');
    let plan = await planInstall(root, pack);
    const assertReady = () => {
      if (!plan.compatible) throw new Error(`This pack requires OpenDoc ${plan.requiredVersion} or a newer patch in the same major.minor line; installed: ${plan.currentVersion}.`);
      if (plan.conflicts.length) throw new Error(`Pack conflicts with existing files; nothing was installed:\n${plan.conflicts.join('\n')}\nUse another workspace, or ask the author to export with distinct design IDs. Existing designs are never overwritten.`);
    };
    assertReady();
    if (!plan.added.length) return { installed: false, alreadyInstalled: true, manifest: pack.manifest, plan };
    // Stage on the destination volume so exclusive hard-link publication cannot cross devices.
    const stage = await mkdtemp(resolve(root, '.opendoc/pack-stage-'));
    const added: { path: string; ino: number; dev: number; hash: string }[] = [], directories: string[] = [];
    try {
      const payload = new Map([...pack.files].filter(([path]) => path !== 'manifest.json' && !path.startsWith('previews/')));
      await writeSnapshot(stage, payload);
      await validateSnapshot(stage, pack.manifest);
      await checkSnapshot(stage);
      await renderPreviews(stage, pack.manifest.items);
      for (const [path, bytes] of payload) if (!(await readLocal(stage, path)).equals(bytes)) throw new Error(`Preview changed pack source: ${path}.`);
      // Catch edits made during verification, before publishing any files.
      plan = await planInstall(root, pack); assertReady();
      for (const path of plan.added) {
        await localPath(root, path, true);
        const parts = path.split('/'); parts.pop();
        let parent = root;
        for (const part of parts) {
          parent = resolve(parent, part);
          try { await mkdir(parent); directories.push(parent); }
          catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error; }
          const info = await lstat(parent);
          if (!info.isDirectory() || info.isSymbolicLink()) throw new Error(`Destination changed during installation: ${path}.`);
        }
        const target = resolve(root, path), source = resolve(stage, path), info = await lstat(source);
        await link(source, target); // Fails if another writer created the destination; never replaces it.
        added.push({ path: target, ino: info.ino, dev: info.dev, hash: digest(payload.get(path)!) });
      }
      for (const [path, bytes] of payload) if (!(await readLocal(root, path)).equals(bytes)) throw new Error(`Destination changed during installation: ${path}.`);
      return { installed: true, manifest: pack.manifest, plan, verified: 'Catalog previews rendered from the installed source snapshot.', visualReview: 'required' as const };
    } catch (error) {
      const preserved: string[] = [];
      for (const entry of added.reverse()) {
        try {
          const current = await exists(entry.path);
          if (!current) continue;
          if (current.isFile() && current.ino === entry.ino && current.dev === entry.dev && digest(await readFile(entry.path)) === entry.hash) await unlink(entry.path);
          else preserved.push(entry.path);
        } catch { preserved.push(entry.path); }
      }
      for (const directory of directories.reverse()) await rmdir(directory).catch(() => {}); // Preserve anything another writer added.
      if (preserved.length) throw new Error(`${error instanceof Error ? error.message : String(error)}\nRollback preserved changed or inaccessible files; inspect these paths before retrying:\n${preserved.join('\n')}`, { cause: error });
      throw error;
    } finally { await rm(stage, { recursive: true, force: true }); }
  });
}
