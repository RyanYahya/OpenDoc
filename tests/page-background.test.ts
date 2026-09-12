import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { renderOnce } from '../src/server/render';
import { fixture, projectRoot } from './helpers';

async function inspectPdf(directory: string, inspect: (page: number, canvas: HTMLCanvasElement, context: CanvasRenderingContext2D) => void) {
  const loading = getDocument({ data: new Uint8Array(await readFile(resolve(directory, 'document.pdf'))), standardFontDataUrl: resolve(projectRoot, 'node_modules/pdfjs-dist/standard_fonts') + '/' });
  try {
    const pdf = await loading.promise;
    const factory = pdf.canvasFactory as { create(width: number, height: number): { canvas: HTMLCanvasElement; context: CanvasRenderingContext2D }; destroy(target: unknown): void };
    const text: string[] = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i), viewport = page.getViewport({ scale: 1 });
      const target = factory.create(Math.ceil(viewport.width), Math.ceil(viewport.height));
      try {
        await page.render({ canvas: target.canvas, canvasContext: target.context, viewport }).promise;
        inspect(i, target.canvas, target.context);
        text.push((await page.getTextContent()).items.map(item => 'str' in item ? item.str : '').join(' '));
      } finally { factory.destroy(target); }
    }
    return text.join(' ');
  } finally { await loading.destroy(); }
}

const pixel = (context: CanvasRenderingContext2D, x: number, y: number) => Array.from(context.getImageData(x, y, 1, 1).data);
const base = `import {Document,Page,Pages,Cover,Heading,Paragraph} from '../../src/document'; import {Page as NativePage} from '@formepdf/react'; import{neutral}from'../../themes'; export const meta={title:'Background proof',description:'Synthetic render test',theme:'neutral'};`;

test('page color paints full bleed on every flowing page without moving or losing text', async () => {
  const f = await fixture();
  const results: Awaited<ReturnType<typeof renderOnce>>[] = [];
  try {
    const prose = `${'Every page preserves the same background, with ordinary selectable text and unchanged flow. '.repeat(65)}END OF FLOW`;
    for (const page of ['NativePage', 'Page']) {
      await writeFile(f.entry, `${base} export default function Proof(){return <Document title={meta.title} theme={neutral}><${page} size="A4" margin={48} style={{backgroundColor:'#071D2B',color:'#ffffff'}}><Heading id="title" level={1} style={{color:'#ffffff'}}>Visible white title</Heading><Paragraph id="prose">${prose}</Paragraph></${page}></Document>}`);
      results.push(await renderOnce(f.root, 'proof'));
    }
    const [native, colored] = results;
    assert.equal(colored.artifact.pages.length, 2);
    assert.deepEqual(colored.artifact.pages, native.artifact.pages, 'Painting does not change native pagination or feedback coordinates.');
    const text = await inspectPdf(colored.directory, (page, canvas, context) => {
      for (const [x, y] of [[1, 1], [canvas.width - 2, 1], [1, canvas.height - 2], [canvas.width - 2, canvas.height - 2], [20, 100]]) {
        assert.deepEqual(pixel(context, x, y), [7, 29, 43, 255], `Page ${page}: background reaches the paper edge.`);
      }
      if (page === 1) {
        const title = colored.artifact.pages[0].fragments.find(block => block.id === 'title')!;
        const pixels = context.getImageData(Math.floor(title.x), Math.floor(title.y), Math.ceil(title.width), Math.ceil(title.height)).data;
        let lightPixels = 0;
        for (let i = 0; i < pixels.length; i += 4) if (pixels[i] > 220 && pixels[i + 1] > 220 && pixels[i + 2] > 220) lightPixels++;
        assert.ok(lightPixels > 50, 'White title text is visibly painted against the dark page.');
      }
    });
    assert.match(text, /Visible white title/);
    assert.match(text, /END OF\s+FLOW/);
  } finally { await Promise.all(results.map(result => rm(result.directory, { recursive: true, force: true }))); await f.cleanup(); }
});

test('theme page and cover surfaces use the same full-page paint layer', async () => {
  const f = await fixture();
  let directory: string | undefined;
  try {
    await writeFile(f.entry, `${base} const theme={...neutral,design:{page:{style:{backgroundColor:'#F7F7F5'}},cover:{page:{backgroundColor:'#10243A'},title:{color:'#ffffff'},subtitle:{color:'#ffffff'},eyebrow:{color:'#ffffff'},footer:{color:'#ffffff'}}}};export default function Proof(){return <Document title={meta.title} theme={theme}><Cover eyebrow="Proof" title="A dark cover" subtitle="A light subtitle" footer="Synthetic test"/><Pages title="A warm reading page"><Paragraph id="reading">Readable body on a warm surface.</Paragraph></Pages></Document>}`);
    const result = await renderOnce(f.root, 'proof'); directory = result.directory;
    assert.equal(result.artifact.pages.length, 2);
    await inspectPdf(directory, (page, canvas, context) => {
      const expected = page === 1 ? [16, 36, 58, 255] : [247, 247, 245, 255];
      assert.deepEqual(pixel(context, 1, 1), expected);
      assert.deepEqual(pixel(context, canvas.width - 2, canvas.height - 2), expected);
      if (page === 1) for (const id of ['cover-eyebrow', 'cover-footer']) {
        const block = result.artifact.pages[0].fragments.find(block => block.id === id)!;
        const pixels = context.getImageData(Math.floor(block.x), Math.floor(block.y), Math.ceil(block.width), Math.ceil(block.height)).data;
        let lightPixels = 0;
        for (let i = 0; i < pixels.length; i += 4) if (pixels[i] > 220 && pixels[i + 1] > 220 && pixels[i + 2] > 220) lightPixels++;
        assert.ok(lightPixels > 3, `${id} uses its cover-specific foreground color.`);
      }
    });
  } finally { if (directory) await rm(directory, { recursive: true, force: true }); await f.cleanup(); }
});
