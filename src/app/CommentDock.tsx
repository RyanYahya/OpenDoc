import { useEffect, useRef, type ReactNode, type Ref } from 'react';
import type { Comment } from '../shared/types';
import { textLang } from '../shared/language';
import { Button, IconButton } from './ui';
import { Icon } from './ui/Icon';
import { CommentHandoff } from './CommentHandoff';
import { CommentTime } from './CommentTime';
import './comment-dock.css';

export interface CommentDockItem {
  comment: Comment;
  page?: number;
  kind: string;
  canJump: boolean;
  /** The phrase a phrase comment is about. */
  quote?: string;
  /** The phrase's wording changed and it could not be located again. */
  textChanged?: boolean;
}

export interface CommentDockProps {
  pageLabel?: string;
  /** True when the list shows one component's comments instead of the whole document's. */
  filtered?: boolean;
  /** Open comments across the document, which the agent prompt asks to apply. */
  openCount?: number;
  agentPrompt?: string;
  heading: string;
  items: CommentDockItem[];
  error?: string;
  connected: boolean;
  changing: string | null;
  editing: { id: string; text: string } | null;
  onEdit: (comment: Comment) => void;
  onEditText: (text: string) => void;
  onSaveEdit: (comment: Comment) => void | Promise<void>;
  onCancelEdit: () => void;
  onDelete: (comment: Comment) => void | Promise<void>;
  onJump: (comment: Comment) => void;
  /** Return from one component's comments to the whole document's. */
  onShowAll: () => void;
  onClose: () => void;
  /** Extra content after the list, such as recently deleted comments. */
  footer?: ReactNode;
}

/** The floating button that opens the side panel's Comments tab, with the open-comment count. */
export function CommentsButton({ count, expanded, onClick, triggerRef }: { count: number; expanded: boolean; onClick: () => void; triggerRef?: Ref<HTMLButtonElement> }) {
  return <Button static ref={triggerRef} className="comment-dock-trigger" aria-label={`Comments, ${count} open`} aria-controls="reader-panel" aria-expanded={expanded} onClick={onClick}>
    <Icon name="comment" size={17} /><span className="comment-dock-count" aria-hidden="true">{count}</span>
  </Button>;
}

/** The Comments tab of the side panel. The reader owns selection, drafts, and writes; this list only presents them. */
export function CommentDock({
  pageLabel = 'Page',
  filtered = false, openCount = 0, agentPrompt,
  heading, items, error, connected, changing, editing,
  onEdit, onEditText, onSaveEdit, onCancelEdit, onDelete, onJump, onShowAll, onClose,
  footer,
}: CommentDockProps) {
  const editField = useRef<HTMLTextAreaElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const busy = changing !== null;

  useEffect(() => { headingRef.current?.focus({ preventScroll: true }); }, [filtered]);
  useEffect(() => { if (editing) editField.current?.focus({ preventScroll: true }); }, [editing?.id]);

  useEffect(() => {
    const dismiss = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      // Escape leaves a comment being edited first, then closes the panel.
      if (editing) onCancelEdit(); else onClose();
    };
    document.addEventListener('keydown', dismiss);
    return () => document.removeEventListener('keydown', dismiss);
  }, [editing, onCancelEdit, onClose]);

  return <section className="comment-popover comment-dock-panel" aria-labelledby="comment-dock-heading" onKeyDown={event => {
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      const form = (event.target as HTMLElement).closest('form');
      if (form) { event.preventDefault(); if (!busy) form.requestSubmit(); }
    }
  }}>
    <div className="reader-panel-heading">
      {filtered && <IconButton label="All comments" className="reader-panel-back" onClick={onShowAll}><Icon name="left" size={15} /></IconButton>}
      <h2 id="comment-dock-heading" ref={headingRef} tabIndex={-1}>{heading}</h2>
    </div>
    <div className="comment-dock-content">
      {error && <p className="comment-error" role="alert">{error}</p>}
      {items.length ? items.map(({ comment, page, kind, canJump, quote, textChanged }) => <article className={`comment-card ${comment.status}`} key={comment.id} data-comment-id={comment.id}>
        {editing?.id === comment.id ? <form onSubmit={event => {
          event.preventDefault();
          if (!connected || busy || !editing.text.trim() || editing.text.trim() === comment.text) return;
          void onSaveEdit(comment);
        }}>
          <textarea ref={editField} dir="auto" lang={textLang(editing.text)} aria-label="Edit comment" value={editing.text} maxLength={8000} readOnly={busy} onChange={event => onEditText(event.target.value)} />
          <div className="correction-actions">
            <Button disabled={busy} onClick={onCancelEdit}>Cancel</Button>
            <Button className="primary" type="submit" disabled={!connected || busy || !editing.text.trim() || editing.text.trim() === comment.text}>{changing === comment.id ? 'Saving…' : 'Save'}</Button>
          </div>
        </form> : <div className="comment-row">
          <Button static className="comment-jump" disabled={!canJump || busy} onClick={() => onJump(comment)}>
            <span className="comment-location">
              {page !== undefined ? <><span>{pageLabel} {page}</span><span aria-hidden="true">·</span><span className="comment-kind">{kind}</span>{canJump && <Icon name="arrow" size={12} />}</> : 'Component unavailable'}
              <span className="comment-status">{comment.status === 'resolved' ? <><Icon name="check" size={11} />Resolved</> : 'Open'}</span>
              <CommentTime value={comment.createdAt} />
            </span>
            {quote && <span className="comment-quote">on “<bdi dir="auto" lang={textLang(quote)}>{quote}</bdi>”{textChanged && <span className="comment-anchor-changed"><span aria-hidden="true">·</span> Text changed</span>}</span>}
            <span className="comment-text" dir="auto" lang={textLang(comment.text)}>{comment.text}</span>
          </Button>
          <div className="comment-row-actions">
            <IconButton label="Edit comment" disabled={!connected || busy} onClick={() => onEdit(comment)}><Icon name="edit" size={15} /></IconButton>
            <IconButton label={changing === comment.id ? 'Deleting comment…' : 'Delete comment'} className="delete-comment" disabled={!connected || busy} onClick={() => { void onDelete(comment); }}><Icon name="trash" size={15} /></IconButton>
          </div>
        </div>}
      </article>) : <div className="no-comments">
        <p><strong>{filtered ? 'No comments here yet' : 'No comments yet'}</strong></p>
        <p>{filtered ? 'Choose Comment in the selection bar to add one.' : `Select a component on the ${pageLabel.toLowerCase()}, or drag across words to choose a phrase, then choose Comment in the selection bar.`} Your agent applies open comments and marks them resolved.</p>
      </div>}
      {footer}
    </div>
    {openCount > 0 && agentPrompt && <CommentHandoff openCount={openCount} prompt={agentPrompt} />}
  </section>;
}
