import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { copyFileToClipboard } from '../src/server/clipboard';

test('native clipboard stores a pasteable file URL with Unicode and literal filename punctuation', { skip: process.platform !== 'darwin' }, async () => {
  const root = await mkdtemp(resolve(tmpdir(), 'opendoc-clipboard-'));
  const name = `org.opendoc.test.${randomUUID()}`;
  try {
    const file = resolve(root, "Résumé's $(literal) report.pdf");
    await writeFile(file, '%PDF-1.7\nClipboard test');
    await copyFileToClipboard(file, name);
    const script = `ObjC.import('AppKit'); function run(argv) { var board = $.NSPasteboard.pasteboardWithName($(argv[0])); return ObjC.unwrap(board.stringForType('public.file-url')); }`;
    const result = await promisify(execFile)('/usr/bin/osascript', ['-l', 'JavaScript', '-e', script, name]);
    const copiedPath = fileURLToPath(result.stdout.trim());
    assert.equal(copiedPath.normalize('NFC'), file.normalize('NFC'));
    assert.deepEqual(await readFile(copiedPath), await readFile(file));
  } finally {
    await promisify(execFile)('/usr/bin/osascript', ['-l', 'JavaScript', '-e', `ObjC.import('AppKit'); function run(argv) { $.NSPasteboard.pasteboardWithName($(argv[0])).releaseGlobally; }`, name]);
    await rm(root, { recursive: true, force: true });
  }
});
