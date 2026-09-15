import { RenderFailure } from './render-error';
import type { ElementInfo, LayoutInfo } from '@formepdf/core';
import type { BlockInfo, OutlineEntry, ReviewIssue, SlideInfo } from '../shared/types';
import { blockIdOf, boundsOf } from './layout-inspection';

/** Verify slide identity as well as page count; a shifted or duplicated page must fail. */
export function assertSlideLayout(layout: LayoutInfo, slides: SlideInfo[], blocks: Record<string, BlockInfo>) {
  if (layout.pages.length !== slides.length) {
    const message = `Presentation layout failed: ${slides.length} slides produced ${layout.pages.length} pages. Content must fit on its own slide; shorten it or split it into explicit slides.`;
    throw new RenderFailure(message, [{ code: 'slide-page-count', severity: 'error', message }]);
  }
  const ids = new Set(slides.map(slide => slide.id));
  for (const [index, page] of layout.pages.entries()) {
    const expected = slides[index].id;
    const found = new Set<string>();
    const paper = { x: 0, y: 0, width: page.width, height: page.height };
    const visit = (node: ElementInfo, inherited?: string, clips: ElementInfo[] = [], parent?: ElementInfo) => {
      const id = blockIdOf(node, inherited);
      if (id && ids.has(id)) found.add(id);
      const owner = id && blocks[id]?.slideId;
      if (owner && owner !== expected) {
        const message = `Slide ${owner}: component ${id} moved onto slide ${expected}. Content must fit on its own slide.`;
        throw new RenderFailure(message, [{ code: 'slide-content-moved', severity: 'error', message, page: index + 1, blockId: id, source: id ? blocks[id]?.source : undefined, bounds: boundsOf(node), parentBounds: parent && boundsOf(parent) }]);
      }
      // Native View backgrounds/borders are drawable rectangles too. Document
      // preflight permits decorative bleed; a slide's bounded composition does not.
      if (node.kind === 'Rect' && node.style.opacity !== 0 && (outside(node, paper) || clips.some(box => outside(node, box)))) {
        const message = `Slide ${expected}: ${id ?? 'a visual'} extends outside the slide or is clipped. Resize or reposition it.`;
        throw new RenderFailure(message, [{ code: 'slide-overflow', severity: 'error', message, page: index + 1, blockId: id, source: id ? blocks[id]?.source : undefined, bounds: boundsOf(node), parentBounds: parent && boundsOf(parent) }]);
      }
      const nextClips = node.style?.overflow === 'Hidden' ? [...clips, node] : clips;
      node.children.forEach(child => visit(child, id, nextClips, node));
    };
    page.elements.forEach(node => visit(node));
    if (page.width !== 960 || page.height !== 540 || found.size !== 1 || !found.has(expected)) {
      const message = `Slide ${expected}: content moved to another page or the slide dimensions changed. Each slide must stay on its own 960 × 540 page.`;
      throw new RenderFailure(message, [{ code: 'slide-identity', severity: 'error', message, page: index + 1, blockId: expected }]);
    }
  }
}

const tolerance = 0.75;
const visualKinds = new Set(['Image', 'Svg', 'QrCode', 'Barcode', 'Canvas', 'BarChart', 'LineChart', 'PieChart', 'AreaChart', 'DotPlot']);
type Mark = { node: ElementInfo; parent?: ElementInfo; blockId?: string; heading?: ElementInfo; fixed: boolean };
function overlaps(a: ElementInfo, b: ElementInfo) {
  return a.x < b.x + b.width - tolerance && b.x < a.x + a.width - tolerance &&
    a.y < b.y + b.height - tolerance && b.y < a.y + a.height - tolerance;
}
function outside(node: ElementInfo, box: { x: number; y: number; width: number; height: number }) {
  return node.x < box.x - tolerance || node.y < box.y - tolerance ||
    node.x + node.width > box.x + box.width + tolerance || node.y + node.height > box.y + box.height + tolerance;
}

/** Check concrete geometry, not aesthetic taste. Decorative page backgrounds may bleed. */
export function inspectLayout(layout: LayoutInfo, blocks: Record<string, BlockInfo>) {
  const issues: ReviewIssue[] = [];
  const outline: OutlineEntry[] = [];
  const seen = new Set<string>();
  const outlined = new Set<string>();
  const lineCounts = new Map<string, { count: number; page: number; node: ElementInfo; parent?: ElementInfo }>();
  const calloutPages = new Map<string, Set<number>>();
  const add = (issue: ReviewIssue, node?: ElementInfo, parent?: ElementInfo) => {
    const key = `${issue.code}:${issue.page}:${issue.blockId ?? ''}:${issue.relatedBlockId ?? ''}`;
    if (!seen.has(key)) {
      seen.add(key);
      issues.push({ ...issue, source: issue.blockId ? blocks[issue.blockId]?.source : undefined,
        ...(node ? { bounds: boundsOf(node) } : {}), ...(parent ? { parentBounds: boundsOf(parent) } : {}) });
    }
  };
  for (const [index, page] of layout.pages.entries()) {
    const number = index + 1;
    const leaves: Mark[] = [], headings: Mark[] = [], footers: ElementInfo[] = [];
    const paper = { x: 0, y: 0, width: page.width, height: page.height };
    const visit = (node: ElementInfo, inherited?: string, fixed = false, heading?: ElementInfo, clips: ElementInfo[] = [], parent?: ElementInfo) => {
      if (node.style.opacity === 0) return;
      const blockId = blockIdOf(node, inherited);
      fixed ||= node.nodeType === 'FixedHeader' || node.nodeType === 'FixedFooter';
      if (!fixed && blockId && blocks[blockId]?.maxLines !== undefined) {
        const lines = node.children.filter(child => child.nodeType === 'TextLine').length;
        if (lines) {
          const count = lineCounts.get(blockId) ?? { count: 0, page: number, node, parent };
          count.count += lines; lineCounts.set(blockId, count);
        }
      }
      if (node.nodeType === 'FixedFooter') footers.push(node);
      if (blockId && blocks[blockId]?.kind === 'callout') {
        const pages = calloutPages.get(blockId) ?? new Set<number>();
        pages.add(number); calloutPages.set(blockId, pages);
      }
      if (!fixed && node.nodeType === 'View' && !node.style.breakable && node.height > page.contentHeight + tolerance) {
        add({ code: 'unbreakable-too-tall', severity: 'warning', page: number, blockId,
          message: `This keep-together block is ${node.height.toFixed(1)} pt tall; page ${number} has ${page.contentHeight.toFixed(1)} pt of body space. Shorten it, reduce its spacing, or allow it to split.` }, node, parent);
      }
      if (/^H[1-6]$/.test(node.nodeType)) {
        heading = node;
        headings.push({ node, parent, blockId, fixed });
      }
      const visible = node.nodeType === 'TextLine' ? !!node.textContent?.trim() : visualKinds.has(node.nodeType);
      if (visible && node.style.opacity !== 0) {
        leaves.push({ node, parent, blockId, heading, fixed });
        if (![node.x, node.y, node.width, node.height].every(Number.isFinite) || outside(node, paper)) {
          add({ code: 'page-overflow', severity: 'error', page: number, blockId,
            message: `Content extends beyond page ${number}. Reduce the fixed width or height, or allow the content to flow onto another page.` }, node, parent);
        }
        const clip = clips.find(box => outside(node, box));
        if (clip) {
          add({ code: 'clipped-content', severity: 'error', page: number, blockId, clippingBounds: boundsOf(clip),
            message: `Content is clipped by a fixed container on page ${number}. Remove the clipping or give it enough space.` }, node, parent);
        }
      }
      const nextClips = node.style.overflow === 'Hidden' ? [...clips, node] : clips;
      for (const child of node.children) visit(child, blockId, fixed, heading, nextClips, node);
    };
    for (const node of page.elements) visit(node);
    const furniture = leaves.filter(mark => mark.fixed);
    for (const mark of leaves) {
      if (!mark.fixed && furniture.some(other => overlaps(mark.node, other.node))) {
        add({ code: 'page-furniture-overlap', severity: 'error', page: number, blockId: mark.blockId,
          message: `Content overlaps the running header or footer on page ${number}. Reduce the unbreakable content or adjust the page margins.` }, mark.node, mark.parent);
      } else if (!mark.fixed && footers.some(footer => mark.node.y + mark.node.height > footer.y + tolerance && mark.node.y < footer.y + footer.height)) {
        add({ code: 'footer-area-intrusion', severity: 'warning', page: number, blockId: mark.blockId,
          message: `Content enters the running footer area on page ${number}, even though it does not overlap footer text. Move it above the footer or increase the bottom margin.` }, mark.node, mark.parent);
      }
    }
    // Only distinct text blocks: container backgrounds and text over artwork are intentional.
    const text = leaves.filter(mark => !mark.fixed && mark.blockId && mark.node.nodeType === 'TextLine').sort((a, b) => a.node.y - b.node.y);
    for (let i = 0; i < text.length; i++) for (let j = i + 1; j < text.length && text[j].node.y < text[i].node.y + text[i].node.height - tolerance; j++) {
      const a = text[i], b = text[j];
      if (a.blockId !== b.blockId && overlaps(a.node, b.node)) add({ code: 'text-overlap', severity: 'warning', page: number, blockId: a.blockId, relatedBlockId: b.blockId,
        message: `Text in ${a.blockId} overlaps ${b.blockId} on page ${number}. Check their parent coordinates, spacing, and absolute positioning; retain only if intentional.` }, a.node, a.parent);
    }
    for (const mark of headings) {
      if (mark.fixed) continue;
      const heading = mark.node;
      const title = leaves.filter(leaf => leaf.heading === heading).map(leaf => leaf.node.textContent ?? '').join(' ').trim();
      if (mark.blockId && title && !outlined.has(mark.blockId)) {
        outline.push({ id: mark.blockId, title, level: Number(heading.nodeType.slice(1)), page: number });
        outlined.add(mark.blockId);
      }
      const lowerPage = heading.y + heading.height > page.contentY + page.contentHeight * 0.72;
      const bodyFollows = leaves.some(leaf => !leaf.fixed && !leaf.heading && leaf.node.y >= heading.y + heading.height - tolerance &&
        leaf.node.x < heading.x + heading.width && leaf.node.x + leaf.node.width > heading.x);
      if (lowerPage && !bodyFollows) {
        add({ code: 'stranded-heading', severity: 'warning', page: number, blockId: mark.blockId,
          message: `“${title || blocks[mark.blockId ?? '']?.text || 'Heading'}” has no following body content on page ${number}. Use Section with a short lead to keep them together.` });
      }
    }
    if (!leaves.some(mark => !mark.fixed)) {
      add({ code: 'empty-page', severity: 'warning', page: number,
        message: `Page ${number} has no body content. Check whether a page break or oversized block created an unwanted blank page.` });
    }
  }
  for (const [blockId, { count, page, node, parent }] of lineCounts) if (count > blocks[blockId].maxLines!) {
    add({ code: 'line-limit-exceeded', severity: 'warning', page, blockId,
      message: `${blockId} uses ${count} lines; maxLines is ${blocks[blockId].maxLines}. Widen the label, shorten its text, or revise the explicit line limit. Text was not truncated.` }, node, parent);
  }
  for (const [blockId, pages] of calloutPages) if (pages.size > 1) add({ code: 'split-callout', severity: 'warning', page: Math.min(...pages), blockId,
    message: `Callout ${blockId} spans pages ${[...pages].join(', ')}. For a short callout, use keepTogether; for long content, retain the split or divide it into smaller callouts.` });
  return { issues, outline };
}

export function assertLayoutSafe(issues: ReviewIssue[]) {
  const errors = issues.filter(issue => issue.severity === 'error');
  if (!errors.length) return;
  throw new RenderFailure(`Layout check failed:\n${errors.slice(0, 8).map(issue => `- ${issue.blockId ? `${issue.blockId}: ` : ''}${issue.message}`).join('\n')}${errors.length > 8 ? `\n- ${errors.length - 8} more layout errors.` : ''}`, issues);
}
