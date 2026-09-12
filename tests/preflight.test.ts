import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { renderOnce } from '../src/server/render';
import { fixture } from './helpers';

function document(content: string, extra = '') {
  return `import {Document,Pages,Heading,Paragraph,Block,View,PageBreak} from '../../src/document';
export const meta={title:'Layout proof',description:'Synthetic layout fixture',kind:'report',theme:'neutral'};
${extra}
export default function Proof(){return <Document title="Layout proof"><Pages title="Layout proof">${content}</Pages></Document>}`;
}

test('preflight produces a navigable outline and identifies an actual stranded heading', async () => {
  const f = await fixture();
  try {
    await writeFile(f.entry, document('<Heading id="title" level={1}>Layout proof</Heading><Paragraph id="intro">The opening stays readable.</Paragraph><View style={{height:490}}/><Heading id="stranded">A stranded heading</Heading><PageBreak/><Paragraph id="next">Its body begins on the following page.</Paragraph>'));
    const { artifact } = await renderOnce(f.root, 'proof');
    assert.deepEqual(artifact.outline?.map(({ id, page }) => ({ id, page })), [{ id: 'title', page: 1 }, { id: 'stranded', page: 1 }]);
    assert.ok(artifact.issues?.some(issue => issue.code === 'stranded-heading' && issue.blockId === 'stranded' && issue.page === 1));
    assert.equal(artifact.provenance?.entry, 'documents/proof/index.tsx');
  } finally { await f.cleanup(); }
});

test('off-page text and clipped content cannot become exportable artifacts', async () => {
  const f = await fixture();
  try {
    await writeFile(f.entry, document('<Paragraph id="off-page" style={{marginLeft:-100}}>This text falls outside the paper.</Paragraph>'));
    await assert.rejects(renderOnce(f.root, 'proof'), /Layout check failed:[\s\S]*off-page/);
    await writeFile(f.entry, document('<Block id="clip" style={{height:12,overflow:"hidden"}}><Paragraph id="clipped-text">This paragraph needs multiple lines. This paragraph needs multiple lines. This paragraph needs multiple lines. This paragraph needs multiple lines.</Paragraph></Block>'));
    await assert.rejects(renderOnce(f.root, 'proof'), /Layout check failed:[\s\S]*clipped/);
  } finally { await f.cleanup(); }
});

test('deliberate page backgrounds and ordinary flowing prose pass geometry checks', async () => {
  const f = await fixture();
  try {
    await writeFile(f.entry, document(`<Heading id="title" level={1}>A long but ordinary document</Heading><Paragraph id="body">${'A careful layout lets the text flow over page boundaries. '.repeat(220)}</Paragraph>`));
    const { artifact } = await renderOnce(f.root, 'proof');
    assert.ok(artifact.pages.length > 1);
    assert.deepEqual(artifact.issues, []);
  } finally { await f.cleanup(); }
});

test('invalid provenance fails clearly instead of giving Codex a misleading data path', async () => {
  const f = await fixture();
  try {
    await writeFile(f.entry, document('<Paragraph id="body">A small report.</Paragraph>', 'export const provenance={dataFile:"../outside.json"};'));
    await assert.rejects(renderOnce(f.root, 'proof'), /provenance.dataFile must be a workspace-relative file path/);
  } finally { await f.cleanup(); }
});
