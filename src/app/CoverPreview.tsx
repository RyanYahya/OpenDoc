import { useRef, useState, type CSSProperties } from 'react';
import type { ArtifactSummary } from '../shared/types';
import { Icon } from './ui/Icon';
import { useNearViewport } from './nearViewport';

// Positioned like the PDF page it replaces, so the page covers the frame's inset edge line.
const coverImage: CSSProperties = { display: 'block', position: 'relative', width: '100%', height: '100%' };
const loadingImage: CSSProperties = { display: 'none' };

/** A library card's first page: an image the service renders once per PDF, without loading PDF.js. */
export function CoverPreview({
  format = 'document',
  id,
  artifact,
  compact = false,
}: {
  id: string;
  artifact?: ArtifactSummary;
  format?: 'document' | 'presentation';
  compact?: boolean;
}) {
  const cover = useRef<HTMLDivElement>(null);
  const nearby = useNearViewport(cover, `${id}:${artifact?.hash}`, "320px 0px");
  const source = artifact?.hash ? `/api/documents/${encodeURIComponent(id)}/cover?hash=${encodeURIComponent(artifact.hash)}` : '';
  const [result, setResult] = useState<{ source: string; failed: boolean }>();
  const loaded = !!source && result?.source === source && !result.failed;
  const failed = !!source && result?.source === source && result.failed;
  const page = artifact?.pages[0] ?? (format === 'presentation' ? {width:960,height:540} : undefined);
  return (
    <div
      ref={cover}
      className="cover-preview"
      aria-hidden="true"
      style={{ '--cover-ratio': (page?.width ?? 595.28) / (page?.height ?? 841.89), aspectRatio: `${page?.width ?? 595.28} / ${page?.height ?? 841.89}`, width: compact ? Math.min(40, 56 * (page?.width ?? 595.28) / (page?.height ?? 841.89)) : undefined } as CSSProperties}
    >
      {nearby && source && !failed && <img src={source} alt="" decoding="async" style={loaded ? coverImage : loadingImage}
        onLoad={() => setResult({ source, failed: false })} onError={() => setResult({ source, failed: true })} />}
      {!loaded && (
        <div className="cover-placeholder">
          {compact ? <Icon name="document" size={18} /> : failed ? "Preview unavailable" : "Preparing preview…"}
        </div>
      )}
    </div>
  );
}
