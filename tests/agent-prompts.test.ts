import test from 'node:test';
import assert from 'node:assert/strict';
import { applyCommentsPrompt, createDocumentPrompt } from '../src/app/agentPrompts';

test('creation prompts keep their workflow and add an optional brief as a delimited block', () => {
  const base = { format: 'document' as const, project: { id: 'client-work', name: 'Client work' }, template: { id: 'executive-brief', name: 'Executive brief' } };
  const plain = createDocumentPrompt(base);
  assert.match(plain, /opendoc-create workflow/);
  assert.match(plain, /\(client-work\)/);
  assert.match(plain, /\(executive-brief\)/);
  assert.doesNotMatch(plain, /<brief>/, 'An empty brief adds nothing');
  assert.equal(createDocumentPrompt({ ...base, brief: ' \n ' }), plain);

  const brief = 'A one-page summary for the board.\n\nCover Q3 results.';
  const withBrief = createDocumentPrompt({ ...base, brief: `\n${brief}  \n` });
  assert.ok(withBrief.startsWith(plain), 'The workflow instructions stay intact before the brief');
  assert.ok(withBrief.endsWith(`<brief>\n${brief}\n</brief>`));
});

test('creation prompts carry the project default for their format unless a theme was chosen', () => {
  const project = { id: 'narra', name: 'Narra' };
  const projectThemes = [{ format: 'presentation' as const, id: 'narra-presentations', name: 'Narra presentations' }];
  const deck = createDocumentPrompt({ format: 'presentation', project, projectThemes });
  assert.match(deck, /default presentation theme, Narra presentations \(narra-presentations\), unless my brief says otherwise/);
  assert.doesNotMatch(createDocumentPrompt({ format: 'presentation', project, projectThemes, theme: { id: 'neutral', name: 'Neutral' } }), /narra-presentations/, 'An explicit theme replaces the default.');
  assert.doesNotMatch(createDocumentPrompt({ format: 'document', project }), /default/, 'No default adds nothing.');
  const both = createDocumentPrompt({ project, projectThemes: [{ format: 'document', id: 'narra-reports', name: 'Narra reports' }, ...projectThemes] });
  assert.match(both, /documents, Narra reports \(narra-reports\); presentations, Narra presentations \(narra-presentations\)/);
});

test('the comments prompt names the document and skill without local session details', () => {
  const prompt = applyCommentsPrompt({ id: 'welcome', name: 'Welcome to OpenDoc', format: 'document' });
  assert.match(prompt, /“Welcome to OpenDoc” \(welcome\)/);
  assert.match(prompt, /opendoc-apply-comments workflow/);
  assert.doesNotMatch(prompt, /token|server\.json|https?:/i);
  assert.match(applyCommentsPrompt({ id: 'deck', format: 'presentation' }), /presentation deck .*PowerPoint/s);
});
