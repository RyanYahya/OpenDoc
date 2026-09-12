import { documentName, documentFormat, type DocumentSummary } from "../shared/types";
import { DocumentMenu, type DocumentActionHandler } from './DocumentActions';
import { CoverPreview } from "./Pdf";
import { Button, IconButton } from "./ui";
import { Icon } from "./ui/Icon";
import type { DocumentView } from './DocumentViewControl';

// Base UI owns the card interaction; PDF.js renders the actual document cover.
export function DocumentCard({
  document,
  view = 'gallery',
  onOpen,
  onAction,
  disabled,
}: {
  document: DocumentSummary;
  view?: DocumentView;
  onOpen: () => void;
  onAction: DocumentActionHandler;
  disabled?: boolean;
}) {
  const { id, artifact, status } = document;
  const titleId = `document-title-${id}`;
  const presentation = documentFormat(document) === 'presentation';
  const pageCount = artifact?.pages.length ?? 0;
  const cover = artifact?.pages[0];
  const portrait = cover ? cover.height > cover.width : !presentation;
  const statusId = `document-status-${id}`;
  const statusLabel = status === 'ready'
    ? `${pageCount} ${presentation ? 'slide' : 'page'}${pageCount === 1 ? '' : 's'}`
    : status === 'error' ? 'Needs attention' : 'Rendering…';
  return (
    <div className="document-card-wrap"><Button
      static
      className={`document-card ${view === 'list' ? 'document-card-list' : ''}`}
      onClick={onOpen}
      aria-labelledby={titleId}
      aria-describedby={statusId}
    >
      <div
        className={`card-paper${portrait ? ' card-paper-portrait' : ''}`}
      >
        <CoverPreview format={documentFormat(document)} id={id} artifact={artifact} compact={view === 'list'} />
        {view === 'gallery' && <span id={statusId} className="card-preview-status">{statusLabel}</span>}
      </div>
      <h2 id={titleId} title={documentName(document)}>{documentName(document)}</h2>
      {view === 'list' && <span id={statusId} className="card-meta">{statusLabel}</span>}
    </Button><IconButton className="document-history-trigger" label={`Previous exports for ${documentName(document)}`} disabled={disabled} onClick={() => onAction(document, 'exports')}><Icon name="history" size={14} /></IconButton><DocumentMenu document={document} onAction={onAction} disabled={disabled} /></div>
  );
}
