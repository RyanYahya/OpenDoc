import type { ElementInfo, LayoutInfo } from '@formepdf/core';
import type { BlockInfo, Bounds, SourceLocation } from '../shared/types';

export const boundsOf = ({ x, y, width, height }: Bounds): Bounds => ({ x, y, width, height });
export function blockIdOf(node: Pick<ElementInfo, 'sourceLocation'>, inherited?: string) {
  const source = node.sourceLocation?.file;
  return source?.startsWith('opendoc:block:') ? source.slice(14) : inherited;
}

export interface InspectedElement {
  /** Page-local tree address, for this render only; blockId is the authored identity. */
  path: string; parentPath?: string; blockId?: string; source?: SourceLocation;
  nodeType: string; bounds: Bounds; parentBounds: Bounds; localBounds: Bounds;
  position: string; clippingAncestors: { path: string; bounds: Bounds }[];
  lineCount?: number; text?: string; hidden: boolean;
}

/** Keep diagnostic geometry separate from drawing styles and embedded image/font bytes. */
export function inspectElements(layout: LayoutInfo, blocks: Record<string, BlockInfo>): InspectedElement[][] {
  return layout.pages.map(page => {
    const elements: InspectedElement[] = [];
    function visit(node: ElementInfo, path: string, parentBounds: Bounds, parentPath?: string, inherited?: string, clips: InspectedElement['clippingAncestors'] = [], hidden = false) {
      const blockId = blockIdOf(node, inherited), bounds = boundsOf(node);
      hidden ||= node.style.opacity === 0;
      const lines = node.children.filter(child => child.nodeType === 'TextLine');
      elements.push({ path, parentPath, blockId, source: blockId ? blocks[blockId]?.source : undefined, nodeType: node.nodeType,
        bounds, parentBounds, localBounds: { ...bounds, x: bounds.x - parentBounds.x, y: bounds.y - parentBounds.y },
        position: node.style.position, clippingAncestors: clips, hidden,
        ...(lines.length ? { lineCount: lines.length } : {}), ...(node.textContent ? { text: node.textContent } : {}) });
      const nextClips = node.style.overflow === 'Hidden' ? [...clips, { path, bounds }] : clips;
      node.children.forEach((child, index) => visit(child, `${path}.${index}`, bounds, path, blockId, nextClips, hidden));
    }
    page.elements.forEach((node, index) => visit(node, String(index), { x: 0, y: 0, width: page.width, height: page.height }));
    return elements;
  });
}
