import { readFile, realpath, stat } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { applicationRoot } from '../runtime/paths';

export const workspaceFormat = 1;
export type Edition = 'normal' | 'headless';
export const packageNames = { normal: '@ryanyahya/opendoc', headless: '@ryanyahya/opendoc-headless' } as const;
export type PackageIdentity = { name: typeof packageNames[Edition]; version: string; edition: Edition };
export type PackageMetadata = { name: string; version: string; bin?: string | Record<string, string>; dependencies?: Record<string, string>; opendoc?: { edition?: unknown } };
export type WorkspaceMarker = { formatVersion: number; createdWith?: string; edition?: Edition };

export function isStableVersion(value: unknown): boolean {
  if (typeof value !== 'string' || !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(value)) return false;
  return value.split('.').every(part => Number.isSafeInteger(Number(part)));
}

/** Published packages declare their edition and must match its exact registry identity. */
export function packageIdentity(metadata: PackageMetadata): PackageIdentity {
  if (!metadata || typeof metadata !== 'object') throw new Error('The OpenDoc package has invalid metadata. Reinstall the intended OpenDoc edition.');
  const edition = metadata.opendoc?.edition;
  const name = edition === 'normal' || edition === 'headless' ? packageNames[edition] : undefined;
  if (!name || metadata.name !== name || !isStableVersion(metadata.version)) throw new Error('The OpenDoc package has an invalid name, edition, or exact stable version. Reinstall the intended OpenDoc edition.');
  return { name, version: metadata.version, edition: edition as Edition };
}

/** Both editions install under the opendoc key so authored imports remain portable. */
export function dependencyPin(identity: Pick<PackageIdentity, 'edition' | 'version'>) {
  if (!isStableVersion(identity.version)) throw new Error('OpenDoc requires an exact stable version.');
  return `npm:${packageNames[identity.edition]}@${identity.version}`;
}

export function workspaceIdentity(metadata: Pick<PackageMetadata, 'dependencies'>, marker?: WorkspaceMarker): PackageIdentity {
  const pin = metadata?.dependencies?.opendoc;
  let identity: PackageIdentity | undefined;
  for (const edition of ['normal', 'headless'] as const) {
    const name = packageNames[edition], prefix = `npm:${name}@`;
    if (typeof pin === 'string' && pin.startsWith(prefix) && isStableVersion(pin.slice(prefix.length))) {
      identity = { name, version: pin.slice(prefix.length), edition };
      break;
    }
  }
  if (!identity) throw new Error(`The workspace must pin dependencies.opendoc to an exact stable version alias: npm:${packageNames.normal}@<exact-version> or npm:${packageNames.headless}@<exact-version>.`);
  if (marker?.edition && marker.edition !== identity.edition) throw new Error('The workspace edition does not match its pinned OpenDoc dependency. Restore its original edition before continuing; edition switching is not an update.');
  return identity;
}

export async function readWorkspaceMarker(root: string): Promise<WorkspaceMarker> {
  let marker: WorkspaceMarker;
  try { marker = JSON.parse(await readFile(resolve(root, '.opendoc/workspace.json'), 'utf8')); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') throw new Error(`This is not an initialized OpenDoc workspace: ${root}\nInitialize a new folder with the intended OpenDoc edition, or select an existing initialized workspace.`);
    throw new Error(`Cannot read the workspace format in ${root}: ${(error as Error).message}`);
  }
  if (!marker || marker.formatVersion !== workspaceFormat) throw new Error(`Unsupported OpenDoc workspace format ${marker?.formatVersion ?? '(missing)'}. This runtime supports format ${workspaceFormat}. No files were changed.`);
  if (marker.edition !== undefined && !['normal', 'headless'].includes(marker.edition)) throw new Error('Unsupported OpenDoc workspace edition. No files were changed.');
  return marker;
}

export async function discoverWorkspace(start = process.cwd()): Promise<string | null> {
  let root = resolve(start);
  for (;;) {
    try { await stat(resolve(root, '.opendoc/workspace.json')); await readWorkspaceMarker(root); return await realpath(root); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    const parent = dirname(root);
    if (parent === root) return null;
    root = parent;
  }
}

export async function explicitWorkspace(path: string) {
  const root = await realpath(resolve(path));
  await readWorkspaceMarker(root);
  return root;
}

export async function packageMetadata(root = applicationRoot): Promise<PackageMetadata> {
  return JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'));
}

export async function installedApplication(root: string) {
  const app = resolve(root, 'node_modules/opendoc');
  let installed;
  try { installed = await packageMetadata(app); }
  catch { throw new Error(`OpenDoc is not installed in ${root}. Run npm install in that folder, then npx opendoc check.`); }
  const manifest = await packageMetadata(root);
  const expected = workspaceIdentity(manifest, await readWorkspaceMarker(root));
  const mismatch = `The workspace's pinned OpenDoc version or edition does not match its installation. Run npm install in ${root} to repair it.`;
  let identity;
  try { identity = packageIdentity(installed); } catch { throw new Error(mismatch); }
  if (identity.name !== expected.name || identity.version !== expected.version || identity.edition !== expected.edition) {
    throw new Error(mismatch);
  }
  return await realpath(app);
}
