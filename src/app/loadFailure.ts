/** Browsers word a failed dynamic import differently; each names the module or the import. */
export function isLoadFailure(error: unknown) {
  if (!(error instanceof Error)) return false;
  return error.name === 'ChunkLoadError' || /dynamically imported module|module script|importing a module|error loading dynamically/i.test(error.message);
}

/**
 * How long to wait before loading the workspace again after `failures` failed attempts in a row: one second,
 * then doubling, up to half a minute. Data requests can fail while the live connection stays up, such as when
 * one folder is briefly unreadable, and no change event may follow to load them again.
 */
export function retryDelay(failures: number, first = 1_000, longest = 30_000) {
  if (failures < 1) return 0;
  return Math.min(longest, first * 2 ** Math.min(failures - 1, 16));
}
