import { useEffect, useRef, useState } from 'react';
import { documentName, formatLabel, type DocumentSummary } from '../shared/types';
import { textLang } from '../shared/language';
import { briefExcerpt, dismissHandoff, type PendingHandoff } from './pendingHandoffs';
import { CommentTime } from './CommentTime';
import { Button, IconButton } from './ui';
import { Icon } from './ui/Icon';
import './handoffs.css';

/**
 * Creation prompts copied for the user's agent, shown where the work will land until it does.
 * Arrival is detected from the workspace's live document list; the agent itself is never contacted.
 */
export function PendingHandoffs({ handoffs, documents, now, showProject = false }: {
  handoffs: PendingHandoff[]; documents: DocumentSummary[]; now: number;
  /** Library pages span projects, so each card names its destination. */
  showProject?: boolean;
}) {
  const list = useRef<HTMLUListElement>(null);
  const [status, setStatus] = useState('');
  if (!handoffs.length) return <span className="sr-only" role="status">{status}</span>;
  function dismiss(handoff: PendingHandoff) {
    // Keep keyboard focus in the list, or hand it to the page's Create action when the list empties.
    const cards = [...list.current?.querySelectorAll<HTMLElement>('.handoff-card') ?? []];
    const index = cards.findIndex(card => card.dataset.handoff === handoff.id);
    const next = cards[index + 1] ?? cards[index - 1];
    dismissHandoff(handoff.id);
    setStatus('Dismissed.');
    requestAnimationFrame(() => (next ?? document.querySelector<HTMLElement>('.library-heading .primary'))?.focus());
  }
  return <section className="handoff-pending" aria-label="Waiting for your agent">
    <ul ref={list}>{handoffs.map(handoff => <HandoffCard key={handoff.id} handoff={handoff} now={now} showProject={showProject} onDismiss={() => dismiss(handoff)} onStatus={setStatus}
      document={handoff.documentId ? documents.find(document => document.id === handoff.documentId) : undefined} />)}</ul>
    <span className="sr-only" role="status">{status}</span>
  </section>;
}

function HandoffCard({ handoff, document, now, showProject, onDismiss, onStatus }: {
  handoff: PendingHandoff; document?: DocumentSummary; now: number; showProject: boolean; onDismiss: () => void; onStatus: (text: string) => void;
}) {
  const [copied, setCopied] = useState(false);
  const [manual, setManual] = useState(false);
  const field = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 4000);
    return () => window.clearTimeout(timer);
  }, [copied]);
  useEffect(() => { if (manual) { field.current?.focus(); field.current?.select(); } }, [manual]);
  async function copy() {
    try { await navigator.clipboard.writeText(handoff.prompt); setCopied(true); setManual(false); onStatus('Prompt copied. Paste it into your agent.'); }
    catch { setManual(true); }
  }
  const ready = Boolean(document);
  const excerpt = briefExcerpt(handoff.brief);
  const details = [formatLabel(handoff.format), handoff.themeName, handoff.templateName && `${handoff.templateName} template`, showProject && (handoff.projectName ?? 'Project to be chosen')].filter(Boolean) as string[];
  const titleId = `handoff-title-${handoff.id}`;
  return <li className="handoff-card" data-handoff={handoff.id} data-state={ready ? 'ready' : 'waiting'} tabIndex={-1} aria-labelledby={titleId}>
    <span className="handoff-card-mark" aria-hidden="true">{ready ? <Icon name="check" size={14} /> : <span className="handoff-card-pulse" />}</span>
    <div className="handoff-card-body">
      <p className="handoff-card-status" id={titleId}>{ready && document
        ? <>Ready: <bdi lang={textLang(documentName(document), document.language)}>{documentName(document)}</bdi></>
        : 'Waiting for your agent'}</p>
      {!ready && <p className="handoff-card-brief" dir="auto" lang={textLang(excerpt)}>{excerpt || `A new ${handoff.format} with no brief`}</p>}
      <p className="handoff-card-meta">{ready ? 'It updates here as your agent works' : details.map((detail, index) => <span key={detail}>{index > 0 && <span aria-hidden="true"> · </span>}<bdi>{detail}</bdi></span>)}<span aria-hidden="true"> · </span>{ready ? 'Arrived ' : 'Copied '}<CommentTime value={new Date(handoff.resolvedAt ?? handoff.copiedAt).toISOString()} now={now} /></p>
      {manual && <>
        <p className="comment-error" role="alert">Copying isn’t available here. Select the prompt and copy it manually.</p>
        <textarea ref={field} className="prompt-example handoff-card-prompt" aria-label="Prompt for your agent" readOnly rows={6} value={handoff.prompt} />
      </>}
    </div>
    <div className="handoff-card-actions">
      {ready && document ? <Button className="primary handoff-open" render={<a href={`#document/${document.id}`} />} nativeButton={false} onClick={() => dismissHandoff(handoff.id)}>Open</Button>
        : <Button className="text-button" onClick={() => void copy()}><Icon name={copied ? 'check' : 'copy'} size={14} />{copied ? 'Copied' : 'Copy prompt again'}</Button>}
      <IconButton label="Dismiss" onClick={onDismiss}><Icon name="close" size={15} /></IconButton>
    </div>
  </li>;
}
