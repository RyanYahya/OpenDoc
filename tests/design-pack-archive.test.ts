import test from 'node:test';
import assert from 'node:assert/strict';
import { ZipWriter } from '@shbernal/ts-pptx/zip';
import { limits, packPath, readArchive, validatePaths, writeArchive } from '../src/packs/archive';
import { compatiblePack, type PackManifest } from '../src/packs/manifest';

function zip(path = 'themes/example/index.ts', contents: string | Buffer = 'export const theme = {};') {
  const writer = new ZipWriter(); writer.add(path, contents);
  return Buffer.from(writer.toBytes());
}
function directory(bytes: Buffer) { return bytes.readUInt32LE(bytes.length - 22 + 16); }

test('pack ZIP round trips source and binary files deterministically', () => {
  const files = new Map([['themes/sample/index.ts', Buffer.from('export const text = "مرحبا";')], ['assets/images/art.png', Buffer.from([0, 255, 1, 13, 10])]]);
  assert.deepEqual(readArchive(writeArchive(files)), files);
  assert.deepEqual(writeArchive(files), writeArchive(new Map([...files].reverse())));
});

test('pack paths reject traversal, aliases, hidden files, and file/directory collisions', () => {
  for (const path of ['../secret', '/absolute', 'a/../b', 'a//b', 'a\\b', 'C:/b', 'a/.env', 'a/NUL.txt', 'a/file.', 'a/file ', 'a/\u0000', 'a/cafe\u0301']) assert.throws(() => packPath(path), /Invalid portable/);
  for (const paths of [['themes/a/File.ts', 'themes/a/file.ts'], ['assets/x', 'assets/x/a.png'], ['assets/Images/a.png', 'assets/images/b.png']]) assert.throws(() => validatePaths(paths), /colliding|parent/);
  assert.throws(() => readArchive(zip('../outside')), /Invalid portable/);
});

test('bounded ZIP reading refuses links, encryption, expansion lies, corrupt CRCs, and mismatched local paths', () => {
  const source = zip(), offset = directory(source);
  const changed = (edit: (bytes: Buffer) => void) => { const copy = Buffer.from(source); edit(copy); assert.throws(() => readArchive(copy)); };
  changed(bytes => bytes.writeUInt32LE((0xa1ff << 16) >>> 0, offset + 38));
  changed(bytes => bytes.writeUInt16LE(1, offset + 8));
  changed(bytes => bytes.writeUInt32LE(limits.file + 1, offset + 24));
  changed(bytes => { bytes.writeUInt32LE(1, offset + 24); bytes.writeUInt32LE(1, 22); });
  changed(bytes => { bytes.writeUInt32LE(0, offset + 16); bytes.writeUInt32LE(0, 14); });
  changed(bytes => { bytes[30] = 'z'.charCodeAt(0); });
  changed(bytes => bytes.writeUInt32LE(0xffffffff, offset + 42));
  const writer = new ZipWriter(); writer.add('themes/a/ONE.ts', 'first'); writer.add('themes/a/one.ts', 'second');
  assert.throws(() => readArchive(Buffer.from(writer.toBytes())), /colliding/);
  assert.throws(() => readArchive(Buffer.alloc(22)), /missing end record/);
});

test('pack compatibility stays within the producing minor line and rejects older patches', () => {
  const manifest = { opendocVersion: '0.6.2' } as PackManifest;
  assert.equal(compatiblePack(manifest, '0.6.2'), true);
  assert.equal(compatiblePack(manifest, '0.6.3'), true);
  for (const version of ['0.6.1', '0.7.0', '1.6.2', 'latest', '0.6.2-beta']) assert.equal(compatiblePack(manifest, version), false);
});
