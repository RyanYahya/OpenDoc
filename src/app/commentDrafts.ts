import type { DocumentSelection } from "../shared/selection";

/** Range drafts must not silently move to another phrase in the same paragraph. */
export function commentDraftKey(selection: DocumentSelection | null) {
  if (!selection) return "";
  return selection.quote ? JSON.stringify([selection.blockId, selection.targetId ?? null, selection.start ?? null, selection.end ?? null, selection.quote]) : selection.blockId;
}

/** Component feedback follows its text slot while an edit preview changes the wording. */
export function componentCommentDraftKey(selection: DocumentSelection | null) {
  return selection ? JSON.stringify(['component', selection.blockId, selection.targetId ?? null]) : '';
}

export type CommentDrafts = Readonly<Record<string, string>>;
type DraftStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

// The browser session is the boundary: drafts stay local and expire with the tab.
export function createCommentDraftStore(storage: () => DraftStorage | undefined = () => window.sessionStorage) {
  const memory = new Map<string, CommentDrafts>();
  const key = (documentId: string) => `opendoc:comment-drafts:${documentId}`;

  function read(documentId: string): CommentDrafts {
    const cached = memory.get(documentId);
    if (cached) return cached;
    const drafts: Record<string, string> = Object.create(null);
    try {
      const saved = storage()?.getItem(key(documentId));
      const parsed: unknown = saved ? JSON.parse(saved) : null;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        for (const [blockId, value] of Object.entries(parsed)) {
          if (typeof value === 'string' && value.length > 0 && value.length <= 8000) drafts[blockId] = value;
        }
      }
    } catch {
      // Unavailable storage and malformed saved data must not interrupt writing.
    }
    memory.set(documentId, drafts);
    return drafts;
  }

  function set(documentId: string, blockId: string, value: string): CommentDrafts {
    const drafts: Record<string, string> = Object.assign(Object.create(null), read(documentId));
    if (value === '') delete drafts[blockId];
    else drafts[blockId] = value;
    memory.set(documentId, drafts);
    try {
      const target = storage();
      if (Object.keys(drafts).length) target?.setItem(key(documentId), JSON.stringify(drafts));
      else target?.removeItem(key(documentId));
    } catch {
      // Keep the in-memory copy authoritative if the browser cannot persist it.
    }
    return drafts;
  }

  function clearSubmitted(documentId: string, blockId: string, submitted: string): CommentDrafts {
    const drafts = read(documentId);
    // A newer draft may have been typed while the submitted comment was saving.
    return Object.hasOwn(drafts, blockId) && drafts[blockId] === submitted
      ? set(documentId, blockId, '')
      : drafts;
  }

  return { read, set, clearSubmitted };
}

export const commentDrafts = createCommentDraftStore();
