import type { TextSourceValue } from '../src/shared/selection';
import { createJsonTextSourceResolver, serializeSourceValue, textDigest, type JsonTextPath } from '../src/server/text-source';

/** Small adapters for exercising production source parsing and serialization. */
export function resolveJsonTextSource(file: string, source: string, path: JsonTextPath): TextSourceValue | undefined {
  return createJsonTextSourceResolver(file, source)(path);
}

export function replaceSourceValue(source: string, value: TextSourceValue, next: string): string {
  if (textDigest(source) !== value.digest) throw new Error('This source changed. Refresh the selection before editing.');
  const token = serializeSourceValue(value, next);
  return source.slice(0, value.start) + token + source.slice(value.end);
}
