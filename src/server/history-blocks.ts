import ts from 'typescript';
import { blockName, readableKind, type HistoryBlockChange, type RestoreAvailability } from '../shared/history';

/** One JSX element with a literal `id`, located in one authored source file. */
export interface SourceBlock {
  id: string;
  file: string;
  kind: string;
  /** A literal `role` attribute, such as a paragraph's "caption". */
  role?: string;
  start: number;
  end: number;
  parent: string | null;
  /** Directly nested blocks with literal IDs, in source order. */
  children: string[];
  /** Complete element source, including nested blocks. */
  source: string;
  /** Element source with nested blocks replaced by placeholders: what belongs to this block alone. */
  own: string;
}

export interface BlockIndex {
  file: string;
  source: string;
  blocks: SourceBlock[];
  error?: string;
}

const blockSource = /\.(?:tsx|jsx|ts|js|mjs)$/;
export const isBlockSource = (file: string) => blockSource.test(file);

const marker = (id: string) => `\u0000${id}\u0000`;
const normalize = (text: string) => text.replace(/\s+/g, ' ').trim();

function literalAttribute(element: ts.JsxOpeningElement | ts.JsxSelfClosingElement, name: string): string | undefined {
  for (const property of element.attributes.properties) {
    if (!ts.isJsxAttribute(property) || property.name.getText() !== name || !property.initializer) continue;
    const value = property.initializer;
    if (ts.isStringLiteral(value)) return value.text;
    if (ts.isJsxExpression(value) && value.expression && (ts.isStringLiteral(value.expression) || ts.isNoSubstitutionTemplateLiteral(value.expression))) return value.expression.text;
    return undefined;
  }
  return undefined;
}
const literalId = (element: ts.JsxOpeningElement | ts.JsxSelfClosingElement) => literalAttribute(element, 'id');

function scriptKind(file: string) {
  return file.endsWith('.tsx') ? ts.ScriptKind.TSX : file.endsWith('.jsx') ? ts.ScriptKind.JSX : file.endsWith('.ts') ? ts.ScriptKind.TS : ts.ScriptKind.JS;
}

/** Locate literal-ID JSX elements without evaluating code. Generated IDs stay invisible on purpose. */
export function indexBlocks(file: string, source: string): BlockIndex {
  const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, scriptKind(file));
  const diagnostics = (tree as ts.SourceFile & { parseDiagnostics: ts.Diagnostic[] }).parseDiagnostics;
  if (diagnostics.length) return { file, source, blocks: [], error: ts.flattenDiagnosticMessageText(diagnostics[0].messageText, ' ') };
  const blocks: SourceBlock[] = [];
  const stack: SourceBlock[] = [];
  function visit(node: ts.Node) {
    let block: SourceBlock | undefined;
    if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) {
      const opening = ts.isJsxElement(node) ? node.openingElement : node;
      const id = literalId(opening);
      if (id !== undefined) {
        const start = node.getStart(tree);
        const role = literalAttribute(opening, 'role');
        block = { id, file, kind: opening.tagName.getText(tree), ...(role ? { role } : {}), start, end: node.end, parent: stack.at(-1)?.id ?? null, children: [], source: source.slice(start, node.end), own: '' };
        stack.at(-1)?.children.push(id);
        blocks.push(block);
        stack.push(block);
      }
    }
    ts.forEachChild(node, visit);
    if (block) {
      stack.pop();
      // Replace direct children from the end so earlier offsets stay valid.
      let own = block.source;
      const direct = blocks.filter(item => item !== block && item.start >= block!.start && item.end <= block!.end && item.parent === block!.id)
        .sort((a, b) => b.start - a.start);
      for (const child of direct) own = own.slice(0, child.start - block.start) + marker(child.id) + own.slice(child.end - block.start);
      block.own = own;
    }
  }
  visit(tree);
  return { file, source, blocks };
}

const separator = '\u0001';
const textAttributes = new Set(['children', 'title', 'subtitle', 'eyebrow', 'lead', 'caption', 'label', 'attribution', 'sourceNote', 'byline', 'footer', 'description', 'author', 'quote', 'body', 'heading', 'text', 'rows', 'columns', 'items', 'alt']);
const skippedProperties = new Set(['id', 'align', 'width', 'style', 'key']);

/** A readable approximation of the words a block carries, for comparing versions at a glance. */
export function blockText(file: string, source: string, ownOnly = true) {
  const tree = ts.createSourceFile(file, `const __block = (${source});`, ts.ScriptTarget.Latest, true, scriptKind(file) === ts.ScriptKind.TS ? ts.ScriptKind.TSX : scriptKind(file));
  const parts: string[] = [];
  let root: ts.Node | undefined;
  function visit(node: ts.Node, collecting: boolean) {
    if ((ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node))) {
      const opening = ts.isJsxElement(node) ? node.openingElement : node;
      if (root && ownOnly && literalId(opening) !== undefined) return;
      root ??= node;
      // Separate attribute values (title, lead) from each other and from the children's text.
      for (const property of opening.attributes.properties) {
        if (ts.isJsxAttribute(property) && property.initializer && textAttributes.has(property.name.getText(tree))) { parts.push(separator); visit(property.initializer, true); parts.push(separator); }
      }
      if (ts.isJsxElement(node)) for (const child of node.children) visit(child, true);
      return;
    }
    if (ts.isJsxText(node)) { const value = normalize(node.text); if (value) parts.push(value); return; }
    if (ts.isPropertyAssignment(node) && skippedProperties.has(node.name.getText(tree))) return;
    if (collecting && (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node))) { const value = normalize(node.text); if (value) parts.push(value); return; }
    ts.forEachChild(node, child => visit(child, collecting));
  }
  visit(tree, false);
  return parts.join(' ').split(separator).map(part => part.trim().replace(/\s+([,.;:!?])/g, '$1')).filter(Boolean).join(' · ');
}

// Comparisons carry whole paragraphs, so word differences late in a long block stay visible; the panel compacts them.
export const comparedLength = 2000;

export function excerpt(text: string, limit = 280) {
  return text.length > limit ? `${text.slice(0, limit - 1).trimEnd()}…` : text;
}

/** How people see a block: its readable kind and opening words, never its ID. */
export function describeBlock(block: SourceBlock) {
  return { kindLabel: readableKind(block.kind, block.role), name: blockName(blockText(block.file, block.source, block.children.length > 0)) };
}

/** A block named in a sentence, such as `section “Plan”`, falling back to its kind alone. */
function mention(block: SourceBlock) {
  const { kindLabel, name } = describeBlock(block);
  return name ? `${kindLabel.toLowerCase()} “${name}”` : kindLabel.toLowerCase();
}

/** All literal-ID blocks across a snapshot's authored source files. */
export interface SnapshotBlocks {
  byId: Map<string, SourceBlock[]>;
  indexes: Map<string, BlockIndex>;
  errors: string[];
}

export function snapshotBlocks(files: Map<string, string>): SnapshotBlocks {
  const byId = new Map<string, SourceBlock[]>();
  const indexes = new Map<string, BlockIndex>();
  const errors: string[] = [];
  for (const [file, source] of [...files].sort(([a], [b]) => a.localeCompare(b))) {
    if (!isBlockSource(file)) continue;
    const index = indexBlocks(file, source);
    indexes.set(file, index);
    if (index.error) errors.push(`${file}: ${index.error}`);
    for (const block of index.blocks) byId.set(block.id, [...byId.get(block.id) ?? [], block]);
  }
  return { byId, indexes, errors };
}

function descendants(snapshot: SnapshotBlocks, block: SourceBlock): string[] {
  const index = snapshot.indexes.get(block.file);
  return index ? index.blocks.filter(item => item !== block && item.start >= block.start && item.end <= block.end).map(item => item.id) : [];
}

const refused = (reason: string): RestoreAvailability => ({ ok: false, reason });
const allowed: RestoreAvailability = { ok: true };

/** Compare literal-ID blocks between a recorded version and the current source. */
export function compareBlocks(before: SnapshotBlocks, current: SnapshotBlocks): HistoryBlockChange[] {
  const ids = [...new Set([...before.byId.keys(), ...current.byId.keys()])];
  const changes: (HistoryBlockChange & { order: [string, number] })[] = [];
  for (const id of ids) {
    const old = before.byId.get(id) ?? [], now = current.byId.get(id) ?? [];
    const sample = now[0] ?? old[0];
    const order: [string, number] = [sample.file, sample.start];
    const container = old.some(item => item.children.length > 0) || now.some(item => item.children.length > 0);
    // Names are derived only for blocks that changed; most blocks are skipped below.
    const base = () => ({ id, file: sample.file, kind: sample.kind, ...describeBlock(sample), parent: sample.parent, container });
    if (old.length > 1 || now.length > 1) {
      if (old.map(item => normalize(item.source)).join('\0') === now.map(item => normalize(item.source)).join('\0')) continue;
      const reason = `This block’s ID (“${id}”) is used more than once, so OpenDoc cannot tell which copy to restore. Restore the whole version instead.`;
      changes.push({ ...base(), order, status: 'ambiguous', descendants: [], block: refused(reason), section: refused(reason) });
      continue;
    }
    if (!now.length) {
      const parent = old[0].parent ? before.byId.get(old[0].parent)?.[0] : undefined;
      const reason = `This block was removed later. Restore ${parent ? `the ${mention(parent)} that contained it` : 'the section that contained it'}, or the whole version.`;
      changes.push({ ...base(), order, status: 'removed', before: excerpt(blockText(old[0].file, old[0].source, false), 600), descendants: descendants(before, old[0]), block: refused(reason), section: refused(reason) });
      continue;
    }
    if (!old.length) {
      const reason = 'This block did not exist in that version. Restore its section or the whole version to remove it.';
      changes.push({ ...base(), order, status: 'added', after: excerpt(blockText(now[0].file, now[0].source, false), 600), descendants: descendants(current, now[0]), block: refused(reason), section: refused(reason) });
      continue;
    }
    const [was, is] = [old[0], now[0]];
    if (was.file !== is.file) {
      const reason = `This block moved from ${was.file} to ${is.file}. Restore the whole version instead.`;
      changes.push({ ...base(), order, status: 'moved', descendants: [], block: refused(reason), section: refused(reason) });
      continue;
    }
    const ownChanged = normalize(was.own) !== normalize(is.own);
    const subtreeChanged = normalize(was.source) !== normalize(is.source);
    if (!ownChanged && !subtreeChanged) continue;
    const sameChildren = was.children.join('\0') === is.children.join('\0');
    const block = !ownChanged ? refused('Only blocks inside it changed. Restore the section, or choose a block inside it.')
      : container && !sameChildren ? refused('Blocks inside it were added, removed, or reordered. Restore the whole section instead.')
        : allowed;
    changes.push({
      ...base(), order,
      status: ownChanged ? 'changed' : 'contents',
      before: excerpt(blockText(was.file, was.source, container), comparedLength), after: excerpt(blockText(is.file, is.source, container), comparedLength),
      descendants: [...new Set([...descendants(before, was), ...descendants(current, is)])],
      block, section: container ? allowed : block,
    });
  }
  return changes.sort((a, b) => a.order[0].localeCompare(b.order[0]) || a.order[1] - b.order[1]).map(({ order: _order, ...change }) => change);
}

export class RestoreRefusal extends Error {}

/**
 * Replace one block's source range in the current file with its recorded form.
 * `block` restores the element's own content and keeps the current nested blocks;
 * `section` restores the element with everything inside it.
 */
export function restoreBlockSource(before: SnapshotBlocks, current: SnapshotBlocks, id: string, scope: 'block' | 'section') {
  const change = compareBlocks(before, current).find(item => item.id === id);
  const old = before.byId.get(id) ?? [], now = current.byId.get(id) ?? [];
  if (!old.length && !now.length) {
    // Composite blocks derive child IDs such as `<id>-heading`; point at the authored owner.
    const owner = [...new Set([...before.byId.keys(), ...current.byId.keys()])].filter(key => id.startsWith(`${key}-`)).sort((a, b) => b.length - a.length)[0];
    if (owner) throw new RestoreRefusal(`“${id}” is produced by the block “${owner}”. Restore “${owner}” instead.`);
  }
  if (!old.length && !now.length) throw new RestoreRefusal(`No block with the literal ID “${id}” exists in that version or the current source. Blocks whose IDs are generated by code can only be restored with the whole version.`);
  if (!change) throw new RestoreRefusal('This block is already the same as in that version.');
  const availability = scope === 'block' ? change.block : change.section;
  if (!availability.ok) throw new RestoreRefusal(availability.reason ?? 'This block cannot be restored on its own.');
  const [was, is] = [old[0], now[0]];
  const index = current.indexes.get(is.file)!;
  let replacement = was.source;
  if (scope === 'block') {
    // Keep the current nested blocks, in the recorded order (which equals the current order).
    const wasChildren = (before.indexes.get(was.file)?.blocks ?? []).filter(item => item.parent === was.id && item.start >= was.start && item.end <= was.end).sort((a, b) => b.start - a.start);
    for (const child of wasChildren) {
      const currentChild = current.byId.get(child.id)?.[0];
      if (!currentChild) throw new RestoreRefusal('Blocks inside it changed. Restore the whole section instead.');
      replacement = replacement.slice(0, child.start - was.start) + currentChild.source + replacement.slice(child.end - was.start);
    }
  }
  const contents = index.source.slice(0, is.start) + replacement + index.source.slice(is.end);
  const after = indexBlocks(is.file, contents);
  if (after.error) throw new RestoreRefusal(`Restoring this block would make ${is.file} invalid (${after.error}). The file was not changed.`);
  // Count every ID across the whole document after the change; only newly introduced duplicates refuse.
  const counts = new Map<string, number>();
  for (const item of after.blocks) counts.set(item.id, (counts.get(item.id) ?? 0) + 1);
  for (const [key, blocks] of current.byId) for (const item of blocks) if (item.file !== is.file) counts.set(key, (counts.get(key) ?? 0) + 1);
  const duplicated = [...counts].filter(([key, count]) => count > 1 && (current.byId.get(key)?.length ?? 0) <= 1).map(([key]) => key);
  if (duplicated.length) throw new RestoreRefusal(`Restoring this ${scope} would duplicate ${duplicated.map(key => `“${key}”`).join(', ')}, which now exists elsewhere in the document. Restore the whole version instead.`);
  if (counts.get(id) !== 1) throw new RestoreRefusal('The restored block could not be located exactly once. The file was not changed.');
  return { file: is.file, contents };
}
