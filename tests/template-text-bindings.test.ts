import test from 'node:test';
import assert from 'node:assert/strict';
import { cp, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createFromTemplate } from '../src/server/templates';
import { renderOnce } from '../src/server/render';
import { replaceSourceValue } from './text-source-helpers';
import type { TextSourceValue, TextTarget } from '../src/shared/selection';
import { bindTemplate, defineTemplate } from '../src/template';
import { parseProposalPricing } from '../templates/business-proposal/schema';
import proposalData from '../templates/business-proposal/examples/typical.json';
import { assertInstanceTitle, fixture, projectRoot } from './helpers';

const writable = (target: TextTarget) => target.runs.flatMap(run => run.source ? [run.source] : []);

async function templatesFixture() {
  const f = await fixture();
  await cp(resolve(projectRoot, 'templates'), resolve(f.root, 'templates'), { recursive: true });
  return f;
}

test('brief and literary starters bind titles to their own instance', async () => {
  const f = await templatesFixture();
  try {
    // Other layouts check the same ownership contract in their rendering tests.
    for (const template of ['literary-text', 'executive-brief']) {
      const title = `Authored ${template} title`;
      const created = await createFromTemplate(f.root, template, { projectId: 'test-project', id: template, title, theme: 'neutral' });
      const rendered = await renderOnce(f.root, created.id);
      assert.deepEqual(rendered.artifact.issues, [], template);
      assertInstanceTitle(rendered.artifact, created.id, title);
    }
  } finally { await f.cleanup(); }
});

test('template prop runs and heading helpers retain the caller text beneath inline formatting', async () => {
  const f = await templatesFixture();
  try {
    await writeFile(f.entry, `import {ExecutiveBrief,BriefHeading} from '../../templates/executive-brief';
import {SceneBreak} from '../../templates/literary-text';
import {FeatureQuote} from '../../templates/magazine-feature';
import {ProposalHeading} from '../../templates/business-proposal';
import {PaperHeading} from '../../templates/scientific-paper';
import {neutral} from '../../themes';
export const meta={title:'Template passthrough',description:'Binding proof',theme:'neutral'};
export default function Proof(){return <ExecutiveBrief title={meta.title} author="An authored byline" date="Supplied date" takeaway="A supplied takeaway" theme={neutral}>
<BriefHeading id="brief-heading">An authored brief heading</BriefHeading>
<PaperHeading id="paper-heading">An authored paper heading</PaperHeading>
<ProposalHeading id="proposal-heading">An authored proposal heading</ProposalHeading>
<FeatureQuote id="feature-quote">An authored display quote</FeatureQuote>
<SceneBreak id="scene" lead="An authored scene opening." />
</ExecutiveBrief>}`);
    const rendered = await renderOnce(f.root, 'proof');
    const values = new Set((rendered.artifact.textTargets ?? []).flatMap(writable).map(source => source.value));
    for (const value of ['An authored byline', 'Supplied date', 'A supplied takeaway', 'An authored brief heading', 'An authored paper heading', 'An authored proposal heading', 'An authored display quote', 'An authored scene opening.']) {
      assert.ok(values.has(value), `Caller owns ${value}`);
    }
  } finally { await f.cleanup(); }
});

test('monthly report text edits follow JSON record identities and preserve calculated or split text', async () => {
  const f = await templatesFixture();
  try {
    const created = await createFromTemplate(f.root, 'monthly-report', { projectId: 'test-project', id: 'monthly', title: 'Monthly text proof' });
    const file = resolve(f.root, 'documents/monthly/data.json');
    const data = JSON.parse(await readFile(file, 'utf8'));
    data.summary = 'A concise, editable summary. Both sentences remain one authored value.';
    data.metrics[0].label = data.metrics[1].label = 'Repeated measure';
    data.highlights[0].body = 'This short narrative is editable in the document.';
    data.highlights[1].body = 'A short opening stays with the heading. ' + 'Longer evidence continues in native page flow. '.repeat(30);
    await writeFile(file, JSON.stringify(data, null, 2));
    const result = await renderOnce(f.root, created.id);
    const targets = result.artifact.textTargets ?? [];
    const values = new Set(targets.flatMap(writable).map(source => source.value));
    for (const value of [data.title, data.organization, data.preparedBy, data.summary, data.sourceNote, data.highlights[0].title, data.highlights[0].body, data.risks[0].title, data.risks[0].owner, data.actions[0].title, data.actions[0].owner]) assert.ok(values.has(value), `Monthly report binds ${value}`);
    const repeated = targets.filter(target => target.text === 'Repeated measure');
    assert.equal(repeated.length, 2);
    assert.ok(repeated.every(target => target.stable));
    const selected = repeated.find(target => target.slot.includes(data.metrics[0].id))!;
    const replacement = replaceSourceValue(await readFile(file, 'utf8'), writable(selected)[0], 'Corrected measure');
    const changed = JSON.parse(replacement);
    assert.equal(changed.metrics[1].label, 'Repeated measure');
    assert.equal(changed.metrics[0].value, data.metrics[0].value);
    changed.metrics.reverse(); changed.actions.reverse();
    await writeFile(file, JSON.stringify(changed, null, 2));
    const reordered = await renderOnce(f.root, created.id);
    assert.equal(reordered.artifact.textTargets?.find(target => target.id === selected.id)?.text, 'Corrected measure');
    const action = targets.find(target => target.text === data.actions[0].title)!;
    assert.equal(reordered.artifact.textTargets?.find(target => target.id === action.id)?.text, action.text);
    const protectedTargets = targets.filter(target => target.slot.endsWith('-actual') || target.slot === 'body-continuation');
    assert.ok(protectedTargets.length);
    assert.ok(protectedTargets.every(target => writable(target).length === 0 && target.runs.every(run => run.protected)));
  } finally { await f.cleanup(); }
});

test('JSON pricing cells bind repeated text by stable record ID and keep other instance values unchanged', async () => {
  const f = await templatesFixture();
  try {
    for (const template of ['quotation', 'invoice', 'business-proposal']) {
      const created = await createFromTemplate(f.root, template, { projectId: 'test-project', id: `bound-${template}`, title: 'Bound pricing', theme: 'neutral' });
      const file = resolve(f.root, 'documents', created.id, 'data.json');
      const original = JSON.parse(await readFile(file, 'utf8'));
      original.pricing.items[0].description = 'The same description';
      original.pricing.items[1].description = 'The same description';
      await writeFile(file, JSON.stringify(original, null, 2));
      const sharedFile = resolve(f.root, 'templates', template, 'index.tsx');
      const sharedBefore = await readFile(sharedFile, 'utf8');
      const rendered = await renderOnce(f.root, created.id);
      const candidates = (rendered.artifact.textTargets ?? []).filter(target => target.text === 'The same description');
      assert.equal(candidates.length, 2, `${template} retains distinct repeated cells`);
      const boundValues = new Set((rendered.artifact.textTargets ?? []).flatMap(writable).map(source => source.value));
      for (const value of [original.pricing.items[0].unit, original.pricing.tax?.label, original.number, original.issuedOn, original.validUntil, original.reference, original.dueOn, original.seller?.name, original.seller?.details, original.client?.name, original.customer?.name, original.introduction, original.acceptance, original.paymentInstructions, original.paymentReference, ...(original.terms ?? original.notes ?? []).flatMap((item: { title: string; text: string }) => [item.title, item.text])].filter(Boolean)) {
        assert.ok(boundValues.has(value), `${template} binds its supplied text: ${value}`);
      }
      const sources = candidates.map(target => writable(target)[0]);
      assert.ok(sources.every(Boolean), `${template} descriptions are writable`);
      assert.notEqual(sources[0].start, sources[1].start);
      assert.equal(sources[0].kind, 'json-string');
      assert.ok(sources.every(source => source.file === `documents/${created.id}/data.json`));
      const firstRecordId = original.pricing.items[0].id;
      const chosen = candidates.find(target => target.slot.includes(firstRecordId))!;
      assert.ok(chosen, 'Stable row identity is part of the selected slot');
      const selectedSource: TextSourceValue = writable(chosen)[0];
      const changedSource = replaceSourceValue(await readFile(file, 'utf8'), selectedSource, 'Corrected first record');
      await writeFile(file, changedSource);
      const changed = JSON.parse(changedSource);
      assert.equal(changed.pricing.items[0].description, 'Corrected first record');
      assert.equal(changed.pricing.items[1].description, 'The same description');
      assert.deepEqual(changed.pricing.items[0].quantity, original.pricing.items[0].quantity);
      changed.pricing.items.reverse();
      await writeFile(file, JSON.stringify(changed, null, 2));
      const reordered = await renderOnce(f.root, created.id);
      const current = reordered.artifact.textTargets?.find(target => target.id === chosen.id);
      assert.equal(current?.text, 'Corrected first record', 'The target follows the record after rows move');
      assert.equal(writable(current!)[0].value, 'Corrected first record');
      assert.equal(await readFile(sharedFile, 'utf8'), sharedBefore);
      const totals = reordered.artifact.textTargets?.filter(target => target.blockId.endsWith('-totals') && target.text.includes('USD')) ?? [];
      assert.ok(totals.length);
      assert.ok(totals.every(target => writable(target).length === 0), 'Computed totals remain protected');
    }
  } finally { await f.cleanup(); }
});

test('isolated candidate validation can confirm the original template parser ran successfully', () => {
  const state = globalThis as typeof globalThis & { __opendocTemplateValidated?: boolean };
  const template = defineTemplate({
    parse: (input: unknown) => { if (typeof input !== 'string' || !input.trim()) throw new Error('Expected nonempty text'); return input; },
    meta: title => ({ title, description: '', theme: 'neutral' }),
    render: () => null,
  });
  try {
    delete state.__opendocTemplateValidated;
    assert.throws(() => bindTemplate(template, ''), /nonempty/);
    assert.equal(state.__opendocTemplateValidated, undefined);
    assert.equal(bindTemplate(template, 'Valid title').data, 'Valid title');
    assert.equal(state.__opendocTemplateValidated, true);
    delete state.__opendocTemplateValidated;
    parseProposalPricing(proposalData);
    assert.equal(state.__opendocTemplateValidated, true, 'Optional proposal pricing validates without bindTemplate');
  } finally { delete state.__opendocTemplateValidated; }
});
