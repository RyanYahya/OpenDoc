import { readdir, lstat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { readMedia, mediaFreshness, mediaId, hashBytes } from '../media/files';
import { validId } from './render';
import { documentName, type DocumentState } from '../shared/types';
import type { Materials, MediaItem } from '../shared/media';

/** Files remain the source of truth; this index is disposable and never edits an asset. */
export async function scanMaterials(root: string, documents: DocumentState[]): Promise<Materials> {
  const media: MediaItem[] = [], issues: string[] = [];
  for (const document of documents) {
    if (!validId(document.id)) continue;
    const base = resolve(root, 'documents', document.id);
    const title = documentName(document);
    const owner = { documentId: document.id, documentTitle: title };
    try {
      const folder = resolve(base, 'media');
      const info = await lstat(folder);
      if (info.isSymbolicLink() || !info.isDirectory()) throw new Error('media must be an ordinary folder.');
      for (const dir of (await readdir(folder, { withFileTypes: true })).sort((a,b) => a.name.localeCompare(b.name))) {
        if (dir.name.startsWith('.')) continue;
        if (!dir.isDirectory() || !mediaId.test(dir.name)) { issues.push(`${document.id}/media/${dir.name}: use a media item folder with a lowercase hyphenated name.`); continue; }
        const item: MediaItem = { ...owner, id: dir.name, folder: `documents/${document.id}/media/${dir.name}`, freshness: 'original', usedIn: [], usageKnown: document.status === 'ready' };
        try {
          const asset = readMedia(base, dir.name);
          Object.assign(item, { meta: asset.meta, metadataRevision: hashBytes(Buffer.from(JSON.stringify(asset.meta))), hash: asset.hash, mime: asset.mime, width: asset.width, height: asset.height, bytes: asset.bytes.length }, mediaFreshness(asset));
        } catch (error) { item.error = (error as Error).message; }
        const uses = document.artifact?.media?.filter(use => use.item === dir.name) ?? [];
        item.usedIn = [...new Set(uses.map(use => use.blockId).filter((id): id is string => !!id))].map(blockId => ({ blockId, pages: document.artifact!.pages.flatMap((page,index) => page.fragments.some(fragment => fragment.id === blockId) ? [index+1] : []) }));
        // A bare Media component is still used even without a Figure feedback target.
        if (uses.some(use => !use.blockId)) item.usedIn.push({blockId: '', pages: []});
        media.push(item);
        await new Promise<void>(accept => setImmediate(accept));
      }
    } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') issues.push(`${document.id}: ${(error as Error).message}`); }

  }
  return { media, issues };
}
