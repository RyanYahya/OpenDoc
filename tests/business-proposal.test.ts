import test from 'node:test';
import assert from 'node:assert/strict';
import { cp, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parseProposalPricing } from '../templates/business-proposal/schema';
import typical from '../templates/business-proposal/examples/typical.json';
import { createFromTemplate } from '../src/server/templates';
import { renderOnce } from '../src/server/render';
import { assertInstanceTitle, fixture, projectRoot } from './helpers';

test('proposal commercial data requires an evidence flag and rejects invalid pricing', () => {
  const original = structuredClone(typical);
  assert.deepEqual(parseProposalPricing(typical), typical);
  assert.deepEqual(typical, original);
  for (const change of [{ synthetic: undefined }, { synthetic: 'yes' }, { title: 'Prose is authored separately' }, { pricing: { ...typical.pricing, items: [] } }, { pricing: { ...typical.pricing, items: [typical.pricing.items[0], typical.pricing.items[0]] } }, { pricing: { ...typical.pricing, tax: { label: 'Invalid tax', ratePercent: Infinity } } }]) assert.throws(() => parseProposalPricing({ ...typical, ...change }));
});

test('proposal creation keeps prose separate, copies independent pricing, and applies the selected theme', async () => {
  const f = await fixture();
  try {
    await cp(resolve(projectRoot, 'templates'), resolve(f.root, 'templates'), { recursive: true });
    const first = await createFromTemplate(f.root, 'business-proposal', { projectId: 'test-project', title: 'Proposal "A" & ${title}', id: 'proposal-a', theme: 'field-manual' });
    const second = await createFromTemplate(f.root, 'business-proposal', { projectId: 'test-project', title: 'Proposal B', theme: 'neutral' });
    const path = resolve(f.root, 'documents', first.id, 'data.json');
    const data = JSON.parse(await readFile(path, 'utf8'));
    assert.deepEqual(Object.keys(data).sort(), ['pricing', 'synthetic']);
    data.pricing.items[0].unitPrice = '200.00';
    await writeFile(path, JSON.stringify(data));
    const result = await renderOnce(f.root, first.id);
    assertInstanceTitle(result.artifact, first.id, 'Proposal "A" & ${title}');
    assert.deepEqual(result.artifact.issues, []);
    assert.equal(result.artifact.meta.title, 'Proposal "A" & ${title}');
    assert.equal(result.artifact.meta.theme, 'field-manual');
    assert.equal(result.artifact.provenance?.dataFile, 'documents/proposal-a/data.json');
    assert.equal(result.artifact.provenance?.template, 'templates/business-proposal/index.tsx');
    assert.ok(result.artifact.blocks['proposal-commercial-totals'].text.endsWith('Proposed total USD 1,430.00'));
    assert.equal(result.artifact.pages.length, 1);
    const otherResult = await renderOnce(f.root, second.id);
    assert.equal(otherResult.artifact.meta.theme, 'neutral');
    assert.ok(otherResult.artifact.blocks['proposal-commercial-totals'].text.endsWith('Proposed total USD 1,320.00'));
    assert.equal(JSON.parse(await readFile(resolve(f.root, 'templates/business-proposal/data.json'), 'utf8')).pricing.items[0].unitPrice, '160.00');
  } finally { await f.cleanup(); }
});

test('proposals support unpriced prose and distinct pricing options with an optional cover', async () => {
  const f = await fixture();
  try {
    await cp(resolve(projectRoot, 'templates'), resolve(f.root, 'templates'), { recursive: true });
    const source = (priced: boolean) => `import {BusinessProposal,ProposalPricing,parseProposalPricing} from '../../templates/business-proposal';
import {Paragraph} from '../../src/document';import {neutral} from '../../themes';import data from '../../templates/business-proposal/examples/sparse.json';
export const meta={title:'Flexible proposal',description:'Layout test only',kind:'proposal',theme:'neutral'};
export default function Proof(){return <BusinessProposal title={meta.title} theme={neutral} cover={${priced}}><Paragraph id="own-prose">The author chooses this structure.</Paragraph>${priced ? '<ProposalPricing id="option-a" data={parseProposalPricing(data)} theme={neutral}/><ProposalPricing id="option-b" data={parseProposalPricing(data)} theme={neutral}/>' : ''}</BusinessProposal>}`;
    await writeFile(f.entry, source(false));
    const unpriced = await renderOnce(f.root, 'proof');
    assert.deepEqual(unpriced.artifact.issues, []);
    assert.equal(unpriced.artifact.pages.length, 1);
    assert.ok(!Object.keys(unpriced.artifact.blocks).some(id => id.endsWith('-totals')));
    await writeFile(f.entry, source(true));
    const priced = await renderOnce(f.root, 'proof');
    assert.deepEqual(priced.artifact.issues, []);
    assert.equal(priced.artifact.pages.length, 2);
    for (const id of ['option-a', 'option-b']) {
      assert.ok(priced.artifact.blocks[`${id}-items`]);
      assert.ok(priced.artifact.blocks[`${id}-totals`].text.endsWith('Proposed total USD 100.00'));
    }
  } finally { await f.cleanup(); }
});
