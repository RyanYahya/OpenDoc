/** Each document keeps its history beside its source, so a synced folder carries both together. */
export const historyFolder = '.history';

/** Feedback, history, media, and transient files are not versioned as text sources. */
export function trackedSourcePath(relativePath: string) {
  const parts = relativePath.split(/[\\/]/);
  if (!parts.length || parts.some(part => !part || part.startsWith('.') || part === 'node_modules')) return false;
  if (parts.length === 1 && parts[0] === 'comments.json') return false;
  if (parts[0] === 'media') return false;
  return !/\.tmp$/.test(relativePath) && !relativePath.includes('.forme-render-');
}
