import { useEffect, useRef, useState } from 'react';
import type { Comment } from '../shared/types';
import { textLang } from '../shared/language';
import { api } from './api';
import { Button } from './ui';
import { Icon } from './ui/Icon';
import { CommentTime } from './CommentTime';
import './deleted-comments.css';

const deletedAt = (comment: Comment) => [...comment.history].reverse().find(event => event.action === 'deleted')?.at ?? comment.updatedAt;

/** Deleted feedback stays restorable after its Undo toast is gone; the server offers the last 90 days. */
export function DeletedComments({ documentId, blockId, connected, refreshKey, onRestored, onError }: {
  documentId: string;
  /** Limit the list to one component while the dock is filtered to it. */
  blockId?: string | null;
  connected: boolean;
  /** Any value that changes when comments change, so the list follows deletions and restores. */
  refreshKey: unknown;
  onRestored: (comments: Comment[]) => void;
  onError: (message: string) => void;
}) {
  const [rows, setRows] = useState<Comment[]>([]);
  const [open, setOpen] = useState(false);
  const [restoring, setRestoring] = useState<string | null>(null);
  const request = useRef(0);
  useEffect(() => {
    const sequence = ++request.current;
    const controller = new AbortController();
    api<Comment[]>(`/api/documents/${documentId}/comments?status=deleted`, { signal: controller.signal })
      .then(value => { if (sequence === request.current) setRows(value); })
      .catch(() => { /* The main comment list reports connection problems. */ });
    return () => controller.abort();
  }, [documentId, refreshKey]);
  const visible = rows.filter(comment => !blockId || comment.blockId === blockId);
  if (!visible.length) return null;
  async function restore(comment: Comment) {
    if (restoring || !connected) return;
    setRestoring(comment.id);
    try {
      onRestored(await api<Comment[]>(`/api/documents/${documentId}/comments/${comment.id}/restore`, { method: 'POST', body: JSON.stringify({ version: comment.version }) }));
      setRows(current => current.filter(row => row.id !== comment.id));
    } catch (error) { onError((error as Error).message); }
    finally { setRestoring(null); }
  }
  return <section className="deleted-comments" aria-label="Recently deleted comments">
    <Button static className="deleted-comments-toggle" aria-expanded={open} aria-controls="deleted-comments-list" onClick={() => setOpen(value => !value)}>
      <Icon name={open ? 'down' : 'right'} size={12} /><span>Recently deleted</span><span className="deleted-comments-count">{visible.length}</span>
    </Button>
    {open && <ul id="deleted-comments-list" className="deleted-comments-list">
      {visible.map(comment => <li key={comment.id}>
        <div className="deleted-comment-body">
          <span className="comment-location">Deleted <CommentTime value={deletedAt(comment)} /></span>
          <span className="comment-text" dir="auto" lang={textLang(comment.text)}>{comment.text}</span>
        </div>
        <Button className="deleted-comment-restore" disabled={!connected || !!restoring} onClick={() => void restore(comment)}>{restoring === comment.id ? 'Restoring…' : 'Restore'}</Button>
      </li>)}
      <li className="deleted-comments-note">Deleted comments can be restored for 90 days. Their history is kept.</li>
    </ul>}
  </section>;
}
