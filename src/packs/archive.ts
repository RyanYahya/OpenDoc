import { crc32, inflateRawSync } from 'node:zlib';
import { ZipWriter } from '@shbernal/ts-pptx/zip';

export const limits = { archive: 64 * 1024 * 1024, expanded: 128 * 1024 * 1024, file: 32 * 1024 * 1024, files: 2048 };

/** Portable paths also avoid aliases on Windows and case-insensitive macOS volumes. */
export function packPath(value: unknown): asserts value is string {
  if (typeof value !== 'string' || !value || value.length > 240 || value !== value.normalize('NFC')
    || /[\\\x00-\x1f\x7f<>:"|?*]/.test(value) || value.split('/').some(part => !part || part.startsWith('.')
      || /[. ]$/.test(part) || /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(part))) {
    throw new Error(`Invalid portable pack path: ${JSON.stringify(value)}.`);
  }
}

export function validatePaths(paths: Iterable<string>) {
  const seen = new Set<string>(), prefixes = new Map<string, string>();
  for (const path of paths) {
    packPath(path);
    const key = path.toLowerCase();
    if (seen.has(key)) throw new Error(`Duplicate or case-colliding pack path: ${path}.`);
    seen.add(key);
    const parts = path.split('/');
    for (let index = 1; index <= parts.length; index++) {
      const prefix = parts.slice(0, index).join('/'), folded = prefix.toLowerCase();
      if (prefixes.has(folded) && prefixes.get(folded) !== prefix) throw new Error(`Case-colliding pack directory: ${path}.`);
      prefixes.set(folded, prefix);
    }
  }
  for (const path of seen) {
    const parts = path.split('/');
    while (parts.length > 1) {
      parts.pop();
      if (seen.has(parts.join('/'))) throw new Error(`Pack file is also a parent directory: ${path}.`);
    }
  }
}

export function writeArchive(files: Map<string, Buffer>): Buffer {
  validatePaths(files.keys());
  if (files.size > limits.files) throw new Error('Too many files in this pack.');
  const writer = new ZipWriter();
  let total = 0;
  for (const [path, bytes] of [...files].sort(([a], [b]) => a.localeCompare(b, 'en'))) {
    total += bytes.length;
    if (bytes.length > limits.file || total > limits.expanded) throw new Error('Pack contents exceed the size limit.');
    writer.add(path, bytes);
  }
  const bytes = Buffer.from(writer.toBytes());
  if (bytes.length > limits.archive) throw new Error('The compressed pack exceeds 64 MiB.');
  return bytes;
}

/** Read ordinary ZIP files without trusting their advertised expansion size or extracting paths.
 * Our existing PPTX writer supplies ZIP creation; its unbounded reader is not an import boundary.
 * ZIP64, encryption, links, duplicate names, and multi-disk archives are deliberately unsupported.
 */
export function readArchive(bytes: Buffer): Map<string, Buffer> {
  const fail = (message: string): never => { throw new Error(`Invalid OpenDoc ZIP: ${message}`); };
  if (bytes.length < 22 || bytes.length > limits.archive) fail('archive must be at most 64 MiB.');
  let end = bytes.length - 22;
  const earliest = Math.max(0, end - 65535);
  while (end >= earliest && (bytes.readUInt32LE(end) !== 0x06054b50 || end + 22 + bytes.readUInt16LE(end + 20) !== bytes.length)) end--;
  if (end < earliest) fail('missing end record.');
  const count = bytes.readUInt16LE(end + 10), centralSize = bytes.readUInt32LE(end + 12), centralOffset = bytes.readUInt32LE(end + 16);
  if (bytes.readUInt16LE(end + 4) || bytes.readUInt16LE(end + 6) || bytes.readUInt16LE(end + 8) !== count
    || !count || count > limits.files || centralOffset + centralSize !== end) fail('unsupported directory.');
  const entries: { path: string; offset: number; compressed: number; expanded: number; method: number; crc: number; flags: number; name: Buffer }[] = [];
  let cursor = centralOffset, total = 0;
  const decoder = new TextDecoder('utf-8', { fatal: true });
  for (let index = 0; index < count; index++) {
    if (cursor + 46 > end || bytes.readUInt32LE(cursor) !== 0x02014b50) fail('invalid directory entry.');
    const flags = bytes.readUInt16LE(cursor + 8), method = bytes.readUInt16LE(cursor + 10);
    const compressed = bytes.readUInt32LE(cursor + 20), expanded = bytes.readUInt32LE(cursor + 24);
    const nameLength = bytes.readUInt16LE(cursor + 28), extraLength = bytes.readUInt16LE(cursor + 30), commentLength = bytes.readUInt16LE(cursor + 32);
    const next = cursor + 46 + nameLength + extraLength + commentLength;
    if (next > end || !nameLength || flags & ~0x080e || ![0, 8].includes(method)
      || bytes.readUInt16LE(cursor + 34)) fail('unsupported entry.');
    const mode = bytes.readUInt32LE(cursor + 38) >>> 16;
    if ((mode & 0xf000) && (mode & 0xf000) !== 0x8000) fail('only ordinary files are supported.');
    const name = bytes.subarray(cursor + 46, cursor + 46 + nameLength);
    let path: string;
    try { path = decoder.decode(name); } catch { return fail('entry name is not UTF-8.'); }
    packPath(path);
    total += expanded;
    if (expanded > limits.file || total > limits.expanded) fail('expanded contents exceed the size limit.');
    entries.push({ path, name, offset: bytes.readUInt32LE(cursor + 42), compressed, expanded, method, flags, crc: bytes.readUInt32LE(cursor + 16) });
    cursor = next;
  }
  if (cursor !== end) fail('directory size mismatch.');
  validatePaths(entries.map(entry => entry.path));
  const files = new Map<string, Buffer>();
  const spans: [number, number][] = [];
  for (const entry of entries) {
    const { offset, compressed, expanded, method, flags, path } = entry;
    if (offset + 30 > centralOffset || bytes.readUInt32LE(offset) !== 0x04034b50
      || bytes.readUInt16LE(offset + 6) !== flags || bytes.readUInt16LE(offset + 8) !== method) fail('invalid local header.');
    const nameLength = bytes.readUInt16LE(offset + 26), extraLength = bytes.readUInt16LE(offset + 28);
    const start = offset + 30 + nameLength + extraLength, stop = start + compressed;
    if (stop > centralOffset || !bytes.subarray(offset + 30, offset + 30 + nameLength).equals(entry.name)) fail('local path or size mismatch.');
    if (!(flags & 8) && (bytes.readUInt32LE(offset + 14) !== entry.crc
      || bytes.readUInt32LE(offset + 18) !== compressed || bytes.readUInt32LE(offset + 22) !== expanded)) fail('local size or checksum mismatch.');
    spans.push([offset, stop]);
    let data: Buffer;
    try { data = method === 0 ? Buffer.from(bytes.subarray(start, stop)) : inflateRawSync(bytes.subarray(start, stop), { maxOutputLength: Math.max(1, expanded) }); }
    catch { return fail(`cannot expand ${path} within its declared size.`); }
    if (data.length !== expanded || crc32(data) !== entry.crc) fail(`checksum or length mismatch: ${path}.`);
    files.set(path, data);
  }
  spans.sort(([a], [b]) => a - b);
  for (let index = 1; index < spans.length; index++) if (spans[index][0] < spans[index - 1][1]) fail('overlapping entries.');
  return files;
}
