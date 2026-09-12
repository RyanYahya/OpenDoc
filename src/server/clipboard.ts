import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

export const canCopyFile = process.platform === 'darwin';

// Pass paths as arguments, never as executable script text. A named pasteboard
// lets native integration checks exercise this without changing the user's clipboard.
export async function copyFileToClipboard(path: string, pasteboardName?: string) {
  if (!canCopyFile) throw new Error('Copying files to the clipboard is currently available on macOS. Use Download a copy instead.');
  const script = `ObjC.import('AppKit');
function run(argv) {
  var url = $.NSURL.fileURLWithPath($(argv[0]));
  var board = argv.length > 1 ? $.NSPasteboard.pasteboardWithName($(argv[1])) : $.NSPasteboard.generalPasteboard;
  board.clearContents;
  if (!board.writeObjects($.NSArray.arrayWithObject(url)) || ObjC.unwrap(board.stringForType('public.file-url')) !== ObjC.unwrap(url.absoluteString)) throw new Error('The clipboard could not accept this file.');
}`;
  try {
    await promisify(execFile)('/usr/bin/osascript', ['-l', 'JavaScript', '-e', script, path, ...(pasteboardName ? [pasteboardName] : [])], { timeout: 10_000 });
  } catch {
    throw new Error('The file could not be copied to the clipboard. Try again or use Download a copy.');
  }
}
