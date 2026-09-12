import { build, type Plugin } from 'esbuild';
import { dirname } from 'node:path';
import { realpath } from 'node:fs/promises';
import { isBuiltin } from 'node:module';
import { pathToFileURL } from 'node:url';
import type { TextSourceValue } from '../shared/selection';
import { textSourceBindingId } from './text-source';
import { runtimeResolve, runtimeSource } from '../runtime/paths';

const authoringModules: Record<string, string> = {
  opendoc: 'document/index.tsx',
  'opendoc/themes': 'themes/index.ts',
  'opendoc/assets': 'assets/index.ts',
  'opendoc/template': 'template/index.ts',
};

/** Keep the authoring runtime in one bundle and installed dependencies in one Node instance. */
export function authoringResolutionPlugin(): Plugin {
  return { name: 'opendoc-installed-runtime', setup(builder) {
    builder.onResolve({ filter: /^[^./]/ }, args => {
      if (authoringModules[args.path]) return { path: runtimeSource(authoringModules[args.path]) };
      if (isBuiltin(args.path)) return { path: args.path, external: true };
      if (args.path.startsWith('file:')) return { path: args.path, external: true };
      try { return { path: pathToFileURL(runtimeResolve(args.path)).href, external: true }; }
      catch (error) {
        // Additional packages authored in a workspace still use esbuild's normal resolution.
        if (['MODULE_NOT_FOUND', 'ERR_MODULE_NOT_FOUND'].includes((error as NodeJS.ErrnoException).code ?? '')) return undefined;
        throw error;
      }
    });
  } };
}

/** Trusted candidates assembled from renderer-issued bindings, never client paths. */
export interface SourceOverride {
  file: string;
  contents: string;
  originalDigest: string;
  replacements: { start: number; end: number; tokenLength: number; value: string }[];
}

/** Keep the authored identity while candidate tokens and all following offsets move. */
export function originalBinding(source: TextSourceValue | undefined, override: SourceOverride | undefined) {
  if (!source || !override) return source;
  let delta = 0;
  for (const replacement of override.replacements) {
    const start = replacement.start + delta, end = start + replacement.tokenLength;
    if (source.start >= start && source.end <= end && source.value === replacement.value) {
      return { ...source, bindingId: textSourceBindingId(source.file, override.originalDigest, replacement.start, replacement.end) };
    }
    if (source.end <= start) break;
    if (source.start < end) return { ...source, bindingId: undefined };
    delta += replacement.tokenLength - (replacement.end - replacement.start);
  }
  return { ...source, bindingId: textSourceBindingId(source.file, override.originalDigest, source.start - delta, source.end - delta) };
}

/**
 * Bundle authored code once, preserving Forme's JSX source-map contract for
 * original sources and drafts. Installed packages never depend on workspace hoisting.
 */
export async function bundleSourceOverrides(source: string, entry: string, overrides: Map<string, SourceOverride>) {
  const used = new Set<string>();
  const result = await build({
    stdin: { contents: source, resolveDir: dirname(entry), sourcefile: '.opendoc-entry.tsx', loader: 'tsx' },
    absWorkingDir: dirname(entry), bundle: true, write: false, format: 'esm', platform: 'node', target: 'node20',
    jsx: 'automatic', jsxDev: true, jsxImportSource: 'react',
    logLevel: 'silent', plugins: [{ name: 'opendoc-draft-sources', setup(builder) {
      builder.onResolve({ filter: /^(?:react|opendoc)\/jsx-dev-runtime$/ }, () => ({ path: 'opendoc-jsx-source', namespace: 'opendoc-jsx-source' }));
      builder.onLoad({ filter: /.*/, namespace: 'opendoc-jsx-source' }, () => ({
        loader: 'js', resolveDir: dirname(entry), contents: `
          import { jsx, Fragment } from 'react/jsx-runtime';
          import { resolve, isAbsolute } from 'node:path';
          export { Fragment };
          globalThis.__formeSourceMap ??= new WeakMap();
          export function jsxDEV(type, props, key, staticChildren, source) {
            const element = jsx(type, props, key);
            if (source?.fileName) globalThis.__formeSourceMap.set(element, {
              file: isAbsolute(source.fileName) ? source.fileName : resolve(${JSON.stringify(dirname(entry))}, source.fileName),
              line: source.lineNumber, column: source.columnNumber,
            });
            return element;
          }
        `,
      }));
      builder.onLoad({ filter: /\.(?:tsx?|json)$/ }, async args => {
        const path = await realpath(args.path);
        const override = overrides.get(path);
        if (!override) return undefined;
        used.add(path);
        return { contents: override.contents, loader: path.endsWith('.json') ? 'json' : path.endsWith('.tsx') ? 'tsx' : 'ts', resolveDir: dirname(path) };
      });
    } }, authoringResolutionPlugin()],
  }).catch(error => { throw new Error(`Build error: ${error instanceof Error ? error.message : String(error)}`, { cause: error }); });
  if ([...overrides.keys()].some(file => !used.has(file))) throw new Error('An edited source is no longer used by this document. Refresh the document before saving.');
  return result.outputFiles[0].text;
}
