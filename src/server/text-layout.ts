import type { ElementInfo, LayoutInfo } from '@formepdf/core';
import type { TextTarget } from '../shared/selection';

/** Only normalize layout whitespace; never guess through changed words. */
function comparable(text: string) {
  const positions: number[] = [], chars: string[] = [];
  for (let index = 0; index < text.length; index++) {
    if (/\s/u.test(text[index]) || text[index] === '\u00ad') continue;
    positions.push(index); chars.push(text[index]);
  }
  return { text: chars.join(''), positions };
}

/** Attach line geometry to the logical text tree, including continued pages. */
export function attachTextLines(layout: LayoutInfo, targets: TextTarget[]) {
  const values = targets.map(target => comparable(target.text));
  const cursors = targets.map(() => 0);
  const blocked = targets.map(() => false);
  for (const [pageIndex, page] of layout.pages.entries()) {
    const visit = (node: ElementInfo, inherited?: number) => {
      const source = node.sourceLocation;
      const index = source?.file.startsWith('opendoc:block:') ? source.line - 1 : -1;
      const candidate = targets[index];
      const own = /^(Text|H[1-6])$/.test(node.nodeType) && candidate && source?.file === `opendoc:block:${candidate.blockId}` ? index : inherited;
      if (node.nodeType === 'TextLine' && own !== undefined && node.textContent && !blocked[own]) {
        const target = targets[own], value = values[own];
        let line = comparable(node.textContent).text;
        let cursor = cursors[own];
        if (cursor === value.text.length) cursor = 0; // repeated table headers / page furniture
        if (!value.text.startsWith(line, cursor) && line.endsWith('-')) line = line.slice(0, -1); // discretionary line-end hyphen
        if (line && value.text.startsWith(line, cursor)) {
          const start = value.positions[cursor], end = value.positions[cursor + line.length - 1] + 1;
          target.lines.push({ page: pageIndex + 1, x: node.x, y: node.y, width: node.width, height: node.height, text: node.textContent, start, end });
          cursors[own] = cursor + line.length;
        } else if (line) blocked[own] = true; // Never resume at a coincidentally repeated phrase after an unaligned line.
      }
      for (const child of node.children) visit(child, own);
    };
    for (const node of page.elements) visit(node);
  }
}
