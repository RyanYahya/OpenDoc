import { execFile } from 'node:child_process';
import { copyFile, link, lstat, mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { withWorkspaceLock } from './lock.js';
import { dependencyPin, isStableVersion, packageIdentity, packageMetadata, readWorkspaceMarker, workspaceIdentity, type PackageIdentity } from './workspace.js';

interface Version { major: number; minor: number; patch: number }
interface UpdateOptions { check?: boolean; version?: string }
export interface UpdateResult {
  status: 'up-to-date' | 'available' | 'updated';
  currentVersion: string;
  targetVersion: string;
  latestCompatibleVersion: string;
  latestVersion: string;
  check: boolean;
  explicit: boolean;
  cleanupWarning?: string;
}
export interface UpdateDependencies {
  npm?: (args: string[], cwd: string) => Promise<string>;
  beforeActivate?: (stage: string) => Promise<void>;
  afterActivationStep?: (step: 'dependencies' | 'manifest' | 'lockfile') => Promise<void>;
}

function versionParts(value: string): Version | null {
  if (!isStableVersion(value)) return null;
  const [major, minor, patch] = value.split('.').map(Number);
  return { major, minor, patch };
}

function compareVersions(a: string, b: string): number {
  const left = versionParts(a)!, right = versionParts(b)!;
  return left.major - right.major || left.minor - right.minor || left.patch - right.patch;
}

/** npm caret compatibility: 0.x stays in its minor, and 0.0.x stays exact. */
export function latestCompatibleVersion(current: string, versions: string[]): string {
  const base = versionParts(current);
  if (!base) throw new Error('The installed OpenDoc dependency must be an exact stable version (for example, "0.3.1").');
  return versions.filter(value => {
    const candidate = versionParts(value);
    if (!candidate || compareVersions(value, current) < 0 || candidate.major !== base.major) return false;
    if (base.major > 0) return true;
    return candidate.minor === base.minor && (base.minor > 0 || candidate.patch === base.patch);
  }).sort(compareVersions).at(-1) ?? current;
}

function command(file: string, args: string[], cwd: string): Promise<string> {
  return new Promise((accept, reject) => {
    execFile(file, args, { cwd, encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) {
        const detail = stderr.trim() || error.message;
        reject(new Error(`${file === process.execPath ? 'Candidate OpenDoc verification' : 'npm'} failed: ${detail}`));
      } else accept(stdout);
    });
  });
}

async function optionalBytes(path: string): Promise<Buffer | null> {
  try { return await readFile(path); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw error; }
}

async function assertRegularFile(path: string) {
  try {
    if (!(await lstat(path)).isFile()) throw new Error(`Update requires a regular ${path.endsWith('package-lock.json') ? 'package-lock.json' : 'package.json'} file.`);
  } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
}

const stopInstruction = 'Stop OpenDoc with Ctrl+C in its terminal, run the update again, then restart with npx opendoc start.';

async function assertServerStopped(root: string) {
  const bytes = await optionalBytes(join(root, '.opendoc/server.json'));
  if (!bytes) return;
  let session: { origin?: unknown; token?: unknown; pid?: unknown };
  try { session = JSON.parse(bytes.toString('utf8')); }
  catch { throw new Error(`The local OpenDoc session record is invalid. ${stopInstruction}`); }
  const origin = session?.origin;
  if (typeof origin !== 'string' || !/^http:\/\/127\.0\.0\.1:\d+$/.test(origin)
    || Number(origin.slice(origin.lastIndexOf(':') + 1)) < 1 || Number(origin.slice(origin.lastIndexOf(':') + 1)) > 65535
    || typeof session.token !== 'string' || !session.token
    || typeof session.pid !== 'number' || !Number.isSafeInteger(session.pid) || session.pid < 1 || session.pid > 2 ** 31 - 1) {
    throw new Error(`The local OpenDoc session record is invalid. ${stopInstruction}`);
  }
  let response: Response;
  try { response = await fetch(`${origin}/api/session`, { signal: AbortSignal.timeout(1500), redirect: 'error' }); }
  catch (error) {
    if ((error as { cause?: { code?: string } }).cause?.code === 'ECONNREFUSED') {
      // Shutdown closes the listener before draining pending document writes.
      try { process.kill(session.pid, 0); }
      catch (pidError) { if ((pidError as NodeJS.ErrnoException).code === 'ESRCH') return; }
      throw new Error(`The recorded OpenDoc process is still running or finishing shutdown. Wait for its terminal process to exit completely before updating. ${stopInstruction}`);
    }
    throw new Error(`Could not confirm that the local OpenDoc server has stopped. ${stopInstruction}`);
  }
  let live: { token?: unknown } | null = null;
  try { live = await response.json() as { token?: unknown }; } catch { /* Never print the session response or its token. */ }
  if (response.ok && live?.token === session.token) throw new Error(`OpenDoc is still running. ${stopInstruction}`);
  throw new Error(`Could not verify the local OpenDoc session. ${stopInstruction}`);
}

async function verifyCandidate(stage: string, target: PackageIdentity) {
  const packageRoot = join(stage, 'node_modules/opendoc');
  let manifest;
  try { manifest = await packageMetadata(packageRoot); }
  catch { throw new Error('The staged installation does not contain the OpenDoc package. The current installation was preserved.'); }
  const identity = packageIdentity(manifest);
  if (identity.name !== target.name || identity.version !== target.version || identity.edition !== target.edition) throw new Error('The staged OpenDoc package name, edition, or version does not match the requested update. The current installation was preserved.');
  const bin = typeof manifest.bin === 'string' ? manifest.bin : manifest.bin?.opendoc;
  if (typeof bin !== 'string' || !bin || isAbsolute(bin)) throw new Error('The staged OpenDoc package has no valid CLI entry point.');
  const entry = resolve(packageRoot, bin), path = relative(packageRoot, entry);
  if (path === '..' || path.startsWith(`..${sep}`) || isAbsolute(path)) throw new Error('The staged OpenDoc CLI entry point is outside its package.');
  // Exercise the installed runtime and compiler against a disposable empty workspace.
  // User-authored files and package scripts never run as part of runtime updates.
  // The marker also prevents discovery from falling through to an ancestor workspace.
  await mkdir(join(stage, '.opendoc'));
  await writeFile(join(stage, '.opendoc/workspace.json'), JSON.stringify({ formatVersion: 1, edition: target.edition }) + '\n', { flag: 'wx' });
  await writeFile(join(stage, '.opendoc/installation-check.ts'), 'export {};\n', { flag: 'wx' });
  await writeFile(join(stage, 'tsconfig.json'), JSON.stringify({ extends: 'opendoc/tsconfig.workspace.json', include: ['.opendoc/installation-check.ts'] }) + '\n', { flag: 'wx' });
  const output = (await command(process.execPath, [entry, '--version'], stage)).trim();
  if (output !== target.version && output.toLowerCase() !== `opendoc ${target.version}`) throw new Error('The staged OpenDoc CLI did not report the requested version. The current installation was preserved.');
  const lock = JSON.parse(await readFile(join(stage, 'package-lock.json'), 'utf8')) as { packages?: Record<string, { dependencies?: Record<string, string> }> };
  if (lock.packages?.['']?.dependencies?.opendoc !== dependencyPin(target)) throw new Error('The staged npm lockfile does not match the requested version and edition. The current installation was preserved.');
  const check = JSON.parse(await command(process.execPath, [entry, 'check', '--json'], stage)) as { ok?: unknown };
  if (check?.ok !== true) throw new Error('The staged OpenDoc installation check failed. The current installation was preserved.');
}

class RecoveryRequired extends Error {}

function deferTermination() {
  let interrupted: 'SIGINT' | 'SIGTERM' | undefined;
  const onInterrupt = () => { interrupted ??= 'SIGINT'; };
  const onTerminate = () => { interrupted ??= 'SIGTERM'; };
  process.on('SIGINT', onInterrupt);
  process.on('SIGTERM', onTerminate);
  return {
    check() { if (interrupted) throw new Error(`Update interrupted by ${interrupted}.`); },
    release() {
      process.off('SIGINT', onInterrupt);
      process.off('SIGTERM', onTerminate);
      if (interrupted) process.exitCode = interrupted === 'SIGINT' ? 130 : 143;
    },
  };
}

type MetadataName = 'package.json' | 'package-lock.json';
type MetadataSnapshot = Record<MetadataName, Buffer | null>;

async function metadataMatches(path: string, expected: Buffer | null) {
  await assertRegularFile(path);
  const bytes = await optionalBytes(path);
  return expected === null ? bytes === null : bytes?.equals(expected) === true;
}

async function activate(root: string, stage: string, dependencies: UpdateDependencies, original: MetadataSnapshot, termination: ReturnType<typeof deferTermination>) {
  const backup = join(stage, 'previous');
  await mkdir(backup);
  const candidate: MetadataSnapshot = {
    'package.json': await readFile(join(stage, 'package.json')),
    'package-lock.json': await readFile(join(stage, 'package-lock.json')),
  };
  const expected = { ...original };
  const changes: { name: 'node_modules' | MetadataName; previous: boolean; installed: boolean }[] = [];
  const checkMetadata = async () => {
    for (const name of ['package.json', 'package-lock.json'] as const) {
      if (!await metadataMatches(join(root, name), expected[name])) throw new Error(`The workspace ${name} changed during activation. Its concurrent changes were preserved.`);
    }
    for (const change of changes) {
      if (change.name !== 'node_modules' && change.previous && !await metadataMatches(join(backup, change.name), original[change.name])) {
        throw new Error(`The previous ${change.name} changed through an open file handle during activation. Its concurrent changes were preserved.`);
      }
    }
  };
  try {
    for (const [name, step] of [['node_modules', 'dependencies'], ['package-lock.json', 'lockfile'], ['package.json', 'manifest']] as const) {
      termination.check();
      await checkMetadata();
      termination.check();
      const change = { name, previous: false, installed: false };
      changes.push(change);
      if (name === 'node_modules') {
        try { await rename(join(root, name), join(backup, name)); change.previous = true; }
        catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
        termination.check();
        await rename(join(stage, name), join(root, name));
      } else {
        if (original[name] !== null) {
          await rename(join(root, name), join(backup, name));
          change.previous = true;
          if (!await metadataMatches(join(backup, name), original[name])) throw new Error(`The workspace ${name} changed while being moved. Its concurrent changes were preserved.`);
        }
        termination.check();
        // Hard linking the prepared file publishes complete bytes and refuses to
        // overwrite a file another writer created after we moved the original.
        await link(join(stage, name), join(root, name));
        expected[name] = candidate[name];
      }
      change.installed = true;
      await dependencies.afterActivationStep?.(step);
    }
    await checkMetadata();
    termination.check();
  } catch (error) {
    const recovery = join(stage, 'rollback');
    try { await mkdir(recovery); }
    catch { throw new RecoveryRequired(`Update activation failed and rollback could not prepare its recovery folder. Previous files remain in ${backup}. Inspect the workspace and restore those files before using OpenDoc again.`); }
    const rollbackErrors: string[] = [];
    for (const change of changes.reverse()) {
      try {
        const current = join(root, change.name), previous = join(backup, change.name), moved = join(recovery, change.name);
        if (change.name === 'node_modules') {
          if (change.installed) await rename(current, moved);
          if (change.previous) await rename(previous, current);
        } else {
          if (change.installed) {
            if (!await metadataMatches(current, candidate[change.name])) {
              rollbackErrors.push(change.name);
              continue;
            }
            await rename(current, moved);
            // An edit racing the read and rename is retained, never deleted.
            if (!await metadataMatches(moved, candidate[change.name])) {
              await link(moved, current).catch(() => {});
              rollbackErrors.push(change.name);
              continue;
            }
          }
          if (change.previous) {
            // Restore the original inode without replacing any concurrent file.
            await link(previous, current);
          }
        }
      } catch { rollbackErrors.push(change.name); }
    }
    if (rollbackErrors.length) throw new RecoveryRequired(`Update stopped, but automatic rollback could not safely restore ${rollbackErrors.join(', ')}. Concurrent files were preserved at their workspace paths or in ${recovery}; previous files remain in ${backup}. Compare and reconcile the package manifest and lockfile, then run npm install before using OpenDoc again.`);
    throw new Error(`Update activation failed; the previous installation was restored. ${error instanceof Error ? error.message : 'Unknown activation error.'}`);
  }
}

export async function updateWorkspace(root: string, options: UpdateOptions = {}, dependencies: UpdateDependencies = {}): Promise<UpdateResult> {
  root = resolve(root);
  const marker = await readWorkspaceMarker(root);
  if (options.version !== undefined && !versionParts(options.version)) throw new Error('--version requires an exact stable version such as 0.3.1; ranges, tags, and prereleases are not supported.');
  const manifestPath = join(root, 'package.json'), lockPath = join(root, 'package-lock.json');
  await assertRegularFile(manifestPath);
  await assertRegularFile(lockPath);
  const originalManifest = await readFile(manifestPath), originalLock = await optionalBytes(lockPath);
  const manifest = JSON.parse(originalManifest.toString('utf8'));
  const identity = workspaceIdentity(manifest, marker);
  const current = identity.version;
  const npm = dependencies.npm ?? ((args, cwd) => command(process.platform === 'win32' ? 'npm.cmd' : 'npm', args, cwd));
  let published: unknown;
  try { published = JSON.parse(await npm(['view', identity.name, 'versions', '--json'], root)); }
  catch (error) { throw new Error(`Could not check published OpenDoc versions. ${error instanceof Error ? error.message : ''}`); }
  const versions = (Array.isArray(published) ? published : [published]).filter((value): value is string => typeof value === 'string' && versionParts(value) !== null).sort(compareVersions);
  if (!versions.length) throw new Error('The npm registry did not report any stable OpenDoc versions.');
  const compatible = latestCompatibleVersion(current, versions), target = options.version ?? compatible;
  if (options.version && !versions.includes(target)) throw new Error(`OpenDoc ${target} is not a published stable version.`);
  const result: UpdateResult = {
    status: target === current ? 'up-to-date' : 'available', currentVersion: current, targetVersion: target,
    latestCompatibleVersion: compatible, latestVersion: versions.at(-1)!, check: Boolean(options.check), explicit: options.version !== undefined,
  };
  if (options.check || target === current) return result;
  if (identity.edition === 'normal') await assertServerStopped(root);
  const stage = await mkdtemp(join(dirname(root), '.opendoc-update-'));
  let keepStage = false;
  let termination: ReturnType<typeof deferTermination> | undefined;
  try {
    const targetIdentity = { ...identity, version: target };
    const updatedManifest = { ...manifest, dependencies: { ...manifest.dependencies, opendoc: dependencyPin(targetIdentity) } };
    const indent = originalManifest.toString('utf8').match(/\n([\t ]+)"/)?.[1] ?? '  ';
    const candidateManifest = `${JSON.stringify(updatedManifest, null, indent)}\n`;
    await writeFile(join(stage, 'package.json'), candidateManifest);
    if (originalLock) await writeFile(join(stage, 'package-lock.json'), originalLock);
    try { await copyFile(join(root, '.npmrc'), join(stage, '.npmrc')); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    await npm(['install', '--ignore-scripts', '--no-audit', '--no-fund'], stage);
    if ((await readFile(join(stage, 'package.json'), 'utf8')) !== candidateManifest) throw new Error('npm unexpectedly changed the staged package manifest. The current installation was preserved.');
    await verifyCandidate(stage, targetIdentity);
    await dependencies.beforeActivate?.(stage);
    termination = deferTermination();
    await withWorkspaceLock(root, async () => {
      workspaceIdentity(manifest, await readWorkspaceMarker(root));
      if (identity.edition === 'normal') await assertServerStopped(root);
      await assertRegularFile(manifestPath);
      await assertRegularFile(lockPath);
      const currentManifest = await optionalBytes(manifestPath), currentLock = await optionalBytes(lockPath);
      if (!currentManifest?.equals(originalManifest) || (originalLock === null ? currentLock !== null : !currentLock?.equals(originalLock))) {
        throw new Error('The workspace package manifest or lockfile changed during the update. No update was activated; rerun the command after finishing those changes.');
      }
      await activate(root, stage, dependencies, { 'package.json': originalManifest, 'package-lock.json': originalLock }, termination!);
    });
    result.status = 'updated';
    return result;
  } catch (error) {
    keepStage = error instanceof RecoveryRequired;
    throw error;
  } finally {
    if (!keepStage) {
      try { await rm(stage, { recursive: true, force: true }); }
      catch { result.cleanupWarning = `Temporary update files remain at ${stage}.`; }
    }
    termination?.release();
  }
}

export async function runUpdate(args: string[], root: string): Promise<void> {
  const json = args.includes('--json');
  try {
    if (args.includes('--help') || args.includes('-h')) {
      const { edition } = workspaceIdentity(await packageMetadata(root), await readWorkspaceMarker(root));
      const usage = `Usage: npx opendoc update [--check] [--version <exact>] [--json]\nChecks or installs the newest stable version compatible with the current pin. Use --version to explicitly choose a stable version, including a breaking update or downgrade. ${edition === 'normal' ? 'Stop OpenDoc before installing.' : 'Finish active OpenDoc Headless commands before installing. Updates preserve the Headless edition.'}`;
      console.log(json ? JSON.stringify({ usage }) : usage);
      return;
    }
    const options: UpdateOptions = {};
    const seen = new Set<string>();
    for (let index = 0; index < args.length; index++) {
      const arg = args[index];
      if (seen.has(arg)) throw new Error(`Duplicate update option: ${arg}`);
      seen.add(arg);
      if (arg === '--check') options.check = true;
      else if (arg === '--json') continue;
      else if (arg === '--version') {
        options.version = args[++index];
        if (!options.version || options.version.startsWith('-')) throw new Error('--version requires an exact stable version.');
      } else throw new Error(`Unknown update option: ${arg}. Use update [--check] [--version <exact>] [--json].`);
    }
    const result = await updateWorkspace(root, options);
    if (json) console.log(JSON.stringify(result));
    else {
      console.log(`OpenDoc ${result.currentVersion}; latest compatible ${result.latestCompatibleVersion}.`);
      if (result.status === 'updated') {
        const { edition } = workspaceIdentity(await packageMetadata(root), await readWorkspaceMarker(root));
        console.log(`Updated to ${result.targetVersion}.${edition === 'normal' ? ' Restart with npx opendoc start.' : ' OpenDoc Headless is ready to author, review, and export.'}`);
      }
      else if (result.status === 'available') console.log(`${result.targetVersion} is available. Run npx opendoc update${result.explicit ? ` --version ${result.targetVersion}` : ''} to install it.`);
      else console.log('The installed version is current for this update request.');
      if (result.cleanupWarning) console.log(result.cleanupWarning);
    }
  } catch (error) {
    if (!json) throw error;
    const message = error instanceof Error ? error.message : 'Update failed.';
    console.error(message);
    console.log(JSON.stringify({ status: 'error', error: message }));
    if (!process.exitCode) process.exitCode = 1;
  }
}
