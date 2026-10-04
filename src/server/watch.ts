import { relative } from 'node:path';

/**
 * Paths the service watcher ignores. Generated state, dependencies, exports, and each
 * document's `.history` folder must never trigger discovery or rendering.
 */
export function ignoredByWatcher(applicationRoot: string, root: string, path: string) {
  const installed = relative(applicationRoot, path);
  const rel = installed === '' || (!installed.startsWith('../') && installed !== '..') ? installed : relative(root, path);
  return /(^|[/\\])(node_modules|\.git|\.opendoc|\.history|output|tmp|dist|tests)([/\\]|$)/.test(rel) || /\.forme-render-|\.tmp$/.test(rel);
}
