import test from 'node:test';
import assert from 'node:assert/strict';
import { anchorForSelection, getEditableSelection, resolveCommentAnchor } from '../src/shared/anchors';
import type { RenderArtifact } from '../src/shared/types';

function artifact(text = 'An exact phrase and a citation [1].'): RenderArtifact {
  return {
    meta: { title: 'Proof', description: '', theme: 'neutral' }, hash: 'pdf-hash', renderedAt: '',
    blocks: { paragraph: { id: 'paragraph', kind: 'paragraph', text } },
    pages: [{ width: 595, height: 842, fragments: [{ id: 'paragraph', x: 40, y: 80, width: 300, height: 40 }] }],
    textTargets: [{ id: 'paragraph:text', blockId: 'paragraph', slot: 'text', text,
      runs: [{ start: 0, end: 30, source: { file: 'documents/proof/index.tsx', digest: 'source-hash', start: 0, end: 32, kind: 'string', value: text.slice(0, 30) } }, { start: 30, end: text.length, protected: true }],
      lines: [{ page: 1, x: 40, y: 80, width: 300, height: 20, text, start: 0, end: text.length }] }],
  };
}

test('range editing uses one exact writable run and protects generated text', () => {
  const value = artifact();
  const selection = { blockId: 'paragraph', targetId: 'paragraph:text', start: 3, end: 15, quote: 'exact phrase', page: 1 };
  assert.equal(getEditableSelection(value, selection)?.text, 'exact phrase');
  assert.equal(getEditableSelection(value, { ...selection, quote: 'different' }), undefined);
  assert.equal(getEditableSelection(value, { ...selection, start: 28, end: 34, quote: undefined }), undefined);
  assert.equal(getEditableSelection(value, { ...selection, blockId: 'wrong' }), undefined);
  assert.equal(anchorForSelection(value, selection)?.quote, 'exact phrase');
  value.textTargets![0].runs.push({ ...value.textTargets![0].runs[0] });
  assert.equal(getEditableSelection(value, selection), undefined, 'Ambiguous bindings cannot offer an edit that Save will reject.');
});

test('phrase comments follow reflow and unique wording shifts, without silently retargeting removed text', () => {
  const original = artifact();
  const anchor = anchorForSelection(original, { blockId: 'paragraph', targetId: 'paragraph:text', start: 3, end: 15, page: 1 })!;
  const comment = { blockId: 'paragraph', quote: anchor.quote, anchor };
  const moved = artifact('A new opening. An exact phrase and a citation [1].');
  moved.textTargets![0].lines[0].page = 3;
  assert.equal(resolveCommentAnchor(moved, comment).selection?.start, 18);
  assert.equal(resolveCommentAnchor(moved, comment).selection?.page, 3);
  assert.equal(resolveCommentAnchor(artifact('The wording has changed.'), comment).status, 'changed');
  const missing = artifact(); delete missing.blocks.paragraph;
  assert.equal(resolveCommentAnchor(missing, comment).status, 'missing');
  assert.equal(resolveCommentAnchor(original, { blockId: 'paragraph', quote: 'Old block comment' }).status, 'attached');
});

test('repeated quotes require a unique surrounding context', () => {
  const original = artifact('First exact phrase. Second exact phrase.');
  const start = original.textTargets![0].text.lastIndexOf('exact phrase');
  const anchor = anchorForSelection(original, { blockId: 'paragraph', targetId: 'paragraph:text', start, end: start + 12, page: 1 })!;
  const comment = { blockId: 'paragraph', quote: anchor.quote, anchor };
  assert.equal(resolveCommentAnchor(original, comment).selection?.start, start);
  assert.equal(resolveCommentAnchor(artifact('exact phrase. exact phrase.'), comment).status, 'changed');
});

test('positional fields do not gain durable range anchors or reuse a previously stable phrase identity', () => {
  const original = artifact();
  const selection = { blockId: 'paragraph', targetId: 'paragraph:text', start: 3, end: 15, page: 1 };
  const anchor = anchorForSelection(original, selection)!;
  const positional = artifact();
  positional.textTargets![0].stable = false;
  assert.equal(anchorForSelection(positional, selection), undefined);
  assert.equal(getEditableSelection(positional, selection)?.text, 'exact phrase', 'The current snapshot still safely supports a correction.');
  assert.equal(resolveCommentAnchor(positional, { blockId: 'paragraph', quote: anchor.quote, anchor }).status, 'changed');
});
