/**
 * Alt+N (Option+N on a Mac) opens Create on the Documents, Presentations, and project pages. The key
 * is matched by position, because Option changes the typed character on a Mac. A modifier keeps it
 * clear of typing and of single-key screen reader commands; Ctrl+N and ⌘N belong to the browser.
 */
export const createShortcutKeys = 'Alt+N';

export interface ShortcutEvent { code: string; altKey: boolean; ctrlKey: boolean; metaKey: boolean; shiftKey: boolean; repeat?: boolean; isComposing?: boolean; defaultPrevented?: boolean }
type ShortcutTarget = { closest?: (selector: string) => unknown } | null;

/** Places where a key belongs to what the person is doing: text entry, an open menu or list, or a dialog. */
const busyTarget = 'input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"], [role="combobox"], [role="listbox"], [role="menu"], [role="dialog"], [role="alertdialog"]';

/** True when the event is the Create shortcut and nothing being typed or open should receive it. */
export function isCreateShortcut(event: ShortcutEvent, target: ShortcutTarget) {
  if (event.defaultPrevented || event.repeat || event.isComposing) return false;
  if (event.code !== 'KeyN' || !event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return false;
  return !target?.closest?.(busyTarget);
}

/** The shortcut as a person reads it on this platform. */
export const createShortcutLabel = (mac: boolean) => mac ? 'Option+N' : 'Alt+N';
