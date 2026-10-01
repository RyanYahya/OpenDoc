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

/** Resolve within explicit component instances, as the renderer reports them. */
function scoped(source: string) {
  const parsed = createTextSourceResolver('documents/proof/index.tsx', source);
  const at = (needle: string) => {
    const index = source.indexOf(needle);
    assert.ok(index >= 0 && source.indexOf(needle, index + 1) < 0, `unique needle ${needle}`);
    const before = source.slice(0, index);
    return { line: before.split('\n').length, column: before.length - before.lastIndexOf('\n') };
  };
  return (needle: string, owners: string[], text?: string, slot = 'children') => {
    const { line, column } = at(needle);
    return parsed.resolveAt(line, column, slot, 0, { owners: owners.map(at), text });
  };
}

const helperDocument = `function Title({ id, children }: { id: string; children: string }) {
  return <View><Heading id={id} level={2}>{children}</Heading></View>;
}
function Item({ id, title, when, heading, children }: { id: string; title: string; when?: string; heading?: [string, string]; children?: any }) {
  return <Block id={id}>
    {heading && <Title id={heading[0]}>{heading[1]}</Title>}
    <Paragraph id={\`\${id}-title\`}>{title}</Paragraph>
    {when && <Paragraph id={\`\${id}-when\`}>{when}</Paragraph>}
    {children}
  </Block>;
}
function Points({ id, items }: { id: string; items: string[] }) {
  const row = (text: string, i: number) => <Paragraph key={i} id={\`\${id}-\${i + 1}\`}>{text}</Paragraph>;
  return <View>{items.length > 0 && row(items[0], 0)}{items.slice(1).map((text, i) => row(text, i + 1))}</View>;
}
export default () => <Document>
  <Title id="section">First section</Title>
  <Item id="alpha" heading={['history-title', 'History']} title="Alpha role" when="2020 to 2022">
    <Points id="alpha-points" items={['First point.', 'Second point.', 'Third point.']} />
  </Item>
  <Item id="beta" title="Beta role" when="2020 to 2022" />
  <Points id="repeated" items={['Same point.', 'Same point.']} />
</Document>;`;

test('local component props resolve through the exact instance that rendered them', () => {
  const value = scoped(helperDocument);
  const title = '<Paragraph id={`${id}-title`}', when = '<Paragraph id={`${id}-when`}';
  assert.deepEqual([value(title, ['<Item id="alpha"'])?.value, value(title, ['<Item id="alpha"'])?.kind], ['Alpha role', 'jsx-attribute']);
  assert.equal(value(title, ['<Item id="beta"'])?.value, 'Beta role');
  const alpha = value(when, ['<Item id="alpha"'])!, beta = value(when, ['<Item id="beta"'])!;
  assert.equal(alpha.value, beta.value);
  assert.notEqual(alpha.start, beta.start, 'Equal wording in two instances keeps two separate sources.');
  assert.equal(value(title, []), undefined, 'A prop without its rendering instance is not a proof.');
  assert.equal(value(title, ['<Points id="repeated"']), undefined, 'An owner that is not an instance of this component is rejected.');
  assert.deepEqual([value('<Heading id={id}', ['<Title id="section"'])?.value, value('<Heading id={id}', ['<Title id="section"'])?.kind], ['First section', 'jsx-text']);
  const nested = value('<Heading id={id}', ['<Title id={heading[0]}', '<Item id="alpha"'])!;
  assert.deepEqual([nested.value, nested.kind], ['History', 'string']);
  const updated = replaceSourceValue(helperDocument, value(title, ['<Item id="beta"'])!, 'Revised “beta” role');
  validateTextSyntax('index.tsx', updated);
  assert.equal(scoped(updated)(title, ['<Item id="beta"'])?.value, 'Revised “beta” role');
  assert.equal(scoped(updated)(title, ['<Item id="alpha"'])?.value, 'Alpha role');
});

test('mapped and helper-passed array literals bind only when the rendered text identifies one element', () => {
  const value = scoped(helperDocument);
  const row = '<Paragraph key={i}';
  for (const text of ['First point.', 'Second point.', 'Third point.']) assert.equal(value(row, ['<Points id="alpha-points"'], text)?.value, text);
  assert.notEqual(value(row, ['<Points id="alpha-points"'], 'First point.')!.start, value(row, ['<Points id="alpha-points"'], 'Second point.')!.start);
  assert.equal(value(row, ['<Points id="alpha-points"']), undefined, 'Several possible elements need the rendered text.');
  assert.equal(value(row, ['<Points id="alpha-points"'], 'Missing point.'), undefined);
  assert.equal(value(row, ['<Points id="repeated"'], 'Same point.'), undefined, 'Duplicate wording is ambiguous and stays read-only.');
  const objects = `function List({ rows }) { return <>{rows.map(row => <Paragraph key={row.id}>{row.label}</Paragraph>)}</>; }
export default () => <List rows={[{ id: 'one', label: 'Readable' }, { id: 'two', label: 'Other' }]}/>;`;
  assert.equal(scoped(objects)('<Paragraph', ['<List'], 'Readable')?.value, 'Readable');
  assert.equal(scoped(objects)('<Paragraph', ['<List'], 'one'), undefined);
});

test('supported prop forms include props objects, defaults, children, destructuring and presence checks', () => {
  for (const [component, call, kind] of [
    ['function Card(props) { return <Paragraph>{props.name}</Paragraph>; }', '<Card name="Readable"/>', 'jsx-attribute'],
    ["function Card({ name = 'Readable' }) { return <Paragraph>{name}</Paragraph>; }", '<Card/>', 'string'],
    ['function Card({ children }) { return <Paragraph>{children}</Paragraph>; }', '<Card>Readable</Card>', 'jsx-text'],
    ['const Card = (props) => { const { name } = props; return <Paragraph>{name}</Paragraph>; };', "<Card name={'Readable'}/>", 'string'],
    ['function Card({ name }) { return <>{name && <Paragraph>{name}</Paragraph>}</>; }', '<Card name="Readable"/>', 'jsx-attribute'],
    ["const label = 'Readable'; function Card({ name }) { return <Paragraph>{name}</Paragraph>; }", '<Card name={label}/>', 'string'],
  ]) {
    const source = `${component}\nexport default () => <Document>${call}</Document>;`;
    const value = scoped(source)('<Paragraph', ['<Card']);
    assert.deepEqual([value?.value, value?.kind], ['Readable', kind], component);
  }
});

test('props shared with identity or logic, escaped components, spreads and mutations stay read-only', () => {
  for (const [component, call, owner] of [
    ['function Card({ name }) { return <Block id={name}><Paragraph>{name}</Paragraph></Block>; }', '<Card name="Readable"/>'],
    ['function Card({ name }) { return <Paragraph key={name}>{name}</Paragraph>; }', '<Card name="Readable"/>'],
    ['function Card({ name }) { return <Paragraph id={`card-${name}`}>{name}</Paragraph>; }', '<Card name="Readable"/>'],
    ["function Card({ name }) { return name === 'Readable' ? <Paragraph>{name}</Paragraph> : null; }", '<Card name="Readable"/>'],
    ['function Card({ children }) { return <Paragraph id={children}>{children}</Paragraph>; }', '<Card>Readable</Card>'],
    ['function Card(props) { return <><Inner {...props}/><Paragraph>{props.name}</Paragraph></>; }', '<Card name="Readable"/>'],
    ["function Card(props) { props.name = 'Readable'; return <Paragraph>{props.name}</Paragraph>; }", '<Card name="Readable"/>'],
    ['function Card({ name }) { return <Paragraph>{name}</Paragraph>; } const alias = Card;', '<Card name="Readable"/>'],
    ['function Card({ name }) { return <Paragraph>{name}</Paragraph>; }', "<><Card name=\"Readable\"/>{Card({ name: 'Other' })}</>"],
    ['function Card({ name, depth }) { return depth ? <Card name={name}/> : <Paragraph>{name}</Paragraph>; }', '<Card name="Readable" depth={1}/>', '<Card name="Readable"'],
    ['function Card({ name }) { return <Paragraph>{name}</Paragraph>; }', '<Card {...other} name="Readable"/>'],
    ["function Card({ name }) { return <Paragraph>{name}</Paragraph>; } const label = 'readable';", '<Card name={label.toUpperCase()}/>'],
    ['function Card({ name }) { return <Paragraph>{name}</Paragraph>; }', "<Card name={pick('Readable')}/>"],
    ['function Card({ items }) { items.reverse(); return <>{items.map(text => <Paragraph>{text}</Paragraph>)}</>; }', "<Card items={['Readable']}/>"],
    ['function Card({ items }) { return <>{items.map(text => <Paragraph key={text}>{text}</Paragraph>)}</>; }', "<Card items={['Readable']}/>"],
    ['function Card({ items }) { return <>{items.map(text => <Paragraph>{text}</Paragraph>)}</>; }', "<Card items={[...more, 'Readable']}/>"],
  ]) {
    const source = `${component}\nexport default () => <Document>${call}</Document>;`;
    assert.equal(scoped(source)('<Paragraph', [owner ?? '<Card'], 'Readable'), undefined, `${component} ${call}`);
  }
  const exported = `export function line(text) { return <Paragraph>{text}</Paragraph>; }\nexport default () => <Document>{line('Readable')}</Document>;`;
  assert.equal(scoped(exported)('<Paragraph', [], 'Readable'), undefined, 'An exported helper can receive values from other files.');
});
