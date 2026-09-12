import { useEffect, useRef, type Ref } from 'react';
import type { Comment } from '../shared/types';
import { Button, IconButton } from './ui';
import { Icon } from './ui/Icon';
import './comment-dock.css';

export interface CommentDockItem {
  comment: Comment;
  page?: number;
  kind: string;
  canJump: boolean;
}

export interface CommentDockProps {
  pageLabel?: string;
  open: boolean;
  heading: string;
  count: number;
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
  onOpen: () => void;
  onClose: () => void;
  triggerRef?: Ref<HTMLButtonElement>;
}

/** The reader owns selection, drafts, and writes; this dock only presents them. */
export function CommentDock({
  pageLabel = 'Page',
  open, heading, count, items, error, connected, changing, editing,
  onEdit, onEditText, onSaveEdit, onCancelEdit, onDelete, onJump, onOpen, onClose,
  triggerRef,
}: CommentDockProps) {
  const editField = useRef<HTMLTextAreaElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const busy = changing !== null;

  useEffect(() => {
    if (!open) return;
    const field = editing ? editField.current : closeButton.current;
    field?.focus({ preventScroll: true });
  }, [open, editing?.id]);

  useEffect(() => {
    if (!open) return;
    const dismiss = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      onClose();
    };
    document.addEventListener('keydown', dismiss);
    return () => document.removeEventListener('keydown', dismiss);
  }, [open, onClose]);

  return <>
    <Button static ref={triggerRef} className="comment-dock-trigger" aria-label="Show comments" aria-controls="reader-comments" aria-expanded={open} onClick={open ? onClose : onOpen}>
      <Icon name="comment" size={17} /><span className="comment-dock-count" aria-hidden="true">{count}</span>
    </Button>
    {open && <section className="correction-editor comment-popover comment-dock-panel" id="reader-comments" role="dialog" aria-modal="false" aria-labelledby="comment-dock-heading" onKeyDown={event => {
      if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
        const form = (event.target as HTMLElement).closest('form');
        if (form) { event.preventDefault(); if (!busy) form.requestSubmit(); }
      }
    }}>
      <div className="correction-heading">
        <h2 id="comment-dock-heading">{heading}</h2>
        <IconButton ref={closeButton} label="Close comments" onClick={onClose}><Icon name="close" size={15} /></IconButton>
      </div>
      <div className="comment-dock-content">
        {error && <p className="comment-error" role="alert">{error}</p>}
        {items.length ? items.map(({ comment, page, kind, canJump }) => <article className={`comment-card ${comment.status}`} key={comment.id}>
          {editing?.id === comment.id ? <form onSubmit={event => {
            event.preventDefault();
            if (!connected || busy || !editing.text.trim() || editing.text.trim() === comment.text) return;
            void onSaveEdit(comment);
          }}>
            <textarea ref={editField} aria-label="Edit comment" value={editing.text} maxLength={8000} readOnly={busy} onChange={event => onEditText(event.target.value)} />
            <div className="correction-actions">
              <Button disabled={busy} onClick={onCancelEdit}>Cancel</Button>
              <Button className="primary" type="submit" disabled={!connected || busy || !editing.text.trim() || editing.text.trim() === comment.text}>{changing === comment.id ? 'Saving…' : 'Save'}</Button>
            </div>
          </form> : <div className="comment-row">
            <Button static className="comment-jump" disabled={!canJump || busy} onClick={() => onJump(comment)}>
              <span className="comment-location">
                {page !== undefined ? <><span>{pageLabel} {page}</span><span aria-hidden="true">·</span><span className="comment-kind">{kind}</span>{canJump && <Icon name="arrow" size={12} />}</> : 'Component unavailable'}
                {comment.status === 'resolved' && <span>· Resolved</span>}
              </span>
              <span className="comment-text">{comment.text}</span>
            </Button>
            <div className="comment-row-actions">
              <IconButton label="Edit comment" disabled={!connected || busy} onClick={() => onEdit(comment)}><Icon name="edit" size={15} /></IconButton>
              <IconButton label={changing === comment.id ? 'Deleting comment…' : 'Delete comment'} className="delete-comment" disabled={!connected || busy} onClick={() => { void onDelete(comment); }}><Icon name="trash" size={15} /></IconButton>
            </div>
          </div>}
        </article>) : <p className="no-comments">No comments here yet.</p>}
      </div>
    </section>}
  </>;
}
