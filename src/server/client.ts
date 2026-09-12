import { createReadStream, existsSync } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { extname, relative, resolve, sep } from 'node:path';
import { containedFile } from './files';

const contentTypes: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
  '.ico': 'image/x-icon', '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.otf': 'font/otf', '.wasm': 'application/wasm', '.json': 'application/json',
};

/** Production serves only the built browser app; authoring and PDF APIs stay live. */
export async function builtClient(root: string) {
  const directory = resolve(root, 'dist');
  const repair = existsSync(resolve(root, 'vite.config.ts')) ? 'Run pnpm build, then pnpm start.' : 'Run npm ci in your workspace, then npx opendoc start.';
  try { await readFile(await containedFile(directory, resolve(directory, 'index.html'))); }
  catch { throw new Error(`The built OpenDoc app is missing. ${repair}`); }
  return async (req: IncomingMessage, res: ServerResponse) => {
    const fail = (status: number, message: string) => {
      res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(req.method === 'HEAD' ? undefined : message);
    };
    if (req.method !== 'GET' && req.method !== 'HEAD') { fail(405, 'Method not allowed.'); return; }
    let path: string;
    try { path = decodeURIComponent(new URL(req.url ?? '/', 'http://localhost').pathname); }
    catch { fail(400, 'Invalid local path.'); return; }
    if (path.includes('\\') || path.includes('\0') || path.split('/').some(part => part.startsWith('.'))) { fail(404, 'Not found.'); return; }
    const file = resolve(directory, `.${path === '/' ? '/index.html' : path}`);
    const local = relative(directory, file);
    if (local === '..' || local.startsWith(`..${sep}`)) { fail(404, 'Not found.'); return; }
    try {
      const actual = await containedFile(directory, file);
      const info = await stat(actual);
      if (!info.isFile()) { fail(404, 'Not found.'); return; }
      res.writeHead(200, {
        'Content-Type': contentTypes[extname(actual)] ?? 'application/octet-stream', 'Content-Length': info.size,
        'Cache-Control': path.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache',
        'X-Content-Type-Options': 'nosniff',
      });
      if (req.method === 'HEAD') { res.end(); return; }
      const stream = createReadStream(actual);
      stream.on('error', () => res.destroy());
      stream.pipe(res);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT' || (error instanceof Error && error.message === 'Path is outside the workspace.')) fail(404, 'Not found.');
      else fail(500, `This app file could not be read. ${repair}`);
    }
  };
}
