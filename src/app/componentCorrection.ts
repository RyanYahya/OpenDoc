import { generatedTextReason, type TextTarget } from '../shared/selection';

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
