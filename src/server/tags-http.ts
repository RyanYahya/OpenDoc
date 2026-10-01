import type { IncomingMessage, ServerResponse } from 'node:http';
import { readTags, setDocumentStatus, setItemDetails, setItemTags, TagsError } from './tags';

type Send = (res: ServerResponse, value: unknown, status?: number) => void;
type Body = (req: IncomingMessage, limit?: number) => Promise<any>;

function input(value: unknown, keys: string[]) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !keys.includes(key))) throw new TagsError('Invalid tag request. Reload and try again.');
  return value as Record<string, unknown>;
}

/**
 * Workspace tags, called after the server's local-session write guard.
 * - `PUT /api/tags/<kind>/<id>` with `{ tags }` replaces tags typed as one list, where a type
 *   spelling selects the type. With `type` or `status` as well, it is the Details editor: `tags`
 *   are custom tags, and each field given is replaced.
 * - `PUT /api/tags/documents/<id>/status` with `{ status }` sets or (with null) clears a status.
 */
export async function handleTagsRequest(root: string, req: IncomingMessage, res: ServerResponse, url: URL, json: Send, body: Body, changed: () => void): Promise<boolean> {
  if (url.pathname === '/api/tags' && req.method === 'GET') { json(res, await readTags(root)); return true; }
  const status = url.pathname.match(/^\/api\/tags\/documents\/([a-z0-9-]+)\/status$/);
  if (status && req.method === 'PUT') {
    const result = await setDocumentStatus(root, status[1], input(await body(req), ['status']).status);
    changed(); json(res, result); return true;
  }
  // `/api/themes/<id>/tags` predates workspace tags and remains an alias for theme tags.
  const route = url.pathname.match(/^\/api\/tags\/(documents|themes|templates)\/([a-z0-9-]+)$/) ?? url.pathname.match(/^\/api\/(themes)\/([a-z0-9-]+)\/tags$/);
  if (route && req.method === 'PUT') {
    const request = input(await body(req), ['tags', 'type', 'status']);
    const details = 'type' in request || 'status' in request;
    if (!details && !('tags' in request)) throw new TagsError('Invalid tag request. Reload and try again.');
    const result = details ? await setItemDetails(root, route[1], route[2], request) : await setItemTags(root, route[1], route[2], request.tags);
    changed(); json(res, result); return true;
  }
  return false;
}
