/** Browsers word a failed dynamic import differently; each names the module or the import. */
export function isLoadFailure(error: unknown) {
  if (!(error instanceof Error)) return false;
  return error.name === 'ChunkLoadError' || /dynamically imported module|module script|importing a module|error loading dynamically/i.test(error.message);
}
