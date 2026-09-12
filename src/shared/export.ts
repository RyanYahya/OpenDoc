import type { AssetUse, DocumentAssets } from './assets';

export type ExportFormat = 'pdf' | 'pptx';
export const exportFormats = {
  pdf: { label: 'PDF', extension: '.pdf', mime: 'application/pdf' },
  pptx: { label: 'PowerPoint', extension: '.pptx', mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' },
} as const;
export function exportInfo(format: ExportFormat = 'pdf') { return exportFormats[format]; }

export interface SavedExport {
  id: string;
  documentId: string;
  hash: string;
  filename: string;
  path: string;
  bytes: number;
  createdAt: string;
  /** Older receipts are PDF exports. */
  format?: ExportFormat;
  /** Captured from the published artifact. Missing on older receipts means unknown. */
  assetBindings?: DocumentAssets;
  assets?: AssetUse[];
}

export function suggestedExportName(title: string, format: ExportFormat = 'pdf') {
  const cleaned = title.replace(/\.(pdf|pptx)$/i, '').replace(/[<>:"/\\|?*\u0000-\u001f\u007f]/g, '-').replace(/^[. ]+|[. ]+$/g, '').trim();
  let name = Array.from(cleaned).slice(0, 90).join('');
  while (new TextEncoder().encode(name).length > 180) name = Array.from(name).slice(0, -1).join('');
  if (!name || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name)) name = `Document${name ? ` ${name}` : ''}`;
  return name + exportInfo(format).extension;
}
export const suggestedPdfName = (title: string) => suggestedExportName(title);

export interface ExportHistoryEntry extends SavedExport { available: boolean }
