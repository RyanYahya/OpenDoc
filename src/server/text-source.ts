import ts from 'typescript';
import { createHash } from 'node:crypto';
import type { TextSourceValue } from '../shared/selection';

export const textDigest = (text: string) => createHash('sha256').update(text).digest('hex');
export const textSourceBindingId = (file: string, digest: string, start: number, end: number) => textDigest(JSON.stringify([file, digest, start, end]));

function unwrap(node: ts.Expression): ts.Expression {
  while (ts.isParenthesizedExpression(node) || ts.isAsExpression(node) || ts.isTypeAssertionExpression(node) || ts.isNonNullExpression(node) || ts.isSatisfiesExpression(node)) node = node.expression;
  return node;
}

function propertyName(node: ts.PropertyName): string | undefined {
  return ts.isIdentifier(node) || ts.isStringLiteral(node) || ts.isNumericLiteral(node) ? node.text : undefined;
}

function propertyValue(node: ts.ObjectLiteralElementLike): ts.Expression | undefined {
  return ts.isPropertyAssignment(node) ? node.initializer : ts.isShorthandPropertyAssignment(node) && !node.objectAssignmentInitializer ? node.name : undefined;
}

/** Use the same JSX whitespace/entity rules as the TypeScript compiler, without evaluating code. */
function jsxValue(raw: string, attribute: boolean): string | undefined {
  const key = attribute ? 'value' : 'children';
  const input = attribute ? `const x = <T value=${raw}/>;` : `const x = <T>${raw}</T>;`;
  const output = ts.transpileModule(input, { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText;
  const tree = ts.createSourceFile('jsx-value.js', output, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  let value: string | undefined;
  function visit(node: ts.Node) {
    if (ts.isPropertyAssignment(node) && propertyName(node.name) === key && ts.isStringLiteral(node.initializer)) value = node.initializer.text;
    ts.forEachChild(node, visit);
  }
  visit(tree);
  return value;
}

export interface TextSourceResolver {
  resolveAt(line: number, column: number, slot?: string, childIndex?: number): TextSourceValue | undefined;
}

/** Only provable values in this source file are followed. Imported values and arbitrary expressions stay read-only. */
export function createTextSourceResolver(file: string, source: string): TextSourceResolver {
  const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const digest = textDigest(source);
  const options: ts.CompilerOptions = { noResolve: true, noLib: true, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.Preserve };
  const host = ts.createCompilerHost(options);
  host.getSourceFile = name => name === file ? tree : undefined;
  host.fileExists = name => name === file;
  host.readFile = name => name === file ? source : undefined;
  const checker = ts.createProgram([file], options, host).getTypeChecker();
  const nodes: ts.Node[] = [];
  const jsxValues = new Map<ts.Node, string | undefined>();
  function collect(node: ts.Node) { nodes.push(node); ts.forEachChild(node, collect); }
  collect(tree);

  function descriptor(node: ts.Node, kind: TextSourceValue['kind'], value: string): TextSourceValue {
    const start = ts.isJsxText(node) ? node.pos : node.getStart(tree), end = node.end;
    return { file, digest, start, end, kind, value, bindingId: textSourceBindingId(file, digest, start, end) };
  }
  function jsx(node: ts.Node, attribute: boolean) {
    if (!jsxValues.has(node)) jsxValues.set(node, jsxValue(source.slice(ts.isJsxText(node) ? node.pos : node.getStart(tree), node.end), attribute));
    return jsxValues.get(node);
  }

  const safeDeclarations = new Map<ts.VariableDeclaration, boolean>();
  function referenceSymbol(node: ts.Identifier) {
    // In `{ meta }`, the identifier's ordinary symbol is the new object's
    // property; the value symbol is the local variable whose identity escapes.
    return ts.isShorthandPropertyAssignment(node.parent) && node.parent.name === node
      ? checker.getShorthandAssignmentValueSymbol(node.parent) : checker.getSymbolAtLocation(node);
  }
  function isWriteTarget(node: ts.Node): boolean {
    // A reference may sit inside parentheses, a type assertion, or a nested
    // destructuring target. Inspect ancestors instead of only its immediate parent.
    for (let current = node; current.parent; current = current.parent) {
      const parent = current.parent;
      if (ts.isBinaryExpression(parent) && parent.left === current && parent.operatorToken.kind >= ts.SyntaxKind.FirstAssignment && parent.operatorToken.kind <= ts.SyntaxKind.LastAssignment) return true;
      if ((ts.isPrefixUnaryExpression(parent) || ts.isPostfixUnaryExpression(parent)) && (parent.operator === ts.SyntaxKind.PlusPlusToken || parent.operator === ts.SyntaxKind.MinusMinusToken)) return true;
      if (ts.isDeleteExpression(parent)) return true;
      if ((ts.isForOfStatement(parent) || ts.isForInStatement(parent)) && parent.initializer === current) return true;
    }
    return false;
  }
  function safeDeclaration(declaration: ts.VariableDeclaration): boolean {
    if (safeDeclarations.has(declaration)) return safeDeclarations.get(declaration)!;
    safeDeclarations.set(declaration, false);
    if (!declaration.initializer || !ts.isIdentifier(declaration.name) || !ts.isVariableDeclarationList(declaration.parent) || !(declaration.parent.flags & ts.NodeFlags.Const)) return false;
    const symbol = checker.getSymbolAtLocation(declaration.name);
    if (!symbol) return false;
    const object = ts.isObjectLiteralExpression(unwrap(declaration.initializer));
    for (const node of nodes) {
      if (!ts.isIdentifier(node) || node === declaration.name || referenceSymbol(node) !== symbol) continue;
      if (isWriteTarget(node)) return false;
      let usage: ts.Node = node;
      while ((ts.isPropertyAccessExpression(usage.parent) || ts.isElementAccessExpression(usage.parent)) && usage.parent.expression === usage) usage = usage.parent;
      const parent = usage.parent;
      // Objects may only be read through properties. Passing their identity around could hide mutations.
      if (object && usage === node) return false;
      if (object && ts.isCallExpression(parent) && parent.expression === usage) return false;
      if (object) {
        const keys: string[] = [];
        let access = usage;
        while (ts.isPropertyAccessExpression(access) || ts.isElementAccessExpression(access)) {
          const key = ts.isPropertyAccessExpression(access) ? access.name.text : access.argumentExpression && ts.isStringLiteral(access.argumentExpression) ? access.argumentExpression.text : undefined;
          if (key === undefined) return false;
          keys.unshift(key); access = access.expression;
        }
        let read: ts.Expression = unwrap(declaration.initializer);
        for (const key of keys) {
          if (!ts.isObjectLiteralExpression(read) || read.properties.some(item => !propertyValue(item) || !item.name || propertyName(item.name) === undefined)) return false;
          const properties = read.properties.filter(item => propertyName(item.name!) === key);
          if (properties.length !== 1 || !propertyValue(properties[0])) return false;
          read = unwrap(propertyValue(properties[0])!);
        }
        // Never authorize through an object whose nested identity escapes to an alias or a call.
        if (ts.isObjectLiteralExpression(read) || ts.isArrayLiteralExpression(read)) return false;
      }
    }
    safeDeclarations.set(declaration, true);
    return true;
  }

  function expressionNode(input: ts.Expression, seen = new Set<ts.Node>()): ts.Expression | undefined {
    const node = unwrap(input);
    if (seen.has(node)) return undefined;
    seen.add(node);
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isObjectLiteralExpression(node)) return node;
    if (ts.isIdentifier(node)) {
      const symbol = referenceSymbol(node);
      const declarations = symbol?.declarations;
      if (declarations?.length !== 1 || !ts.isVariableDeclaration(declarations[0]) || declarations[0].getSourceFile() !== tree || !safeDeclaration(declarations[0])) return undefined;
      return expressionNode(declarations[0].initializer!, seen);
    }
    if (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) {
      const key = ts.isPropertyAccessExpression(node) ? node.name.text : node.argumentExpression && ts.isStringLiteral(unwrap(node.argumentExpression)) ? (unwrap(node.argumentExpression) as ts.StringLiteral).text : undefined;
      const object = expressionNode(node.expression, seen);
      if (key === undefined || !object || !ts.isObjectLiteralExpression(object)) return undefined;
      if (object.properties.some(property => !propertyValue(property) || !property.name || propertyName(property.name) === undefined)) return undefined;
      const matches = object.properties.filter(property => propertyName(property.name!) === key);
      if (matches.length !== 1 || !propertyValue(matches[0])) return undefined;
      return expressionNode(propertyValue(matches[0])!, seen);
    }
    return undefined;
  }

  const textProps = new Set(['children', 'title', 'subtitle', 'eyebrow', 'byline', 'caption', 'lead', 'body', 'footer', 'description', 'author', 'label']);
  const protectedTokens = new Set<ts.Node>();
  function outerExpression(node: ts.Node) {
    while ((ts.isParenthesizedExpression(node.parent) || ts.isAsExpression(node.parent) || ts.isTypeAssertionExpression(node.parent) || ts.isNonNullExpression(node.parent) || ts.isSatisfiesExpression(node.parent)) && node.parent.expression === node) node = node.parent;
    return node;
  }
  function textConsumer(input: ts.Expression): boolean {
    const node = outerExpression(input), parent = node.parent;
    if (ts.isVariableDeclaration(parent)) {
      // A direct const alias is checked at all of its own uses below.
      return parent.initializer === node && ts.isIdentifier(parent.name) && safeDeclaration(parent);
    }
    if (ts.isJsxExpression(parent) && parent.expression === node) {
      return ts.isJsxAttribute(parent.parent) ? textProps.has(parent.parent.name.getText(tree))
        : ts.isJsxElement(parent.parent) || ts.isJsxFragment(parent.parent);
    }
    // Metadata is a documented text consumer, not an arbitrary escaped object.
    if ((ts.isPropertyAssignment(parent) && parent.initializer === node) || (ts.isShorthandPropertyAssignment(parent) && parent.name === node)) {
      const property = propertyName(parent.name);
      const object = outerExpression(parent.parent);
      const owner = object.parent;
      return property !== undefined && textProps.has(property) && ts.isVariableDeclaration(owner) && ts.isIdentifier(owner.name) && owner.name.text === 'meta' && owner.initializer === object && safeDeclaration(owner);
    }
    return false;
  }
  for (const node of nodes) {
    if (!ts.isIdentifier(node) && !ts.isPropertyAccessExpression(node) && !ts.isElementAccessExpression(node)) continue;
    if (ts.isVariableDeclaration(node.parent) && node.parent.name === node) continue;
    const value = expressionNode(node);
    if (value && (ts.isStringLiteral(value) || ts.isNoSubstitutionTemplateLiteral(value)) && !textConsumer(node)) protectedTokens.add(value);
  }

  function expression(input: ts.Expression): TextSourceValue | undefined {
    const node = expressionNode(input);
    if (!node || protectedTokens.has(node) || (!ts.isStringLiteral(node) && !ts.isNoSubstitutionTemplateLiteral(node))) return undefined;
    return descriptor(node, 'string', node.text);
  }

  function openingAt(line: number, column: number): ts.JsxOpeningElement | ts.JsxSelfClosingElement | undefined {
    if (!Number.isInteger(line) || !Number.isInteger(column) || line < 1 || column < 1) return undefined;
    const starts = tree.getLineStarts();
    if (line > starts.length) return undefined;
    const position = starts[line - 1] + column - 1;
    return nodes.find(node => (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) && node.getStart(tree) <= position && node.tagName.end >= position) as ts.JsxOpeningElement | ts.JsxSelfClosingElement | undefined;
  }

  function attribute(opening: ts.JsxOpeningElement | ts.JsxSelfClosingElement, slot: string): TextSourceValue | undefined {
    // A spread can override an earlier named field, so even a literal beside it is not a proof.
    if (opening.attributes.properties.some(ts.isJsxSpreadAttribute)) return undefined;
    const matches = opening.attributes.properties.filter(item => ts.isJsxAttribute(item) && item.name.getText(tree) === slot);
    if (matches.length !== 1 || !ts.isJsxAttribute(matches[0])) return undefined;
    const initializer = matches[0].initializer;
    if (!initializer) return undefined;
    if (ts.isStringLiteral(initializer)) {
      const value = jsx(initializer, true);
      return value === undefined ? undefined : descriptor(initializer, 'jsx-attribute', value);
    }
    return ts.isJsxExpression(initializer) && initializer.expression ? expression(initializer.expression) : undefined;
  }

  function children(opening: ts.JsxOpeningElement | ts.JsxSelfClosingElement) {
    const rows: { childIndex: number; source?: TextSourceValue }[] = [];
    if (ts.isJsxSelfClosingElement(opening)) {
      const source = attribute(opening, 'children');
      return source ? [{ childIndex: 0, source }] : [];
    }
    const parent = opening.parent;
    if (!ts.isJsxElement(parent)) return rows;
    for (const child of parent.children) {
      if (ts.isJsxExpression(child) && !child.expression) continue;
      let value: TextSourceValue | undefined;
      if (ts.isJsxText(child)) {
        const text = jsx(child, false);
        if (text === undefined || text === '') continue;
        value = descriptor(child, 'jsx-text', text);
      } else if (ts.isJsxExpression(child) && child.expression && !child.dotDotDotToken) value = expression(child.expression);
      rows.push({ childIndex: rows.length, ...(value ? { source: value } : {}) });
    }
    if (!rows.length) {
      const source = attribute(opening, 'children');
      if (source) rows.push({ childIndex: 0, source });
    }
    return rows;
  }

  // Count linked authored occurrences by token identity, not matching visible text.
  const occurrenceCounts = new Map<string, number>();
  const identity = (value: TextSourceValue) => `${value.start}:${value.end}`;
  for (const node of nodes) {
    if (!ts.isJsxOpeningElement(node) && !ts.isJsxSelfClosingElement(node)) continue;
    const values = children(node).map(child => child.source);
    for (const item of node.attributes.properties) if (ts.isJsxAttribute(item) && item.name.getText(tree) !== 'children') values.push(attribute(node, item.name.getText(tree)));
    for (const value of values) if (value) occurrenceCounts.set(identity(value), (occurrenceCounts.get(identity(value)) ?? 0) + 1);
  }
  const linked = (value: TextSourceValue | undefined) => value ? { ...value, linkedOccurrences: occurrenceCounts.get(identity(value)) ?? 1 } : undefined;
  return {
    resolveAt(line, column, slot = 'children', childIndex = 0) {
      const opening = openingAt(line, column);
      if (!opening) return undefined;
      return linked(slot === 'children' ? children(opening)[childIndex]?.source : attribute(opening, slot));
    },
  };
}

export type JsonTextPath = (string | { id: string })[];

/** Index one immutable snapshot; array fields use stable record IDs, never positions. */
export function createJsonTextSourceResolver(file: string, source: string): (path: JsonTextPath) => TextSourceValue | undefined {
  const tree = ts.parseJsonText(file, source);
  if ((tree as unknown as { parseDiagnostics: ts.Diagnostic[] }).parseDiagnostics.length) return () => undefined;
  const root: ts.Expression | undefined = tree.statements[0] && ts.isExpressionStatement(tree.statements[0]) ? tree.statements[0].expression : undefined;
  const digest = textDigest(source);
  const objects = new WeakMap<ts.ObjectLiteralExpression, Map<string, ts.Expression | undefined>>();
  const arrays = new WeakMap<ts.ArrayLiteralExpression, Map<string, ts.Expression | undefined>>();
  function fields(node: ts.ObjectLiteralExpression) {
    let index = objects.get(node);
    if (!index) {
      index = new Map();
      for (const item of node.properties) {
        if (!ts.isPropertyAssignment(item)) continue;
        const key = propertyName(item.name);
        if (key !== undefined) index.set(key, index.has(key) ? undefined : item.initializer);
      }
      objects.set(node, index);
    }
    return index;
  }
  function records(node: ts.ArrayLiteralExpression) {
    let index = arrays.get(node);
    if (!index) {
      index = new Map();
      for (const item of node.elements) {
        const id = ts.isObjectLiteralExpression(item) ? fields(item).get('id') : undefined;
        if (id && ts.isStringLiteral(id)) index.set(id.text, index.has(id.text) ? undefined : item);
      }
      arrays.set(node, index);
    }
    return index;
  }
  return path => {
    // A record's lookup key is structural identity, even when it is displayed.
    if (path.at(-1) === 'id' && typeof path.at(-2) === 'object') return undefined;
    let node = root;
    for (const part of path) {
      if (!node) return undefined;
      if (typeof part === 'string') node = ts.isObjectLiteralExpression(node) ? fields(node).get(part) : undefined;
      else node = ts.isArrayLiteralExpression(node) && part && typeof part.id === 'string' ? records(node).get(part.id) : undefined;
    }
    return node && ts.isStringLiteral(node) ? { file, digest, start: node.getStart(tree), end: node.end, kind: 'json-string', value: node.text, bindingId: textSourceBindingId(file, digest, node.getStart(tree), node.end) } : undefined;
  };
}

export function serializeSourceValue(value: TextSourceValue, next: string): string {
  const serialized = JSON.stringify(next);
  return value.kind === 'jsx-text' || value.kind === 'jsx-attribute' ? `{${serialized}}` : serialized;
}

export function validateTextSyntax(file: string, source: string) {
  if (file.endsWith('.json')) { JSON.parse(source); return; }
  const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const diagnostics = (tree as ts.SourceFile & { parseDiagnostics: ts.Diagnostic[] }).parseDiagnostics;
  if (diagnostics.length) throw new Error(`The correction would make the source invalid: ${ts.flattenDiagnosticMessageText(diagnostics[0].messageText, ' ')}`);
}
