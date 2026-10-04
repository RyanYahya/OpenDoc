import path from 'node:path';

/** Local state, exports, and each document's recorded history never enter a package. */
export const excludedNames = ['.DS_Store', 'node_modules', '.git', '.opendoc', '.history', 'output', 'tmp'];

export function excludedFromPackage(source) {
  return excludedNames.includes(path.basename(source));
}

/** Packaged paths that must never appear, checked against npm's file list. */
export function forbiddenPackagePath(name) {
  return /^(?:tests|documents|projects\.json|\.opendoc|\.git|output|tmp)(?:\/|$)/.test(name) || /(?:^|\/)\.history(?:\/|$)/.test(name);
}
