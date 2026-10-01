import { getBlock, type Comment, type RenderArtifact } from './types';
import type { DocumentSelection, TextAnchor, TextTarget } from './selection';

export function getTextTarget(artifact: RenderArtifact | null | undefined, id: string | null | undefined): TextTarget | undefined {
  return typeof id === 'string' ? artifact?.textTargets?.find(target => target.id === id) : undefined;
}

function rangeOf(artifact: RenderArtifact | null | undefined, selection: DocumentSelection | null | undefined) {
  if (!selection) return undefined;
  const target = getTextTarget(artifact, selection.targetId);
  const { start, end } = selection;
  if (!target || target.blockId !== selection.blockId || !Number.isInteger(start) || !Number.isInteger(end)
    || start! < 0 || end! <= start! || end! > target.text.length) return undefined;
  const text = target.text.slice(start, end);
  if (selection.quote !== undefined && selection.quote !== text) return undefined;
  return { target, start: start!, end: end!, text };
}

export function getEditableSelection(artifact: RenderArtifact | null | undefined, selection: DocumentSelection | null | undefined) {
  const range = rangeOf(artifact, selection);
  if (!range) return undefined;
  const runs = range.target.runs.filter(candidate => candidate.start <= range.start && candidate.end >= range.end);
  const run = runs.length === 1 ? runs[0] : undefined;
  if (!run?.source || run.protected || run.source.value !== range.target.text.slice(run.start, run.end)) return undefined;
  return { ...range, run, source: run.source };
}

export function selectionReason(artifact: RenderArtifact | null | undefined, selection: DocumentSelection | null | undefined) {
  if (!selection) return 'Click a text component to make a quick correction.';
  if (getEditableSelection(artifact, selection)) return '';
  const range = rangeOf(artifact, selection);
  if (!range) return 'This component does not have a writable text field. Leave a comment for your agent.';
  const run = range.target.runs.find(candidate => candidate.start <= range.start && candidate.end >= range.end);
  return run?.reason ?? range.target.reason ?? (run?.protected
    ? 'Generated text—ask your agent to change its source.'
    : 'This selection spans formatting or separate fields. Ask your agent to change it.');
}

export function anchorForSelection(artifact: RenderArtifact | null | undefined, selection: DocumentSelection | null | undefined): TextAnchor | undefined {
  const range = rangeOf(artifact, selection);
  if (!range || range.target.stable === false) return undefined;
  const { target, start, end, text } = range;
  return { targetId: target.id, start, end, quote: text, prefix: target.text.slice(Math.max(0, start - 40), start), suffix: target.text.slice(end, end + 40) };
}

/**
 * Select a phrase by its wording, for commands that cannot select it on the page: the one
 * occurrence of `phrase` in the block's text fields, or in the field `targetId` names. An
 * unknown block, a missing phrase, or more than one occurrence is an error that names the
 * fields to choose from, so the comment never attaches to a guessed occurrence.
 */
export function phraseSelection(artifact: RenderArtifact | null | undefined, blockId: string, phrase: string, targetId?: string): DocumentSelection {
  const block = getBlock(artifact, blockId);
  if (!block) throw new Error('The target block does not exist in the current document. Inspect its review output to find the block ID.');
  if (!phrase || phrase.length > 8000) throw new Error('Quote between 1 and 8,000 characters of the block’s current wording.');
  const fields = artifact!.textTargets?.filter(target => target.blockId === blockId) ?? [];
  const searched = targetId === undefined ? fields : fields.filter(target => target.id === targetId);
  if (targetId !== undefined && !searched.length) throw new Error(`${blockId} has no text field ${targetId}.${fields.length ? ` Its fields are ${fields.map(field => field.id).join(', ')}.` : ''}`);
  const matches = searched.flatMap(target => {
    const starts: number[] = [];
    for (let at = target.text.indexOf(phrase); at !== -1; at = target.text.indexOf(phrase, at + 1)) starts.push(at);
    return starts.map(start => ({ target, start }));
  });
  if (!matches.length) throw new Error(`“${phrase}” does not appear in ${targetId ?? blockId}. Quote its current wording exactly, or comment on the whole block.`);
  if (matches.length > 1) {
    const where = [...new Set(matches.map(match => match.target.id))];
    throw new Error(`“${phrase}” appears ${matches.length} times in ${blockId}${where.length > 1 ? `, in ${where.join(', ')}` : ''}. Quote more of the wording${where.length > 1 ? ', or choose one field with --target' : ''}.`);
  }
  const [{ target, start }] = matches;
  const page = target.lines.find(line => line.start <= start && line.end > start)?.page
    ?? (artifact!.pages.findIndex(item => item.fragments.some(fragment => fragment.id === blockId)) + 1 || 1);
  return { blockId, targetId: target.id, start, end: start + phrase.length, quote: phrase, page, renderHash: artifact!.hash };
}

export interface ResolvedCommentAnchor {
  status: 'attached' | 'changed' | 'missing';
  selection?: DocumentSelection;
}

/** Reflow does not alter a target. Content changes require an unambiguous quote. */
export function resolveCommentAnchor(artifact: RenderArtifact | null | undefined, comment: Pick<Comment, 'blockId' | 'anchor' | 'quote'>): ResolvedCommentAnchor {
  if (!getBlock(artifact, comment.blockId)) return { status: 'missing' };
  const page = (artifact?.pages.findIndex(item => item.fragments.some(fragment => fragment.id === comment.blockId)) ?? -1) + 1;
  const blockSelection: DocumentSelection = { blockId: comment.blockId, page: Math.max(1, page), quote: comment.quote, renderHash: artifact?.hash };
  if (!comment.anchor) return { status: 'attached', selection: blockSelection };
  const anchor = comment.anchor;
  const target = getTextTarget(artifact, anchor.targetId);
  if (!target || target.stable === false || target.blockId !== comment.blockId || !anchor.quote) return { status: 'changed', selection: blockSelection };
  const matches: number[] = [];
  for (let at = target.text.indexOf(anchor.quote); at !== -1; at = target.text.indexOf(anchor.quote, at + 1)) matches.push(at);
  const contextual = matches.filter(at => target.text.slice(Math.max(0, at - anchor.prefix.length), at) === anchor.prefix
    && target.text.slice(at + anchor.quote.length, at + anchor.quote.length + anchor.suffix.length) === anchor.suffix);
  const start = matches.length === 1 ? matches[0] : contextual.length === 1 ? contextual[0] : undefined;
  if (start === undefined) return { status: 'changed', selection: blockSelection };
  const end = start + anchor.quote.length;
  const line = target.lines.find(item => item.start <= start && item.end > start);
  return { status: 'attached', selection: { ...blockSelection, targetId: target.id, start, end, quote: anchor.quote, page: line?.page ?? blockSelection.page } };
}
