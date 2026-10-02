import { documentName, documentFormat, formatLabel, pageUnit, type DocumentSummary } from "../shared/types";
import { DocumentMenu, type DocumentActionHandler } from './DocumentActions';
import { CoverPreview } from "./CoverPreview";
import { Icon } from "./ui/Icon";
import type { DocumentView } from './DocumentViewControl';
import { StatusBadge, useDocumentDetails } from './Tags';
import { typeLabel } from '../shared/tags';
import { textLang } from '../shared/language';

/**
 * The title is a real link, so a card opens in a new tab and its address can be copied; the link
 * stretches over the whole card while the heading stays outside any button. The cover is the
 * actual first page, rendered by the service.
 */
export function DocumentCard({
  document,
  view = 'gallery',
  onAction,
  disabled,
}: {
  document: DocumentSummary;
  view?: DocumentView;
  onAction: DocumentActionHandler;
  disabled?: boolean;
}) {
  const { id, artifact, status } = document;
  const titleId = `document-title-${id}`;
  const format = documentFormat(document);
  const presentation = format === 'presentation';
  const pageCount = artifact?.pages.length ?? 0;
  const cover = artifact?.pages[0];
  const portrait = cover ? cover.height > cover.width : !presentation;
  const statusId = `document-status-${id}`;
  const formatId = `document-format-${id}`;
  const typeId = `document-type-${id}`;
  const badgeId = `document-badge-${id}`;
  // Type and status come from workspace tags; custom tags stay in Details.
  const { type, status: workStatus } = useDocumentDetails(id);
  const statusLabel = status === 'ready'
    ? `${pageCount} ${pageUnit(format, pageCount)}`
    : status === 'error' ? 'Needs attention' : 'Rendering…';
  const name = documentName(document);
  return (
    <div className="document-card-wrap"><div className={`document-card ${view === 'list' ? 'document-card-list' : ''}`}>
      <div
        className={`card-paper${portrait ? ' card-paper-portrait' : ''}`}
      >
        <CoverPreview format={documentFormat(document)} id={id} artifact={artifact} compact={view === 'list'} />
        {view === 'gallery' && <span id={statusId} className="card-preview-status">{statusLabel}</span>}
      </div>
      {/* The heading stays start-aligned with the grid; only the title's own words take their direction. */}
      <h2 id={titleId} title={name}>
        <a className="document-card-link" href={`#document/${id}`}
          aria-labelledby={`${titleId} ${formatId}`}
          aria-describedby={[statusId, type && typeId, workStatus && badgeId].filter(Boolean).join(' ')}
        ><bdi dir="auto" lang={textLang(name, document.language)}>{name}</bdi></a>
      </h2>
      {/* Same-titled documents and presentations stay distinguishable by sight and by name. */}
      <span className="card-meta"><span id={formatId} className="card-format"><Icon name={presentation ? 'monitor' : 'document'} size={14} />{formatLabel(format)}</span>{type && <span id={typeId} className="card-type">{typeLabel(type)}</span>}{view === 'list' && <span id={statusId}>{statusLabel}</span>}<StatusBadge status={workStatus} id={badgeId} /></span>
    </div><DocumentMenu document={document} onAction={onAction} disabled={disabled} /></div>
  );
}
