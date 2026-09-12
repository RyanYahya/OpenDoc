import { useEffect, useState } from 'react';
import type { RenderArtifact } from '../shared/types';
import { usePdf } from './Pdf';

type Preview = { artifact?: RenderArtifact; pdfUrl?: string };

/** Keep the last complete PDF and its geometry together while the next loads. */
export function useReaderPreview(id: string, next: Preview) {
  const [shown, setShown] = useState(next);
  const loading = usePdf(id, next.artifact?.hash, true, 'documents', next.pdfUrl);
  const previous = usePdf(id, shown.artifact?.hash, true, 'documents', shown.pdfUrl);
  useEffect(() => {
    if (loading.pdf) setShown(next);
  }, [loading.pdf, next.artifact, next.pdfUrl]);
  const error = loading.error;
  return loading.pdf
    ? { pdf: loading.pdf, artifact: next.artifact, error: '', loading: false, retry: loading.retry }
    : { pdf: previous.pdf, artifact: shown.artifact, error, loading: !error, retry: loading.retry };
}
