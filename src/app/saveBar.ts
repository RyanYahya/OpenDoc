/** The document-wide editing state the save bar reports, separate from what is selected. */
export interface SaveBarState {
  /** Pending draft changes. */
  count: number;
  saving: boolean;
  /** Undoing the latest saved group. */
  undoing: boolean;
  /** A save just completed; shown briefly. */
  saved: boolean;
  /** A save is waiting for its PDF to update. */
  savedId: string | null;
  /** Draft changes were undone and can be redone. */
  canRedo: boolean;
  /** An editing or editor message that Undo, Discard, or Save can act on. */
  error: string;
}

/** The save bar appears only when there is something to save, undo, or report; it is never an idle control. */
export function saveBarVisible(state: SaveBarState) {
  return state.count > 0 || state.saving || state.undoing || state.saved || !!state.savedId || state.canRedo || !!state.error;
}

export function saveBarStatus(state: SaveBarState) {
  if (state.saving) return 'Saving changes…';
  if (state.undoing) return 'Undoing saved changes…';
  if (state.count) return `${state.count} unsaved ${state.count === 1 ? 'change' : 'changes'}`;
  if (state.saved) return 'All changes saved';
  return 'No unsaved changes';
}
