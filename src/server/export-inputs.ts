import { readdir, realpath, stat } from 'node:fs/promises';
import { readdirSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { documentDependencies, isManagedAssetPath, isThemeAssetDefaultsPath } from './dependencies';
import { documentEntry } from './render';
import { ExportChangedError } from './export-file';

type Stamp = { size: bigint; mtimeNs: bigint; ctimeNs: bigint; ino: bigint };
const signature = (value: Stamp) => `${value.size}:${value.mtimeNs}:${value.ctimeNs}:${value.ino}`;

const sharedCompanions = ['templates', 'themes', 'assets'];

/** Capture local inputs before rendering; the final check stays synchronous with publication. */
export async function captureExportInputs(root: string, id: string): Promise<() => boolean> {
  return captureEntryExportInputs(root, await documentEntry(root, id), [`documents/${id}`, ...sharedCompanions]);
}

/** Specimens include transient defaults, while authored documents include only their exact pins. */
export async function captureEntryExportInputs(root: string, entry: string, companionFolders: string[] = sharedCompanions): Promise<() => boolean> {
  const entryBefore = signature(await stat(entry, { bigint: true }));
  const dependencies = await documentDependencies(root, entry);
  const inputs = new Map<string, { stamp: string; directory: boolean; missing?: boolean; emptyWhenMissing?: boolean }>();
  const visited = new Set<string>();
  const included = (parent: string, name: string) => name !== 'comments.json' && !name.startsWith('.forme-render-') && !name.endsWith('.tmp')
    && (dependencies.readsFiles || (!isManagedAssetPath(root, resolve(parent, name)) && !isThemeAssetDefaultsPath(root, resolve(parent, name))));
  async function collect(path: string) {
    // A newly created managed logo container is equivalent to an empty catalog;
    // loose legacy artwork in that container remains a conservative shared input.
    const emptyWhenMissing = !dependencies.readsFiles && path === resolve(root, 'assets/logos');
    let info;
    try { info = await stat(path, { bigint: true }); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      inputs.set(path, emptyWhenMissing ? { stamp: '[]', directory: true, emptyWhenMissing: true } : { stamp: '', directory: false, missing: true }); return;
    }
    if (!info.isDirectory()) { inputs.set(path, { stamp: signature(info), directory: false }); return; }
    const children = (await readdir(path)).filter(name => included(path, name)).sort();
    inputs.set(path, { stamp: JSON.stringify(children), directory: true, ...(emptyWhenMissing ? { emptyWhenMissing: true } : {}) });
    const actual = await realpath(path);
    if (visited.has(actual)) return;
    visited.add(actual);
    for (const child of children) await collect(resolve(path, child));
  }
  // Explicit dependencies bypass broad-library exclusions, including paths currently absent.
  for (const path of dependencies.files) await collect(path);
  for (const folder of [...new Set([...companionFolders, ...(dependencies.readsFiles ? ['documents'] : [])])]) await collect(resolve(root, folder));
  if (!dependencies.readsFiles && companionFolders.some(folder => ['assets', 'assets/logos'].includes(folder))) await collect(resolve(root, 'assets/logos'));
  const unchanged = () => {
    try {
      return [...inputs].every(([file, input]) => {
        if (input.missing) {
          try { statSync(file); return false; } catch (error) { return (error as NodeJS.ErrnoException).code === 'ENOENT'; }
        }
        if (input.emptyWhenMissing) {
          try { return JSON.stringify(readdirSync(file).filter(name => included(file, name)).sort()) === input.stamp; }
          catch (error) { return (error as NodeJS.ErrnoException).code === 'ENOENT' && input.stamp === '[]'; }
        }
        return (input.directory
          ? JSON.stringify(readdirSync(file).filter(name => included(file, name)).sort())
          : signature(statSync(file, { bigint: true }))) === input.stamp;
      });
    } catch { return false; }
  };
  if (signature(await stat(entry, { bigint: true })) !== entryBefore || !unchanged()) throw new ExportChangedError();
  return unchanged;
}
