import type { MediaUse } from './media';
import type { AssetUse, DocumentAssets, SelectedAsset } from './assets';
import type { DocumentSelection, ManualEditSummary, TextAnchor, TextTarget } from './selection';
/** Optional descriptive label chosen by the author, not a document taxonomy. */
export type DocumentKind = string;
export type DocumentFormat = 'document' | 'presentation';
export interface SlideInfo { id: string }
export interface DocumentMeta { title: string; description: string; kind?: DocumentKind; theme: string; author?: string }
export interface SourceLocation { file: string; line: number; column: number }
export interface BlockInfo { slideId?: string; id: string; kind: string; source?: SourceLocation; text: string }
export interface Fragment { id: string; x: number; y: number; width: number; height: number }
export interface PageInfo { width: number; height: number; fragments: Fragment[] }
export interface DocumentProvenance { entry: string; template?: string; dataFile?: string }
export interface ReviewIssue { code: string; severity: 'error' | 'warning'; message: string; page?: number; blockId?: string }
export interface OutlineEntry { id: string; title: string; level: number; page: number }
export interface RenderArtifact { format?: DocumentFormat; slides?: SlideInfo[]; textTargets?: TextTarget[]; media?: MediaUse[]; assets?: AssetUse[]; assetBindings?: DocumentAssets; assetDependencies?: string[]; meta: DocumentMeta; blocks: Record<string, BlockInfo>; pages: PageInfo[]; hash: string; renderedAt: string; provenance?: DocumentProvenance; issues?: ReviewIssue[]; outline?: OutlineEntry[] }
export interface TextEditPreview { artifact: RenderArtifact; pdfUrl: string }
/** JSON restores a plain object, so valid IDs such as "constructor" need an own-property lookup. */
export function getBlock(artifact: RenderArtifact | null | undefined, id: string | null | undefined): BlockInfo | undefined {
  if (!artifact || typeof id !== 'string' || !Object.hasOwn(artifact.blocks, id)) return undefined;
  return artifact.blocks[id];
}
export interface DocumentState { format?: DocumentFormat; id: string; name?: string; projectId?: string | null; status: 'rendering' | 'ready' | 'error'; error?: string; revision: number; artifact?: RenderArtifact; manualEdit?: ManualEditSummary }
/** Browsing needs metadata and paper sizes, not text targets or layout fragments. */
export type ArtifactSummary = Pick<RenderArtifact, 'meta' | 'hash' | 'renderedAt' | 'format'> & { pages: Pick<PageInfo, 'width' | 'height'>[] };
export type DocumentSummary = Omit<DocumentState, 'artifact'> & { artifact?: ArtifactSummary };
export function summarizeDocument(state: DocumentState): DocumentSummary {
  const { artifact, ...summary } = state;
  return { ...summary, ...(artifact ? { artifact: { format: artifact.format, meta: artifact.meta, hash: artifact.hash, renderedAt: artifact.renderedAt, pages: artifact.pages.map(({ width, height }) => ({ width, height })) } } : {}) };
}
export function documentFormat(document: DocumentSummary): DocumentFormat { return document.format ?? document.artifact?.format ?? 'document'; }
export function documentName(document: DocumentSummary) { return document.name ?? document.artifact?.meta.title ?? document.id; }
export interface Comment {
  id: string; blockId: string; text: string; quote: string; status: 'open' | 'resolved' | 'deleted';
  anchor?: TextAnchor;
  createdAt: string; updatedAt: string; version: number;
  history: { at: string; action: 'created' | 'resolved' | 'reopened' | 'edited' | 'deleted'; previousText?: string }[];
}
export interface WorkspaceContext { selectedAsset?: SelectedAsset | null; selection?: DocumentSelection | null; editing?: boolean; pendingEdits?: number; draftPreview?: boolean; themeId?: string | null; projectId?: string | null; mediaId?: string | null; documentId: string | null; blockId: string | null; page: number; updatedAt?: string }
