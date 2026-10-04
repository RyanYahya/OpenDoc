import type { IncomingMessage, ServerResponse } from 'node:http';
import { assignThemeFolder, createThemeFolder, deleteThemeFolder, readThemeFolders, renameThemeFolder, ThemeFoldersError } from './theme-folders';

type Send = (res: ServerResponse, value: unknown, status?: number) => void;
type Body = (req: IncomingMessage, limit?: number) => Promise<any>;

function only(input: unknown, field: string): Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(key => key !== field)) throw new ThemeFoldersError('Invalid theme organization request. Reload the themes and try again.');
  return input as Record<string, unknown>;
}

/** Single-level theme folders, called after the server's local-session write guard. Theme tags live in tags-http. */
export async function handleThemeFoldersRequest(root: string, req: IncomingMessage, res: ServerResponse, url: URL, json: Send, body: Body, changed: () => void): Promise<boolean> {
  if (url.pathname === '/api/theme-folders') {
    // Legacy tags are served through /api/tags, merged with tags.json.
    if (req.method === 'GET') { const { tags: _legacy, ...manifest } = await readThemeFolders(root); json(res, manifest); return true; }
    if (req.method === 'POST') { const result = await createThemeFolder(root, await body(req)); changed(); json(res, result, 201); return true; }
    return false;
  }
  const folderRoute = url.pathname.match(/^\/api\/theme-folders\/([a-z0-9-]+)$/);
  if (folderRoute && req.method === 'PATCH') { const result = await renameThemeFolder(root, folderRoute[1], await body(req)); changed(); json(res, result); return true; }
  if (folderRoute && req.method === 'DELETE') { const result = await deleteThemeFolder(root, folderRoute[1]); changed(); json(res, result); return true; }
  const themeRoute = url.pathname.match(/^\/api\/themes\/([a-z0-9-]+)\/folder$/);
  if (themeRoute && req.method === 'PUT') {
    const result = await assignThemeFolder(root, themeRoute[1], only(await body(req), 'folderId').folderId);
    changed(); json(res, result); return true;
  }
  return false;
}
