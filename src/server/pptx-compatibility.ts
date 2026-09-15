import type { ElementInfo, ElementStyleInfo, LayoutInfo } from '@formepdf/core';
import type { FormeDocument, FormeNode } from '@formepdf/react';
import type { BlockInfo, ReviewIssue, SlideInfo } from '../shared/types';
import { blockIdOf, boundsOf } from './layout-inspection';

export type PaintStyle = ElementStyleInfo & { borderStyle?: Partial<Record<'top' | 'right' | 'bottom' | 'left', string>>; transform?: unknown };
export const borderSides = ['top', 'right', 'bottom', 'left'] as const;

/** A native rounded rectangle can preserve a uniform radius and uniform solid outline. */
export function roundedPanel(node: ElementInfo) {
  const style = node.style as PaintStyle;
  const radii = Object.values(style.borderRadius ?? {});
  if (!radii.some(radius => radius !== 0)) return { radius: 0 };
  if (radii.length !== 4 || radii.some(radius => !Number.isFinite(radius) || radius < 0 || radius !== radii[0])) return { radius: 0, unsupported: 'unequal corner radii', correction: 'Use the same borderRadius on all four corners, or use square corners.' };
  const width = style.borderWidth.top;
  if (borderSides.some(side => style.borderWidth[side] !== width || (width > 0 && (style.borderStyle?.[side] !== 'solid' || JSON.stringify(style.borderColor[side]) !== JSON.stringify(style.borderColor.top))))) {
    return { radius: 0, unsupported: 'nonuniform rounded borders', correction: 'Use one solid border width and color on all four sides, or use square corners for side-specific borders.' };
  }
  return { radius: Math.min(radii[0], node.width / 2, node.height / 2) };
}

/** Shared by render preflight and export. These warnings block PPTX, never the valid PDF. */
export function inspectPresentationCompatibility(doc: FormeDocument, layout: LayoutInfo, slides: SlideInfo[], blocks: Record<string, BlockInfo> = {}): ReviewIssue[] {
  const issues: ReviewIssue[] = [], seen = new Set<string>();
  for (const [index, page] of layout.pages.entries()) {
    const label = slides[index]?.id ?? String(index + 1);
    function add(feature: string, correction: string, blockId?: string, node?: ElementInfo) {
      const key = `${index}:${blockId}:${feature}`;
      if (seen.has(key)) return;
      seen.add(key);
      issues.push({ code: 'pptx-unsupported-style', severity: 'warning', format: 'pptx', page: index + 1, blockId,
        source: blockId ? blocks[blockId]?.source : undefined, ...(node ? { bounds: boundsOf(node) } : {}),
        message: `Slide ${label}${blockId ? `, component ${blockId}` : ''}: PowerPoint export does not yet support ${feature}. ${correction} PDF remains available; PPTX export is blocked until corrected.` });
    }
    function source(node: FormeNode, inherited?: string) {
      const id = blockIdOf(node, inherited);
      for (const style of [node.style, ...('runs' in node.kind ? node.kind.runs?.map(run => run.style) ?? [] : [])]) {
        if (!style) continue;
        if (style.transform?.length) add('transforms', 'Position and size the element directly.', id);
        if (style.boxShadow) add('shadows', 'Remove boxShadow or use a flat panel.', id);
        if (style.background && style.background.type !== 'color') add('gradients', 'Use a solid fill or a prepared image for the artwork.', id);
        if (style.wordSpacing) add('custom word spacing', 'Use default word spacing.', id);
        if (style.textAlign === 'Justify') add('justified text', 'Use left, center, or right alignment.', id);
      }
      node.children.forEach(child => source(child, id));
    }
    if (doc.children[index]) source(doc.children[index]);
    function visit(node: ElementInfo, inherited?: string) {
      const id = blockIdOf(node, inherited), style = node.style as PaintStyle;
      if (style.opacity === 0) return;
      if (style.opacity !== undefined && style.opacity !== 1) add('group opacity', 'Use opaque groups and set transparency on individual fill or text colors.', id, node);
      if (style.transform) add('transforms', 'Position and size the element directly.', id, node);
      // PPTX shapes do not clip separately exported descendants to rounded corners.
      // This also applies to unpainted containers (kind None).
      if (style.overflow === 'Hidden' && node.children.length && Object.values(style.borderRadius ?? {}).some(radius => radius > 0)) {
        add('rounded clipping of child content', 'Use square corners, or remove overflow: hidden when child clipping is not needed.', id, node);
      }
      if (node.kind === 'Rect') {
        const panel = roundedPanel(node);
        if (panel.unsupported) add(panel.unsupported, panel.correction!, id, node);
        for (const side of borderSides) if (style.borderWidth?.[side] > 0 && style.borderStyle?.[side] !== 'solid') {
          add('this border style', 'Use solid borders.', id, node);
        }
      }
      if (!['Rect', 'None', 'Text', 'Image'].includes(node.kind)) add(node.nodeType, 'Use a prepared local image for this artwork, keeping surrounding text native.', id, node);
      node.children.forEach(child => visit(child, id));
    }
    page.elements.forEach(node => visit(node));
  }
  return issues;
}
