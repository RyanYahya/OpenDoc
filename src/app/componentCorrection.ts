import { generatedTextReason, type DocumentSelection, type TextTarget } from '../shared/selection';

export function canCorrectComponent(target: TextTarget | undefined) {
  return !!target?.runs.some(run => run.source && !run.protected && run.source.value === target.text.slice(run.start, run.end));
}

/** Why the Edit action is unavailable for a selected component, or undefined when it can open. */
export function correctionUnavailableReason(target: TextTarget | undefined) {
  if (canCorrectComponent(target)) return undefined;
  return target ? target.reason ?? generatedTextReason : 'This component has no text to edit. Comment instead.';
}

/** The popover holds the whole component; a correction still owns one source value. */
export function componentCorrection(target: TextTarget, replacement: string) {
  if (target.text === replacement) return undefined;
  const candidates = target.runs.flatMap(run => {
    if (!run.source || run.protected || run.source.value !== target.text.slice(run.start, run.end)) return [];
    const prefix = target.text.slice(0, run.start), suffix = target.text.slice(run.end);
    if (replacement.length < prefix.length + suffix.length || !replacement.startsWith(prefix) || !replacement.endsWith(suffix)) return [];
    return [{ start: run.start, end: run.end, replacement: replacement.slice(prefix.length, replacement.length - suffix.length) }];
  });
  return candidates.length === 1 ? candidates[0] : undefined;
}

/**
 * The text an Edit action opens: the selected text, or else the component's only text. A list
 * item selected by its marker, which is not text of its own, still edits the item.
 */
export function selectedTextTarget(targets: TextTarget[] | undefined, selection: Pick<DocumentSelection, 'blockId' | 'targetId'> | null | undefined) {
  if (!selection || selection.targetId) return selection?.targetId;
  const own = (targets ?? []).filter(target => target.blockId === selection.blockId);
  return own.length === 1 ? own[0].id : undefined;
}
