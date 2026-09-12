import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Code and dependencies belong to the installation; authored files belong to the workspace. */
export const applicationRoot = fileURLToPath(new URL('../../', import.meta.url));
export const runtimeRequire = createRequire(new URL('../../package.json', import.meta.url));
export const runtimeResolve = (specifier: string) => {
  const url = import.meta.resolve(specifier);
  return url.startsWith('file:') ? fileURLToPath(url) : url;
};
export const runtimeSource = (path: string) => resolve(applicationRoot, 'src', path);
