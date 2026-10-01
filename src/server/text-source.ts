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

export interface TextSourceContext {
  /** Component instances outward from the rendered element: each created the previous one. */
  owners?: { line: number; column: number }[];
  /** The rendered text. It selects within a closed set of authored values; it never searches the file. */
  text?: string;
}

export interface TextSourceResolver {
  resolveAt(line: number, column: number, slot?: string, childIndex?: number, context?: TextSourceContext): TextSourceValue | undefined;
}

type Opening = ts.JsxOpeningElement | ts.JsxSelfClosingElement;
/**
 * scope[0] is the JSX element being evaluated and scope[1] the local component
 * instance whose render created it. Without a scope, a component's props are
 * the union of every instance in the file, which is never a proof.
 */
type Scope = readonly Opening[] | undefined;
type Value = { node: ts.Node; scope: Scope };
/** `complete` proves every value an expression can take; partial values still decide protection. */
type Flow = { values: Value[]; complete: boolean; absent?: boolean };
type Role = { kind: 'component'; symbol: ts.Symbol }
  | { kind: 'callback'; receiver: ts.Expression }
  | { kind: 'helper'; sites: { call: ts.CallExpression; callback: boolean }[]; exported: boolean };
const unknown: Flow = { values: [], complete: false };
const partial = (flow: Flow): Flow => ({ values: flow.values, complete: false });
const absent: Flow = { values: [], complete: true, absent: true };
const callbacks = new Set(['map', 'filter']);
const subsets = new Set(['filter', 'slice']);
const arrayMethods = new Set([...callbacks, ...subsets]);

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

  const references = new Map<ts.Symbol, ts.Identifier[]>();
  for (const node of nodes) {
    const symbol = ts.isIdentifier(node) ? referenceSymbol(node) : undefined;
    if (symbol) references.set(symbol, [...(references.get(symbol) ?? []), node as ts.Identifier]);
  }
  const isOpening = (node: ts.Node): node is Opening => ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node);
  const tagSymbol = (opening: Opening) => ts.isIdentifier(opening.tagName) ? checker.getSymbolAtLocation(opening.tagName) : undefined;
  function isArrayCall(node: ts.Node, names: Set<string>): node is ts.CallExpression & { expression: ts.PropertyAccessExpression } {
    return ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && names.has(node.expression.name.text);
  }
  function merge(flows: Flow[]): Flow {
    return { values: flows.flatMap(flow => flow.values), complete: flows.every(flow => flow.complete), absent: flows.some(flow => flow.absent) };
  }
  /** A named same-file function, or undefined for anything that is not a plain declaration. */
  function functionOf(symbol: ts.Symbol | undefined) {
    const declaration = symbol?.declarations?.length === 1 ? symbol.declarations[0] : undefined;
    if (!declaration || declaration.getSourceFile() !== tree) return undefined;
    if (ts.isFunctionDeclaration(declaration)) return declaration;
    const initializer = ts.isVariableDeclaration(declaration) && declaration.initializer && ts.isVariableDeclarationList(declaration.parent) && declaration.parent.flags & ts.NodeFlags.Const ? unwrap(declaration.initializer) : undefined;
    return initializer && (ts.isArrowFunction(initializer) || ts.isFunctionExpression(initializer)) ? initializer : undefined;
  }

  const roles = new Map<ts.Node, Role | undefined>();
  /** Parameters receive authored values only from functions whose every use is known. */
  function role(fn: ts.SignatureDeclaration): Role | undefined {
    if (roles.has(fn)) return roles.get(fn);
    roles.set(fn, undefined);
    const outer = outerExpression(fn);
    const owner = ts.isFunctionDeclaration(fn) ? fn : ts.isVariableDeclaration(outer.parent) && outer.parent.initializer === outer ? outer.parent : undefined;
    const symbol = owner?.name && functionOf(checker.getSymbolAtLocation(owner.name)) === fn ? checker.getSymbolAtLocation(owner.name) : undefined;
    let result: Role | undefined;
    if (!symbol) {
      const call = outer.parent;
      if ((ts.isArrowFunction(fn) || ts.isFunctionExpression(fn)) && isArrayCall(call, callbacks) && call.arguments[0] === outer) result = { kind: 'callback', receiver: call.expression.expression };
    } else {
      const uses = (references.get(symbol) ?? []).filter(node => node !== owner!.name);
      const tags = uses.filter(node => (isOpening(node.parent) || ts.isJsxClosingElement(node.parent)) && node.parent.tagName === node);
      // A recursive component could pass its own closure to a nested instance of itself.
      if (uses.length && tags.length === uses.length && fn.parameters.length <= 1 && !tags.some(tag => tag.pos >= fn.pos && tag.end <= fn.end)) result = { kind: 'component', symbol };
      else {
        const sites = uses.map(use => {
          const reference = outerExpression(use), call = reference.parent;
          if (ts.isCallExpression(call) && call.expression === reference) return { call, callback: false };
          return isArrayCall(call, callbacks) && call.arguments[0] === reference ? { call, callback: true } : undefined;
        });
        if (sites.every(site => !!site)) result = { kind: 'helper', sites, exported: !!(ts.getCombinedModifierFlags(owner!) & ts.ModifierFlags.Export) };
      }
    }
    roles.set(fn, result);
    return result;
  }
  function component(opening: Opening) {
    const fn = functionOf(tagSymbol(opening));
    return !!fn && role(fn)?.kind === 'component';
  }

  type Seen = Map<ts.Node, Set<number>>;
  const memo = new Map<ts.Node, Flow>();
  let cycles = 0;
  /** Values an expression can take, following only same-file literals, constants, props and arguments. */
  function flow(input: ts.Expression, scope: Scope, seen: Seen = new Map()): Flow {
    const node = unwrap(input), depth = scope?.length ?? -1;
    if (!scope && memo.has(node)) return memo.get(node)!;
    const visiting = seen.get(node) ?? new Set<number>();
    if (visiting.has(depth)) { cycles++; return unknown; }
    visiting.add(depth); seen.set(node, visiting);
    const before = cycles;
    try {
      const result = evaluate(node, scope, seen);
      // A result cut short by a cycle is only valid for this path.
      if (!scope && cycles === before) memo.set(node, result);
      return result;
    } finally { visiting.delete(depth); }
  }
  function evaluate(node: ts.Expression, scope: Scope, seen: Seen): Flow {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isObjectLiteralExpression(node) || ts.isArrayLiteralExpression(node)) return { values: [{ node, scope }], complete: true };
    if (ts.isIdentifier(node)) {
      const declarations = referenceSymbol(node)?.declarations;
      const declaration = declarations?.length === 1 && declarations[0].getSourceFile() === tree ? declarations[0] : undefined;
      if (declaration && ts.isVariableDeclaration(declaration) && ts.isIdentifier(declaration.name)) return safeDeclaration(declaration) ? flow(declaration.initializer!, scope, seen) : unknown;
      return declaration && (ts.isParameter(declaration) || ts.isBindingElement(declaration)) ? binding(declaration, scope, seen) : unknown;
    }
    if (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) {
      const argument = ts.isElementAccessExpression(node) ? unwrap(node.argumentExpression) : undefined;
      const key = ts.isPropertyAccessExpression(node) ? node.name.text
        : argument && (ts.isStringLiteral(argument) || ts.isNumericLiteral(argument) || ts.isNoSubstitutionTemplateLiteral(argument)) ? argument.text : undefined;
      return member(flow(node.expression, scope, seen), key, seen);
    }
    if (isArrayCall(node, subsets)) {
      // filter and slice keep a subset of the same authored elements.
      const container = flow(node.expression.expression, scope, seen);
      return { values: container.values, complete: container.complete && container.values.every(value => ts.isArrayLiteralExpression(value.node)) };
    }
    return unknown;
  }
  function binding(declaration: ts.ParameterDeclaration | ts.BindingElement, scope: Scope, seen: Seen): Flow {
    let result: Flow;
    if (ts.isParameter(declaration)) result = argumentFlow(declaration.parent, declaration.parent.parameters.indexOf(declaration), scope, seen);
    else {
      const pattern = declaration.parent, owner = pattern.parent;
      const container = ts.isParameter(owner) || ts.isBindingElement(owner) ? binding(owner, scope, seen)
        : owner.initializer && ts.isVariableDeclarationList(owner.parent) && owner.parent.flags & ts.NodeFlags.Const ? flow(owner.initializer, scope, seen) : unknown;
      const name = declaration.propertyName ?? declaration.name;
      const key = declaration.dotDotDotToken ? undefined : ts.isArrayBindingPattern(pattern) ? String(pattern.elements.indexOf(declaration))
        : ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name) ? name.text : undefined;
      // A rest binding carries the remaining container itself.
      result = declaration.dotDotDotToken ? partial(container) : member(container, key, seen);
    }
    return result.absent && declaration.initializer ? merge([{ ...result, absent: false }, flow(declaration.initializer, scope, seen)]) : result;
  }
  function argumentFlow(fn: ts.SignatureDeclaration, index: number, scope: Scope, seen: Seen): Flow {
    const kind = role(fn);
    if (!kind) return unknown;
    if (kind.kind === 'component') {
      if (index !== 0) return unknown;
      if (!scope) return partial({ values: (references.get(kind.symbol) ?? []).map(node => node.parent).filter(isOpening).map(node => ({ node, scope: undefined })), complete: false });
      // The exact instance that rendered this element, never a search by wording.
      const instance = scope[1];
      return instance && tagSymbol(instance) === kind.symbol ? { values: [{ node: instance, scope: scope.slice(1) }], complete: true } : unknown;
    }
    if (kind.kind === 'callback') return index === 0 ? elements(flow(kind.receiver, scope, seen), seen) : unknown;
    const result = merge(kind.sites.map(({ call, callback }) => callback
      ? index === 0 ? elements(flow((call.expression as ts.PropertyAccessExpression).expression, scope, seen), seen) : unknown
      : argument(call, index, scope, seen)));
    return kind.exported ? partial(result) : result;
  }
  function argument(call: ts.CallExpression, index: number, scope: Scope, seen: Seen): Flow {
    const spread = call.arguments.findIndex(ts.isSpreadElement);
    if (spread >= 0 && spread <= index) return partial(merge(call.arguments.slice(spread).map(item => flow(ts.isSpreadElement(item) ? item.expression : item, scope, seen))));
    return index < call.arguments.length ? flow(call.arguments[index], scope, seen) : absent;
  }
  function elements(container: Flow, seen: Seen): Flow {
    const flows: Flow[] = container.complete ? [] : [unknown];
    for (const { node, scope } of container.values) {
      if (!ts.isArrayLiteralExpression(node)) { flows.push(unknown); continue; }
      for (const element of node.elements) {
        if (ts.isOmittedExpression(element)) continue;
        flows.push(ts.isSpreadElement(element) ? partial(elements(flow(element.expression, scope, seen), seen)) : flow(element, scope, seen));
      }
    }
    return merge(flows);
  }
  function member(container: Flow, key: string | undefined, seen: Seen): Flow {
    const flows: Flow[] = container.complete ? [] : [unknown];
    for (const { node, scope } of container.values) {
      if (ts.isObjectLiteralExpression(node)) {
        const regular = node.properties.every(item => propertyValue(item) && item.name && propertyName(item.name) !== undefined);
        const matches = node.properties.filter(item => key === undefined || (item.name && propertyName(item.name) === key));
        const values = merge(matches.map(item => propertyValue(item) ? flow(propertyValue(item)!, scope, seen) : unknown));
        flows.push(regular && key !== undefined && matches.length <= 1 ? matches.length ? values : absent : partial(values));
      } else if (ts.isArrayLiteralExpression(node)) {
        const index = key !== undefined && /^\d+$/.test(key) ? Number(key) : undefined;
        const spread = node.elements.findIndex(ts.isSpreadElement);
        if (key === undefined || (index !== undefined && spread >= 0 && spread <= index)) flows.push(partial(elements({ values: [{ node, scope }], complete: true }, seen)));
        else if (index === undefined) flows.push(unknown);
        else flows.push(index >= node.elements.length || ts.isOmittedExpression(node.elements[index]) ? absent : flow(node.elements[index], scope, seen));
      } else if (isOpening(node)) flows.push(prop(node, key, scope, seen));
      else flows.push(unknown);
    }
    return merge(flows);
  }
  /** Read a prop at one component instance; JSX children replace a children attribute. */
  function prop(opening: Opening, key: string | undefined, scope: Scope, seen: Seen): Flow {
    const attributes = opening.attributes.properties;
    if (key === undefined) return partial(merge([...attributes.map(item => ts.isJsxAttribute(item) ? attributeFlow(item, scope, seen) : flow(item.expression, scope, seen)), childrenFlow(opening, scope, seen)]));
    const named = attributes.filter((item): item is ts.JsxAttribute => ts.isJsxAttribute(item) && item.name.getText(tree) === key);
    const result = key === 'children' && childRows(opening).length ? childrenFlow(opening, scope, seen)
      : named.length === 1 ? attributeFlow(named[0], scope, seen) : named.length ? partial(merge(named.map(item => attributeFlow(item, scope, seen)))) : absent;
    // A spread can override an earlier named field, so even a literal beside it is not a proof.
    return attributes.some(ts.isJsxSpreadAttribute) ? partial(result) : result;
  }
  function attributeFlow(attribute: ts.JsxAttribute, scope: Scope, seen: Seen = new Map()): Flow {
    const initializer = attribute.initializer;
    if (initializer && ts.isStringLiteral(initializer)) return { values: [{ node: initializer, scope }], complete: true };
    return initializer && ts.isJsxExpression(initializer) && initializer.expression ? flow(initializer.expression, scope, seen) : unknown;
  }
  const rows = new Map<Opening, ts.JsxChild[]>();
  function childRows(opening: Opening) {
    if (!ts.isJsxOpeningElement(opening) || !ts.isJsxElement(opening.parent)) return [];
    if (!rows.has(opening)) rows.set(opening, opening.parent.children.filter(child => ts.isJsxText(child) ? !!jsx(child, false) : !ts.isJsxExpression(child) || !!child.expression));
    return rows.get(opening)!;
  }
  function rowFlow(row: ts.JsxChild, scope: Scope, seen: Seen = new Map()): Flow {
    if (ts.isJsxText(row)) return { values: [{ node: row, scope }], complete: true };
    return ts.isJsxExpression(row) && row.expression && !row.dotDotDotToken ? flow(row.expression, scope, seen) : unknown;
  }
  function childrenFlow(opening: Opening, scope: Scope, seen: Seen): Flow {
    const flows = childRows(opening).map(row => rowFlow(row, scope, seen));
    return flows.length === 1 ? flows[0] : flows.length ? partial(merge(flows)) : absent;
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
      // A direct const alias or destructuring is checked at all of its own uses below.
      if (parent.initializer !== node) return false;
      return ts.isIdentifier(parent.name) ? safeDeclaration(parent) : ts.isVariableDeclarationList(parent.parent) && !!(parent.parent.flags & ts.NodeFlags.Const);
    }
    if (ts.isJsxExpression(parent) && parent.expression === node) {
      // A local component's props are checked where its body uses them.
      return ts.isJsxAttribute(parent.parent) ? component(parent.parent.parent.parent) || textProps.has(parent.parent.name.getText(tree))
        : ts.isJsxElement(parent.parent) || ts.isJsxFragment(parent.parent);
    }
    // `{value && <Paragraph>{value}</Paragraph>}` only tests whether optional text is present.
    if ((ts.isBinaryExpression(parent) && parent.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken && parent.left === node) || (ts.isConditionalExpression(parent) && parent.condition === node)) {
      const use = outerExpression(parent).parent;
      return ts.isJsxExpression(use) && (ts.isJsxElement(use.parent) || ts.isJsxFragment(use.parent));
    }
    if (ts.isCallExpression(parent) && parent.arguments.some(item => item === node)) {
      const fn = ts.isIdentifier(unwrap(parent.expression)) ? functionOf(checker.getSymbolAtLocation(unwrap(parent.expression))) : undefined;
      return !!fn && role(fn)?.kind === 'helper';
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
  /** Whether a reference exposes its value (or everything it contains) to logic, identity, or unknown code. */
  function exposure(node: ts.Expression): 'value' | 'deep' | undefined {
    const outer = outerExpression(node), parent = outer.parent;
    if (isWriteTarget(outer)) return 'deep';
    if ((ts.isPropertyAccessExpression(parent) || ts.isElementAccessExpression(parent)) && parent.expression === outer) {
      // A length adapts layout without revealing the text itself.
      if (ts.isPropertyAccessExpression(parent) && parent.name.text === 'length') return undefined;
      const call = parent.parent;
      return ts.isCallExpression(call) && call.expression === parent && !isArrayCall(call, arrayMethods) ? 'deep' : 'value';
    }
    if (ts.isCallExpression(parent) && parent.expression === outer) return undefined;
    return textConsumer(node) ? undefined : 'deep';
  }
  function protect(values: Value[], deep: boolean, visited = new Set<ts.Node>()) {
    for (const { node, scope } of values) {
      if (visited.has(node)) continue;
      visited.add(node);
      if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isJsxText(node)) protectedTokens.add(node);
      else if (!deep) continue;
      else if (ts.isObjectLiteralExpression(node)) for (const item of node.properties) {
        const value = propertyValue(item) ?? (ts.isSpreadAssignment(item) ? item.expression : undefined);
        if (value) protect(flow(value, scope).values, true, visited);
      } else if (ts.isArrayLiteralExpression(node)) {
        for (const element of node.elements) if (!ts.isOmittedExpression(element)) protect(flow(ts.isSpreadElement(element) ? element.expression : element, scope).values, true, visited);
      } else if (isOpening(node)) protect(prop(node, undefined, scope, new Map()).values, true, visited);
    }
  }
  for (const node of nodes) {
    if (ts.isIdentifier(node)) {
      const declaration = referenceSymbol(node)?.declarations?.[0];
      if (!declaration || declaration.getSourceFile() !== tree || !(ts.isVariableDeclaration(declaration) || ts.isParameter(declaration) || ts.isBindingElement(declaration))) continue;
      // Declared names, attribute names, and member names are not reads of the value.
      if ((node.getStart(tree) >= declaration.name.getStart(tree) && node.end <= declaration.name.end) || ts.isJsxAttribute(node.parent)
        || (ts.isBindingElement(node.parent) && node.parent.propertyName === node) || (ts.isPropertyAccessExpression(node.parent) && node.parent.name === node)) continue;
    } else if (!ts.isPropertyAccessExpression(node) && !ts.isElementAccessExpression(node) && !isArrayCall(node, subsets)) continue;
    const level = exposure(node as ts.Expression);
    if (level) protect(flow(node as ts.Expression, undefined).values, level === 'deep');
  }

  function textValue({ node }: Value): TextSourceValue | undefined {
    if (ts.isJsxText(node)) { const value = jsx(node, false); return value ? descriptor(node, 'jsx-text', value) : undefined; }
    if (ts.isStringLiteral(node) && ts.isJsxAttribute(node.parent)) { const value = jsx(node, true); return value === undefined ? undefined : descriptor(node, 'jsx-attribute', value); }
    return ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) ? descriptor(node, 'string', node.text) : undefined;
  }
  /** One unprotected authored token, only when every possible value is known and the rendered text identifies exactly one. */
  function bind(result: Flow, text?: string): TextSourceValue | undefined {
    if (!result.complete) return undefined;
    const candidates = new Map<ts.Node, TextSourceValue>();
    for (const value of result.values) {
      const source = textValue(value);
      if (!source) return undefined;
      if (text === undefined || source.value === text) candidates.set(value.node, source);
    }
    if (candidates.size !== 1) return undefined;
    const [[node, source]] = candidates;
    return protectedTokens.has(node) ? undefined : source;
  }

  function openingAt(line: number, column: number): Opening | undefined {
    if (!Number.isInteger(line) || !Number.isInteger(column) || line < 1 || column < 1) return undefined;
    const starts = tree.getLineStarts();
    if (line > starts.length) return undefined;
    const position = starts[line - 1] + column - 1;
    return nodes.find(node => isOpening(node) && node.getStart(tree) <= position && node.tagName.end >= position) as Opening | undefined;
  }

  function attribute(opening: Opening, slot: string, scope?: Scope, text?: string): TextSourceValue | undefined {
    // A spread can override an earlier named field, so even a literal beside it is not a proof.
    if (opening.attributes.properties.some(ts.isJsxSpreadAttribute)) return undefined;
    const matches = opening.attributes.properties.filter(item => ts.isJsxAttribute(item) && item.name.getText(tree) === slot);
    return matches.length === 1 && ts.isJsxAttribute(matches[0]) ? bind(attributeFlow(matches[0], scope), text) : undefined;
  }

  function child(opening: Opening, index: number, scope?: Scope, text?: string): TextSourceValue | undefined {
    const children = childRows(opening);
    if (!children.length) return index === 0 ? attribute(opening, 'children', scope, text) : undefined;
    return children[index] ? bind(rowFlow(children[index], scope), text) : undefined;
  }

  // Count linked authored occurrences by token identity, not matching visible text.
  const occurrenceCounts = new Map<string, number>();
  const identity = (value: TextSourceValue) => `${value.start}:${value.end}`;
  for (const node of nodes) {
    if (!isOpening(node)) continue;
    const count = childRows(node).length;
    const values = count ? Array.from({ length: count }, (_, index) => child(node, index)) : [child(node, 0)];
    for (const item of node.attributes.properties) if (ts.isJsxAttribute(item) && item.name.getText(tree) !== 'children') values.push(attribute(node, item.name.getText(tree)));
    for (const value of values) if (value) occurrenceCounts.set(identity(value), (occurrenceCounts.get(identity(value)) ?? 0) + 1);
  }
  const linked = (value: TextSourceValue | undefined) => value ? { ...value, linkedOccurrences: occurrenceCounts.get(identity(value)) ?? 1 } : undefined;
  return {
    resolveAt(line, column, slot = 'children', childIndex = 0, context = {}) {
      const opening = openingAt(line, column);
      if (!opening) return undefined;
      const scope: Opening[] = [opening];
      for (const owner of context.owners ?? []) {
        const instance = openingAt(owner.line, owner.column);
        if (!instance) break;
        scope.push(instance);
      }
      return linked(slot === 'children' ? child(opening, childIndex, scope, context.text) : attribute(opening, slot, scope, context.text));
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
