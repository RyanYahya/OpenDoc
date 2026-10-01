import test from 'node:test';
import assert from 'node:assert/strict';
import { componentName, componentNavigation, moveComponentFocus, navigationMove, textExcerpt, type NavigableComponent } from '../src/app/componentNavigation';

const box = (key: string, x: number, y: number, width: number, height: number, extra: Partial<NavigableComponent> = {}): NavigableComponent =>
  ({ key, x, y, width, height, ...extra });

test('components read down each column, with containers before their contents', () => {
  // Stacking order (largest first) differs from reading order.
  const navigation = componentNavigation([
    box('right', 310, 181, 238, 167),
    box('header', 48, 76, 499, 101),
    box('left-lower', 48, 317, 238, 298),
    box('left', 48, 181, 238, 136),
    box('left-heading', 48, 201, 238, 24),
    box('right-heading', 310, 201, 238, 24),
    box('footer', 48, 640, 499, 12),
  ]);
  assert.deepEqual(navigation.order, ['header', 'left', 'left-heading', 'left-lower', 'right', 'right-heading', 'footer']);
  assert.equal(navigation.parents.get('left-heading'), 'left');
  assert.equal(navigation.parents.has('left-lower'), false, 'Touching siblings do not contain each other.');
});

test('a full-slide container still lets its contents read in columns', () => {
  const navigation = componentNavigation([
    box('slide', 0, 0, 960, 540),
    box('title', 48, 80, 850, 48),
    box('you-label', 48, 282, 245, 14),
    box('agent-label', 354, 282, 245, 14),
    box('you-copy', 48, 354, 245, 81),
    box('agent-copy', 354, 354, 245, 81),
    box('folio', 870, 510, 42, 16),
    box('running', 48, 513, 800, 12),
  ]);
  assert.deepEqual(navigation.order, ['slide', 'title', 'you-label', 'you-copy', 'agent-label', 'agent-copy', 'running', 'folio']);
});

test('table contents read across each row', () => {
  const navigation = componentNavigation([
    box('block:table', 48, 100, 400, 60, { rowsFirst: true, linear: false }),
    box('text:a2', 48, 130, 190, 20, { owner: 'block:table' }),
    box('text:b1', 250, 100, 190, 20, { owner: 'block:table' }),
    box('text:a1', 48, 100, 190, 20, { owner: 'block:table' }),
    box('text:b2', 250, 130, 190, 20, { owner: 'block:table' }),
  ]);
  assert.deepEqual(navigation.order, ['block:table', 'text:a1', 'text:b1', 'text:a2', 'text:b2']);
});

test('arrow keys skip a component whose text is selectable, which stays reachable as the parent', () => {
  const navigation = componentNavigation([
    box('block:intro', 48, 40, 400, 30),
    box('block:callout', 48, 100, 400, 80, { linear: false }),
    box('text:callout-title', 60, 110, 380, 20, { owner: 'block:callout' }),
    box('text:callout-body', 60, 140, 380, 30, { owner: 'block:callout' }),
    box('block:image', 48, 200, 400, 200),
  ]);
  const move = (from: string, key: string, modifiers: Partial<KeyboardEvent> = {}) =>
    moveComponentFocus(navigation, from, navigationMove({ key, altKey: false, ctrlKey: false, metaKey: false, shiftKey: false, ...modifiers })!);
  assert.equal(move('block:intro', 'ArrowDown'), 'text:callout-title');
  assert.equal(move('text:callout-title', 'ArrowRight'), 'text:callout-body');
  assert.equal(move('text:callout-body', 'ArrowUp'), 'text:callout-title');
  assert.equal(move('text:callout-title', 'ArrowLeft'), 'block:intro');
  assert.equal(move('block:intro', 'ArrowUp'), undefined, 'Movement stops at the first component.');
  assert.equal(move('block:intro', 'End'), 'block:image');
  assert.equal(move('block:image', 'Home'), 'block:intro');
  assert.equal(move('text:callout-body', 'ArrowUp', { altKey: true }), 'block:callout');
  assert.equal(move('block:callout', 'ArrowDown', { altKey: true }), 'text:callout-title');
  assert.equal(move('block:callout', 'ArrowDown'), 'text:callout-title');
  assert.equal(navigationMove({ key: 'ArrowDown', altKey: false, ctrlKey: false, metaKey: false, shiftKey: true }), undefined);
  assert.equal(navigationMove({ key: 'Enter', altKey: false, ctrlKey: false, metaKey: false, shiftKey: false }), undefined);
});

test('component names use visible kind and text, never identifiers', () => {
  assert.equal(componentName({ kind: 'heading', text: 'Welcome to\nOpenDoc.' }), 'Heading: Welcome to OpenDoc.');
  assert.equal(componentName({ kind: 'list-item', text: '' }), 'List item');
  assert.equal(componentName({ kind: 'block', depicts: 'Image' }), 'Image');
  assert.equal(componentName({ kind: 'paragraph', text: 'Short note', whole: true }), 'Paragraph component: Short note');
  const long = textExcerpt('Bring your idea and material. Work with your preferred coding agent from start to finish.');
  assert.ok(long.length <= 61 && long.endsWith('…') && !/\s…$/.test(long));
});
