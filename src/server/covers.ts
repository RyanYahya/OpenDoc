import { readFile, rename, rm, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { createCanvas } from '@napi-rs/canvas';
import { openPdf } from './pdf-document';

/** Library cards are at most about 320 pixels wide; covers stay sharp on high-density screens. */
export const coverWidth = 640;
const coverFile = 'cover.webp';
const pending = new Map<string, Promise<Buffer>>();
let rasterizing: Promise<unknown> = Promise.resolve();

/**
 * The first page of a render as a WebP image, for library cards. It is saved beside
 * that render's PDF, so a new render hash gets a new cover and an old cover is
 * removed with its render.
 */
export function coverImage(directory: string): Promise<Buffer> {
  let image = pending.get(directory);
  if (!image) {
    image = readCover(directory).finally(() => pending.delete(directory));
    pending.set(directory, image);
  }
  return image;
}

async function readCover(directory: string) {
  const file = resolve(directory, coverFile);
  try { return await readFile(file); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  // One cover at a time keeps a full library from monopolizing the service.
  const run = rasterizing.then(async () => firstPageImage(await readFile(resolve(directory, 'document.pdf'))));
  rasterizing = run.catch(() => {});
  const image = await run;
  // A render replaced in the meantime has no folder to keep its cover; it is still returned.
  const temporary = `${file}.${randomUUID()}.tmp`;
  try { await writeFile(temporary, image, { flag: 'wx' }); await rename(temporary, file); }
  catch { await rm(temporary, { force: true }); }
  return image;
}

/** Rasterize the first PDF page at the given pixel width. */
export async function firstPageImage(pdf: Uint8Array, width = coverWidth): Promise<Buffer> {
  const loading = openPdf(pdf);
  try {
    const page = await (await loading.promise).getPage(1);
    const viewport = page.getViewport({ scale: width / page.getViewport({ scale: 1 }).width });
    const canvas = createCanvas(Math.round(viewport.width), Math.round(viewport.height));
    try {
      await page.render({ canvas: canvas as unknown as HTMLCanvasElement, canvasContext: canvas.getContext('2d') as unknown as CanvasRenderingContext2D, viewport }).promise;
      return await canvas.encode('webp', 90);
    } finally { canvas.width = 0; canvas.height = 0; }
  } finally { await loading.destroy(); }
}
