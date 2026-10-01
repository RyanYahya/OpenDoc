import type { IncomingMessage, ServerResponse } from 'node:http';
import { readTags, setItemTags, TagsError } from './tags';

type Send = (res: ServerResponse, value: unknown, status?: number) => void;
type Body = (req: IncomingMessage, limit?: number) => Promise<any>;

function tagsInput(input: unknown) {
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(key => key !== 'tags')) throw new TagsError('Invalid tag request. Reload and try again.');
  return (input as { tags?: unknown }).tags;
}

/** Workspace tags, called after the server's local-session write guard. */
export async function handleTagsRequest(root: string, req: IncomingMessage, res: ServerResponse, url: URL, json: Send, body: Body, changed: () => void): Promise<boolean> {
  if (url.pathname === '/api/tags' && req.method === 'GET') { json(res, await readTags(root)); return true; }
  // `/api/themes/<id>/tags` predates workspace tags and remains an alias for theme tags.
  const route = url.pathname.match(/^\/api\/tags\/(documents|themes|templates)\/([a-z0-9-]+)$/) ?? url.pathname.match(/^\/api\/(themes)\/([a-z0-9-]+)\/tags$/);
  if (route && req.method === 'PUT') {
    const result = await setItemTags(root, route[1], route[2], tagsInput(await body(req)));
    changed(); json(res, result); return true;
  }
  return false;
}
