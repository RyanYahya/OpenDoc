import React, { createElement, isValidElement, type ReactElement, type ReactNode } from 'react';
import * as F from '@formepdf/react';
import type { SourceLocation } from '../shared/types';
import type { TextRun, TextSourceValue, TextTarget } from '../shared/selection';

export type TextFieldPath = (string | { id: string })[];
export interface TextSlotProps {
  /** Stable content name, independent of pagination and array order. */
  slot: string;
  /** A literal prop on the calling component. */
  from?: string;
  /** A string in the instance's provenance.dataFile; arrays use record IDs. */
  field?: TextFieldPath;
  /** Internal offset when a native block groups its authored children. */
  childIndex?: number;
  /** Set false for a generated slot whose identity depends on array position. */
  stable?: boolean;
  reason?: string;
  children?: ReactNode;
}

/** Transparent source provenance. It introduces no text, styles, or PDF nodes. */
export function TextSlot({ children }: TextSlotProps) { return <>{children}</>; }

export type TextResolution = (location: SourceLocation, slot: string, childIndex?: number) => TextSourceValue | undefined;
export type TextGlobals = typeof globalThis & {
  __opendocResolveTextSource?: TextResolution;
  __opendocResolveTextField?: (field: TextFieldPath) => TextSourceValue | undefined;
};
type Binding = { slot?: string; source?: TextSourceValue; origin?: SourceLocation; from?: string; childIndex?: number; stable?: boolean; protected?: boolean; reason?: string };
const textTypes = new Set<unknown>([F.Text, F.H1, F.H2, F.H3, F.H4, F.H5, F.H6]);

function rawText(node: ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(rawText).join('');
  return isValidElement<{ children?: ReactNode }>(node) ? rawText(node.props.children) : '';
}

/** Capture authored leaves before Forme flattens inline runs into text lines. */
export class TextCapture {
  private bindings = new WeakMap<object, Binding>();
  private origins = new WeakMap<object, SourceLocation>();
  constructor(private sourceMap: WeakMap<object, SourceLocation>) {}

  remember(element: object, source?: SourceLocation) { if (source) this.origins.set(element, source); }
  copy(from: object, to: object) {
    const binding = this.bindings.get(from), origin = this.origins.get(from);
    if (binding) this.bindings.set(to, binding);
    if (origin) this.origins.set(to, origin);
  }
  wrap(children: ReactNode, props: TextSlotProps, caller?: SourceLocation): ReactElement {
    if (typeof props.slot !== 'string' || !props.slot.trim()) throw new Error('TextSlot needs a nonempty stable content name.');
    const globals = globalThis as TextGlobals;
    const source = props.field ? globals.__opendocResolveTextField?.(props.field)
      : props.from && props.from !== 'children' && caller ? globals.__opendocResolveTextSource?.(caller, props.from) : undefined;
    const marker = createElement(React.Fragment, {}, children);
    this.bindings.set(marker, { slot: props.slot, source, origin: caller, from: props.from, childIndex: props.childIndex, stable: props.stable, reason: props.reason, protected: !!props.reason });
    return marker;
  }
  protect(children: ReactNode, reason: string): ReactElement {
    const marker = createElement(React.Fragment, {}, children);
    this.bindings.set(marker, { protected: true, reason });
    return marker;
  }

  complete(root: ReactNode): { element: ReactElement; textTargets: TextTarget[] } {
    const textTargets: TextTarget[] = [];
    const counts = new Map<string, number>();
    const used = new Set<string>();
    const identities = new Map<TextTarget, { named: boolean; key: string }>();
    const globals = globalThis as TextGlobals;
    const resolve = (location: SourceLocation | undefined, slot: string, childIndex?: number) => location ? globals.__opendocResolveTextSource?.(location, slot, childIndex) : undefined;
    const containsProtected = (node: ReactNode): boolean => {
      if (Array.isArray(node)) return node.some(containsProtected);
      if (!isValidElement<{ children?: ReactNode }>(node)) return false;
      return !!this.bindings.get(node)?.protected || containsProtected(node.props.children);
    };

    const gather = (node: ReactNode, runs: TextRun[], buffer: { text: string }, inherited?: Binding, source?: TextSourceValue) => {
      if (typeof node === 'string' || typeof node === 'number') {
        const text = String(node); if (!text) return;
        const candidate = inherited?.source ?? source;
        const writable = !inherited?.protected && candidate?.value === text ? candidate : undefined;
        const start = buffer.text.length; buffer.text += text;
        runs.push({ start, end: buffer.text.length, ...(writable ? { source: writable } : {}),
          ...(!writable ? { protected: !!inherited?.protected, reason: inherited?.reason ?? 'Ask your agent to change this text.' } : {}) });
        return;
      }
      if (Array.isArray(node)) { node.forEach(child => gather(child, runs, buffer, inherited)); return; }
      if (!isValidElement<{ children?: ReactNode }>(node)) return;
      const own = this.bindings.get(node);
      const binding = inherited?.protected ? inherited : own ? { ...inherited, ...own } : inherited;
      // A bound scalar may be wrapped by transparent/formatting elements. Keep
      // it one writable run only when all rendered content is that exact scalar.
      if (binding?.source && !binding.protected && !containsProtected(node.props.children) && rawText(node.props.children) === binding.source.value) {
        const start = buffer.text.length; buffer.text += binding.source.value;
        runs.push({ start, end: buffer.text.length, source: binding.source });
        return;
      }
      const origin = own?.origin ?? this.origins.get(node);
      const from = own?.from ?? 'children';
      const children = Array.isArray(node.props.children) ? node.props.children : [node.props.children];
      children.forEach((child, index) => gather(child, runs, buffer, binding,
        typeof child === 'string' || typeof child === 'number' ? resolve(origin, from, index + (own?.childIndex ?? 0)) : undefined));
    };
    const descendantSlot = (node: ReactNode): Binding | undefined => {
      if (Array.isArray(node)) {
        const bindings = node.map(descendantSlot).filter((value): value is Binding => !!value);
        return bindings.find(binding => !binding.protected) ?? bindings[0];
      }
      if (!isValidElement<{ children?: ReactNode }>(node)) return undefined;
      const binding = this.bindings.get(node), child = descendantSlot(node.props.children);
      return binding?.slot === 'children' ? child ?? binding : binding?.slot ? binding : child;
    };
    const clean = (node: ReactNode, blockId?: string, withinText = false, inherited?: Binding): ReactNode => {
      if (Array.isArray(node)) return node.map(child => clean(child, blockId, withinText, inherited));
      if (!isValidElement<{ children?: ReactNode }>(node)) return node;
      const location = this.sourceMap.get(node);
      const id = location?.file.startsWith('opendoc:block:') ? location.file.slice(14) : blockId;
      const own = this.bindings.get(node);
      const binding = inherited?.protected ? inherited : own ? { ...inherited, ...own } : inherited;
      if (node.type === React.Fragment) return clean(node.props.children, id, withinText, binding);
      const textRoot = !withinText && textTypes.has(node.type);
      let target: TextTarget | undefined;
      if (textRoot && id) {
        const count = (counts.get(id) ?? 0) + 1; counts.set(id, count);
        const named = binding?.slot ? binding : descendantSlot(node.props.children);
        const slot = named?.slot ?? (count === 1 ? 'children' : `text-${count}`);
        const key = `${id}:${encodeURIComponent(slot)}`;
        const runs: TextRun[] = [], buffer = { text: '' };
        gather(node, runs, buffer, binding);
        if (buffer.text) {
          target = { id: used.has(key) ? `${key}:${count}` : key, blockId: id, slot, text: buffer.text, runs, lines: [], stable: named?.stable !== false };
          used.add(target.id); textTargets.push(target);
          identities.set(target, { named: !!named?.slot, key });
          if (!runs.some(run => run.source)) target.reason = runs.find(run => run.reason)?.reason;
        }
      }
      const result = createElement(node.type, { ...node.props, key: node.key }, clean(node.props.children, id, withinText || textRoot, binding));
      // Keep block source tags compatible with preflight and fragments; the
      // synthetic line records which text target owns this native text node.
      if (target) this.sourceMap.set(result, { file: `opendoc:block:${id}`, line: textTargets.length, column: 1 });
      else if (location) this.sourceMap.set(result, location);
      return result;
    };
    const element = clean(root) as ReactElement;
    const slots = new Map<string, TextTarget[]>();
    for (const target of textTargets) {
      const identity = identities.get(target)!;
      if (!identity.named && (counts.get(target.blockId) ?? 0) > 1) target.stable = false;
      const group = slots.get(identity.key) ?? []; group.push(target); slots.set(identity.key, group);
    }
    for (const group of slots.values()) if (group.length > 1) for (const target of group) target.stable = false;
    const linked = new Map<string, TextSourceValue[]>();
    for (const target of textTargets) for (const run of target.runs) if (run.source) {
      const value = run.source, key = `${value.file}:${value.digest}:${value.start}:${value.end}`;
      const values = linked.get(key) ?? []; values.push(value); linked.set(key, values);
    }
    for (const values of linked.values()) for (const value of values) value.linkedOccurrences = Math.max(value.linkedOccurrences ?? 1, values.length);
    return { element, textTargets };
  }
}
