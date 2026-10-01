import type { IncomingMessage, ServerResponse } from 'node:http';
import { assignThemeFolder, createThemeFolder, deleteThemeFolder, readThemeFolders, setThemeTags, ThemeFoldersError, updateThemeFolder } from './theme-folders';

type Send = (res: ServerResponse, value: unknown, status?: number) => void;
type Body = (req: IncomingMessage, limit?: number) => Promise<any>;

function only(input: unknown, field: string): Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(key => key !== field)) throw new ThemeFoldersError('Invalid theme organization request. Reload the themes and try again.');
  return input as Record<string, unknown>;
}

/** Theme folders and tags, called after the server's local-session write guard. */
export async function handleThemeFoldersRequest(root: string, req: IncomingMessage, res: ServerResponse, url: URL, json: Send, body: Body, changed: () => void): Promise<boolean> {
  if (url.pathname === '/api/theme-folders') {
    if (req.method === 'GET') { json(res, await readThemeFolders(root)); return true; }
    if (req.method === 'POST') { const result = await createThemeFolder(root, await body(req)); changed(); json(res, result, 201); return true; }
    return false;
  }
  const folderRoute = url.pathname.match(/^\/api\/theme-folders\/([a-z0-9-]+)$/);
  if (folderRoute && req.method === 'PATCH') { const result = await updateThemeFolder(root, folderRoute[1], await body(req)); changed(); json(res, result); return true; }
  if (folderRoute && req.method === 'DELETE') { const result = await deleteThemeFolder(root, folderRoute[1]); changed(); json(res, result); return true; }
  const themeRoute = url.pathname.match(/^\/api\/themes\/([a-z0-9-]+)\/(folder|tags)$/);
  if (themeRoute && req.method === 'PUT') {
    const [, id, field] = themeRoute;
    const input = only(await body(req), field === 'folder' ? 'folderId' : 'tags');
    const result = field === 'folder' ? await assignThemeFolder(root, id, input.folderId) : await setThemeTags(root, id, input.tags);
    changed(); json(res, result); return true;
  }
  return false;
}
