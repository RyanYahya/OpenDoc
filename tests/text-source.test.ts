import test from 'node:test';
import assert from 'node:assert/strict';
import { createJsonTextSourceResolver, createTextSourceResolver, validateTextSyntax } from '../src/server/text-source';
import { replaceSourceValue, resolveJsonTextSource } from './text-source-helpers';

function resolver(source: string) {
  const parsed = createTextSourceResolver('documents/proof/index.tsx', source);
  return (needle: string, slot = 'children', childIndex = 0) => {
    const before = source.slice(0, source.indexOf(needle));
    return parsed.resolveAt(before.split('\n').length, before.length - before.lastIndexOf('\n'), slot, childIndex);
  };
}

test('resolves exact JSX leaves, literal props, entities and compiler whitespace', () => {
  const source = `export default () => <Paragraph title="A &amp; B">
  First &nbsp; line <Em>second</Em>{' café 🎉'}
  Last line
</Paragraph>`;
  const value = resolver(source);
  assert.equal(value('<Paragraph', 'title')?.value, 'A & B');
  assert.equal(value('<Paragraph', 'children', 0)?.value, 'First \u00a0 line ');
  assert.equal(value('<Paragraph', 'children', 1), undefined);
  assert.equal(value('<Em')?.value, 'second');
  assert.equal(value('<Paragraph', 'children', 2)?.value, ' café 🎉');
  assert.equal(value('<Paragraph', 'children', 3)?.value, 'Last line');
});

test('scope resolution follows local constants and literal object properties, with linked counts', () => {
  const source = `const title = 'Shared'; const meta = {title: 'Document title', nested: {caption: 'Caption'}};
export default () => <><Heading>{title}</Heading><Paragraph>{title}</Paragraph><Caption>{meta.nested.caption}</Caption><TitleBlock title={meta.title}/></>;
function shadow(title:string) { return <Shadow>{title}</Shadow>; }`;
  const value = resolver(source);
  assert.equal(value('<Heading')?.value, 'Shared');
  assert.equal(value('<Heading')?.linkedOccurrences, 2);
  assert.equal(value('<Paragraph')?.start, value('<Heading')?.start);
  assert.equal(value('<Caption')?.value, 'Caption');
  assert.equal(value('<TitleBlock', 'title')?.value, 'Document title');
  assert.equal(value('<Shadow'), undefined);
});

test('generated values, imports, spreads, reassignment and escaped object identities remain read-only', () => {
  for (const source of [
    `import { title } from './shared'; export default () => <Heading>{title}</Heading>`,
    `const title='A'; export default () => <Heading>{title.toUpperCase()}</Heading>`,
    `let title='A'; export default () => <Heading>{title}</Heading>`,
    `const title='A'; title='B'; export default () => <Heading>{title}</Heading>`,
    `const meta={title:'A', ...other}; export default () => <Heading>{meta.title}</Heading>`,
    `const meta={title:'A'}; mutate(meta); export default () => <Heading>{meta.title}</Heading>`,
    `const meta={title:'A'}; meta.title='B'; export default () => <Heading>{meta.title}</Heading>`,
    `const meta={nested:{title:'A'}}; const alias=meta.nested; alias.title='B'; export default () => <Heading>{meta.nested.title}</Heading>`,
  ]) assert.equal(resolver(source)('<Heading'), undefined, source);
  assert.equal(resolver(`const title='A'; export default () => <TitleBlock title={title} {...other}/>` )('<TitleBlock', 'title'), undefined);
});

test('wrapped and destructuring writes or shorthand aliases cannot authorize an unchanged initial value', () => {
  for (const mutation of [
    `(meta.title) = 'Same';`,
    `(meta.title as string) = 'Same';`,
    `({title: meta.title} = {title: 'Same'});`,
    `({nested: {title: meta.title}} = {nested: {title: 'Same'}});`,
    `[meta.title] = ['Same'];`,
    `({title: meta.title = 'Same'} = {});`,
    `const box = {meta}; box.meta.title = 'Same';`,
    `const {nested} = {nested: meta}; nested.title = 'Same';`,
    `for (meta.title of ['Same']) {}`,
    `for ({title: meta.title} of [{title: 'Same'}]) {}`,
    `delete (meta.title); meta.title = 'Same';`,
  ]) {
    const source = `const meta = {title:'Same'}; ${mutation} export default () => <Paragraph>{meta.title}</Paragraph>;`;
    assert.equal(resolver(source)('<Paragraph'), undefined, mutation);
  }
  for (const mutation of [`(title) = 'Same';`, `({title} = {title:'Same'});`, `[title] = ['Same'];`]) {
    const source = `const title = 'Same'; ${mutation} export default () => <Paragraph>{title}</Paragraph>;`;
    assert.equal(resolver(source)('<Paragraph'), undefined, mutation);
  }
});

test('text shared with structural attributes or logic stays read-only even when linked occurrences match', () => {
  for (const consumer of [
    `<Paragraph id={title}>{title}</Paragraph>`,
    `<Block key={title}><Paragraph>{title}</Paragraph></Block>`,
    `<><Cite source={title}/><Paragraph>{title}</Paragraph></>`,
    `<><CrossReference target={title}/><Paragraph>{title}</Paragraph></>`,
    `<><Media item={title}/><Paragraph>{title}</Paragraph></>`,
    `<Document theme={title}><Paragraph>{title}</Paragraph></Document>`,
    `<Paragraph role={title}>{title}</Paragraph>`,
    `<Paragraph href={title}>{title}</Paragraph>`,
  ]) {
    assert.equal(resolver(`const title='overview'; export default () => ${consumer};`)('<Paragraph'), undefined, consumer);
  }
  for (const logic of [
    `const structural = registry[title];`,
    `const structural = title === 'overview';`,
    `const structural = title && 'visible';`,
    `const structural = title ? 'shown' : 'hidden';`,
    `const structural = { [title]: true };`,
    `const structural = slugify(title);`,
    `const structural = \`section-\${title}\`;`,
    `switch(title) { case 'overview': break; }`,
    `const box = {id:title};`,
    `const alias=title; const box={id:alias};`,
  ]) assert.equal(resolver(`const title='overview'; ${logic} export default () => <Paragraph>{title}</Paragraph>;`)('<Paragraph'), undefined, logic);
  assert.equal(resolver(`const meta={title:'overview',description:'Readable'}; export default () => <Paragraph id={meta.title}>{meta.title}</Paragraph>;`)('<Paragraph'), undefined);
  assert.equal(resolver(`const meta={title:'overview'}; const alias=meta.title; export default () => <Paragraph id={alias}>{meta.title}</Paragraph>;`)('<Paragraph'), undefined);
  assert.equal(resolver(`const title='overview'; const meta={title}; export default () => <Paragraph id={meta.title}>{title}</Paragraph>;`)('<Paragraph'), undefined);
  assert.equal(resolver(`const title='overview'; const meta={title}; register(meta); export default () => <Paragraph>{title}</Paragraph>;`)('<Paragraph'), undefined);
});

test('ordinary metadata and direct text aliases remain writable while unrelated structural fields are protected', () => {
  const source = `export const meta={title:'Document title',description:'stable-id'}; const alias=meta.title;
export default () => <Document title={meta.title}><Heading>{alias}</Heading><Paragraph id={meta.description}>{meta.title}</Paragraph></Document>;`;
  const values = resolver(source);
  assert.equal(values('<Heading')?.value, 'Document title');
  assert.equal(values('<Paragraph')?.value, 'Document title');
  assert.equal(values('<Heading')?.start, values('<Paragraph')?.start);
  const copiedMeta = `const title='Document title'; export const meta={title, description:'A report'}; export default () => <Heading>{title}</Heading>;`;
  assert.equal(resolver(copiedMeta)('<Heading')?.value, 'Document title');
});

test('replacement patches one exact source token while preserving Unicode, escaping, and inline structure', () => {
  for (const source of [
    `// Keep this comment\nexport default () => <Paragraph>Before <Em>emphasis</Em> after</Paragraph>;`,
    `// Keep this comment\nexport default () => <Paragraph title='Before'/>;`,
    `// Keep this comment\nconst title='Before'; export default () => <Paragraph>{title}</Paragraph>;`,
  ]) {
    const prop = source.includes("<Paragraph title=");
    const original = resolver(source)('<Paragraph', prop ? 'title' : 'children')!;
    assert.ok(original);
    const next = `Quoted " text & braces { } < café 🎉\nnext`;
    const updated = replaceSourceValue(source, original, next);
    validateTextSyntax('index.tsx', updated);
    assert.equal(resolver(updated)('<Paragraph', prop ? 'title' : 'children')?.value, next);
    assert.ok(updated.startsWith('// Keep this comment\n'));
    if (source.includes('<Em>')) assert.ok(updated.endsWith('<Em>emphasis</Em> after</Paragraph>;'));
    assert.throws(() => replaceSourceValue(source + ' ', original, next), /source changed/);
  }
});

test('JSON fields locate stable record IDs and reject positional, missing and duplicate identity bindings', () => {
  const source = '{"items":[{"id":"two","text":"Second"},{"id":"one","text":"First 🎉"}],"title":"Title"}';
  const value = resolveJsonTextSource('data.json', source, ['items', { id: 'one' }, 'text']);
  assert.equal(value?.value, 'First 🎉');
  assert.equal(JSON.parse(replaceSourceValue(source, value!, 'Edited " value')).items[1].text, 'Edited " value');
  assert.equal(resolveJsonTextSource('data.json', source, ['items', '0', 'text']), undefined);
  assert.equal(resolveJsonTextSource('data.json', source, ['items', { id: 'one' }, 'id']), undefined, 'Manual wording corrections must preserve record identity.');
  assert.equal(resolveJsonTextSource('data.json', source, ['items', { id: 'absent' }, 'text']), undefined);
  assert.equal(resolveJsonTextSource('data.json', '{"items":[{"id":"one","text":"a"},{"id":"one","text":"b"}]}', ['items', { id: 'one' }, 'text']), undefined);
  assert.equal(resolveJsonTextSource('data.json', '{"items":[{"id":"one","id":"two","text":"a"}]}', ['items', { id: 'one' }, 'text']), undefined);
  assert.equal(resolveJsonTextSource('data.json', '{"title":"a","title":"b"}', ['title']), undefined);
});

test('a JSON source snapshot resolves reordered rows consistently through one reusable resolver', () => {
  const rows = Array.from({ length: 500 }, (_, index) => ({ id: `row-${index}`, title: `Title ${index}`, note: `Note ${index}` })).reverse();
  const source = JSON.stringify({ rows });
  const value = createJsonTextSourceResolver('data.json', source);
  for (let index = 0; index < rows.length; index++) {
    const title = value(['rows', { id: `row-${index}` }, 'title'])!;
    const note = value(['rows', { id: `row-${index}` }, 'note'])!;
    assert.equal(title.value, `Title ${index}`);
    assert.equal(JSON.parse(source.slice(title.start, title.end)), title.value);
    assert.equal(note.value, `Note ${index}`);
    assert.equal(title.digest, note.digest);
  }
});
