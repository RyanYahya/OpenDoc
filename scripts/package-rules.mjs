// Files that belong to one workspace's own organization, like project membership. They never
// enter the starter library or the package, so a new workspace starts without them.
export const workspaceOrganizationFiles = ['projects.json', 'tags.json', 'themes/folders.json'];

/** Checkout paths (relative, `/`-separated) that are never copied into a package stage. */
export function excludedFromCopy(name, sourceArchive) {
  if (name === sourceArchive || name === 'docs/showcase' || name.startsWith('docs/showcase/')) return true;
  return workspaceOrganizationFiles.includes(name);
}

/** Packed paths that must not appear in a release archive. */
export function forbiddenInPackage(name, sourceArchive) {
  return /^(?:tests|documents|projects\.json|tags\.json|\.opendoc|\.git|output|tmp)(?:\/|$)/.test(name)
    || name === 'starter/themes/folders.json'
    || name === 'starter/tags.json'
    || name === sourceArchive
    || /^node_modules\/@formepdf\/(?:html|renderer)(?:\/|$)/.test(name)
    || /^node_modules\/@formepdf\/core\/(?:pkg|pkg-web)(?:\/|$)/.test(name);
}
