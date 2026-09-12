export type MediaKind = 'photo' | 'illustration' | 'chart' | 'diagram' | 'image';
export interface MediaMeta {
  title: string;
  description: string;
  file: string;
  kind: MediaKind;
  alt?: string;
  sources?: string[]; // Optional provenance notes or locations; interpreted by the author, never opened by OpenDoc.
  data?: string; // Relative to this media folder; the specific data used in the visual.
  recipe?: string; // Relative to this media folder; the script, specification, or prompt.
  attribution?: string;
}
export interface MediaUse { item: string; blockId?: string }
export interface MediaItem {
  documentId: string; documentTitle: string; id: string; folder: string;
  meta?: MediaMeta; metadataRevision?: string; error?: string; hash?: string; mime?: string;
  width?: number; height?: number; bytes?: number;
  freshness: 'original' | 'current' | 'unrecorded' | 'stale';
  changedInputs?: string[];
  usedIn: { blockId: string; pages: number[] }[];
  usageKnown: boolean;
}
export interface Materials { media: MediaItem[]; issues: string[] }
/** Visual grouping never changes files, titles, descriptions, or ownership. */
export function groupMedia(items: MediaItem[]): MediaItem[][] {
  const groups = new Map<string, MediaItem[]>();
  for (const item of items) {
    const key = item.hash && !item.error ? item.hash : `${item.documentId}/${item.id}`;
    const group = groups.get(key) ?? [];
    group.push(item); groups.set(key, group);
  }
  return [...groups.values()];
}
