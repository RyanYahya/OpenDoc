import { build } from 'esbuild';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { existsSync, realpathSync } from 'node:fs';
import { bindingDependencies, readDocumentAssetsAt, readThemeAssetDefaults, resolveThemeAssets } from '../assets/files';
import { authoringResolutionPlugin } from './source-overrides';
import { applicationRoot, runtimeSource } from '../runtime/paths';

export interface DocumentDependencies { files: Set<string>; readsFiles: boolean }

/** Executed outside the authored import graph; stamp these for export freshness as well. */
export const renderRuntimeInputs = [
  ...['worker', 'preflight', 'text-layout', 'text-source', 'render', 'render-source', 'source-overrides'].map(name => runtimeSource(`server/${name}.ts`)),
  runtimeSource('rendering/resolve-sources.ts'),
  runtimeSource('runtime/paths.ts'), resolve(applicationRoot, 'package.json'), resolve(applicationRoot, 'tsconfig.workspace.json'),
];

/** Move a path between two spellings of one folder, such as macOS /var and /private/var. */
function respell(path: string, from: string, to: string) {
  const rel = relative(from, path);
  return rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel) ? path : resolve(to, rel);
}
function realRoot(root: string) {
  try { return realpathSync(root); } catch { return root; }
}

/** Only the new family directories are managed; existing loose fonts remain conservative inputs. */
export function isManagedAssetPath(root: string, path: string) {
  const parts = relative(root, resolve(root, path)).split(sep);
  return parts[0] === 'assets' && ((parts[1] === 'logos' && (!parts[2] || /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(parts[2])))
    || (parts[1] === 'fonts' && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(parts[2] ?? '')));
}
export function isThemeAssetDefaultsPath(root: string, path: string) {
  return /^themes\/[a-z0-9]+(?:-[a-z0-9]+)*\/assets\.json$/.test(relative(root, resolve(root, path)).split(sep).join('/'));
}

/** Include absent binding/manifests too, so repairing a failed asset is observable. */
async function managedInputs(root: string, entry: string) {
  // documentEntry resolves macOS /var to /private/var; keep the binding path in root's spelling.
  const parts = relative(realpathSync(root), realpathSync(entry)).split(sep);
  const files = new Set<string>();
  const previewTheme = parts[0] === 'themes' && parts[2] === 'preview.tsx' ? parts[1]
    : parts[0] === 'templates' && parts[2] === 'preview.tsx' ? 'neutral' : undefined;
  if (previewTheme) {
    files.add(resolve(root, 'themes', previewTheme, 'assets.json'));
    try {
      const defaults = await readThemeAssetDefaults(root, previewTheme);
      for (const [kind, id] of [['logos', defaults.logo?.id], ['fonts', defaults.bodyFont], ['fonts', defaults.headingFont]] as const)
        if (id) files.add(resolve(root, 'assets', kind, id, 'asset.json'));
      const bindings = await resolveThemeAssets(root, previewTheme);
      for (const path of await bindingDependencies(root, bindings)) files.add(resolve(root, path));
    } catch { /* The worker reports validation errors; preserve known paths for recovery. */ }
  } else if (parts[0] === 'documents') {
    const directory = dirname(resolve(root, ...parts));
    files.add(resolve(directory, 'assets.json'));
    try {
      const bindings = await readDocumentAssetsAt(root, directory);
      for (const path of await bindingDependencies(root, bindings)) files.add(resolve(root, path));
    } catch { /* An invalid binding remains watched through its containing document. */ }
  }
  return files;
}

/** Follow imports without executing document code, then add immutable managed asset inputs. */
export async function documentDependencies(root: string, entry: string): Promise<DocumentDependencies> {
  const result = await build({
    absWorkingDir: root, entryPoints: [entry], bundle: true, write: false, metafile: true,
    platform: 'node', format: 'esm', jsx: 'automatic', logLevel: 'silent', plugins: [authoringResolutionPlugin()],
    outdir: resolve(root, '.opendoc/dependencies'),
  });
  // esbuild reports inputs relative to the real working directory. Workspace files keep root's
  // spelling for watchers; files outside it, such as the installed runtime, keep their real paths.
  const actualRoot = realpathSync(root);
  const inputs = Object.entries(result.metafile!.inputs).map(([file, input]) => [resolve(actualRoot, file), input] as const);
  const managedRoots = ['media', 'assets'].map(folder => runtimeSource(folder)).filter(existsSync).map(folder => realpathSync(folder) + sep);
  const documentRuntime = realpathSync(runtimeSource('document/index.tsx'));
  const files = new Set(inputs.map(([file]) => respell(file, actualRoot, root)));
  for (const file of ['package.json', 'package-lock.json', 'pnpm-lock.yaml', 'tsconfig.json']) files.add(resolve(root, file));
  for (const file of renderRuntimeInputs) files.add(file);
  for (const file of await managedInputs(root, entry)) files.add(file);
  return {
    files,
    // Managed reads have exact dependency records. Arbitrary authored filesystem reads stay conservative.
    readsFiles: inputs.some(([file, input]) => {
      const actual = realpathSync(file);
      return actual !== documentRuntime && !managedRoots.some(folder => actual.startsWith(folder))
        && input.imports.some(item => /^(node:)?fs(?:\/promises)?$/.test(item.path));
    }),
  };
}

export function includesDependency(dependencies: DocumentDependencies, path: string) {
  return dependencies.files.has(path) || [...dependencies.files].some(file => file.startsWith(path + sep));
}

/** Worker inputs that are not necessarily imported by authored components. */
export function isRenderRuntimePath(root: string, path: string) {
  // Accept either spelling: workspace rules read root's spelling, while Node resolves the runtime to real paths.
  const actualRoot = realRoot(root);
  const absolute = respell(resolve(root, path), actualRoot, root);
  const actual = respell(absolute, root, actualRoot);
  const rel = relative(root, absolute).split(sep).join('/');
  return (rel.startsWith('assets/') && !isManagedAssetPath(root, absolute))
    || /^(package\.json|package-lock\.json|pnpm-lock\.yaml|tsconfig\.json)$/.test(rel)
    || renderRuntimeInputs.includes(actual)
    || actual === resolve(applicationRoot, 'pnpm-lock.yaml');
}
