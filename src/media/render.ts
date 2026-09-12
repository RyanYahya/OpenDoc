import { readFileSync, statSync } from 'node:fs';
import { Resvg } from '@resvg/resvg-js';
import { resolve } from 'node:path';
import { imageInfo, readMedia, mediaFreshness } from './files';

type RenderGlobals = typeof globalThis & { __opendocRoot?: string; __opendocDocumentDirectory?: string };
const globals = globalThis as RenderGlobals;

/** The same source and freshness contract serves ordinary media, frames, and page backgrounds. */
export function readyMedia(item: string) {
  if (!globals.__opendocDocumentDirectory) throw new Error('Media must render inside an OpenDoc document.');
  const asset = readMedia(globals.__opendocDocumentDirectory, item);
  const status = mediaFreshness(asset);
  if (status.freshness === 'stale') throw new Error(`Media "${item}" needs regeneration: ${status.changedInputs.join(', ')} changed. Generate and review the image, then run npx opendoc media record <document> ${item}.`);
  if (status.freshness === 'unrecorded') throw new Error(`Media "${item}" has inputs but no generation record. Generate and review it, then run npx opendoc media record <document> ${item}.`);
  return asset;
}

export const mediaUri = (asset: { mime: string; bytes: Buffer }) => `data:${asset.mime};base64,${asset.bytes.toString('base64')}`;

export interface ImageFrameOptions {
  width: number;
  height: number;
  fit?: 'cover' | 'contain';
  /** Crop/alignment: 0 is left/top, 0.5 is center, 1 is right/bottom. */
  position?: { x: number; y: number };
  /** Points; half the side of a square makes a circular image. */
  radius?: number;
}

/** Rasterize only the bounded image frame, never the surrounding PDF text or original file. */
export function framedMedia(asset: {bytes: Buffer; mime: string; width: number; height: number}, { width, height, fit = 'cover', position = { x: 0.5, y: 0.5 }, radius = 0 }: ImageFrameOptions) {
  if (![width, height].every(value => Number.isFinite(value) && value > 0)) throw new Error('MediaFrame needs positive width and height in points.');
  if (!['cover', 'contain'].includes(fit)) throw new Error('MediaFrame fit must be cover or contain.');
  if (!position || ![position.x, position.y].every(value => Number.isFinite(value) && value >= 0 && value <= 1)) throw new Error('MediaFrame position needs x and y between 0 and 1.');
  if (!Number.isFinite(radius) || radius < 0 || radius > Math.min(width, height) / 2) throw new Error('MediaFrame radius must be between zero and half the shorter side.');
  const scale = (fit === 'cover' ? Math.max : Math.min)(width / asset.width, height / asset.height);
  const w = asset.width * scale, h = asset.height * scale;
  const x = (width - w) * position.x, y = (height - h) * position.y;
  // Authoring resolution keeps this native addon in the installed runtime.
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><defs><clipPath id="frame"><rect width="${width}" height="${height}" rx="${radius}"/></clipPath></defs><g clip-path="url(#frame)"><image href="${mediaUri(asset)}" x="${x}" y="${y}" width="${w}" height="${h}"/></g></svg>`;
  // 216 dpi at ordinary page sizes, bounded to avoid oversized intermediate bitmaps.
  const outputScale = Math.min(3, 4096 / Math.max(width, height));
  const bytes = new Resvg(svg, { fitTo: { mode: 'width', value: Math.max(1, Math.ceil(width * outputScale)) } }).render().asPng();
  return mediaUri({ mime: 'image/png', bytes });
}

/** Native background paths bypass Forme's normal image resolver. Resolve local files explicitly. */
export function pageImage(source: string, frame?: ImageFrameOptions) {
  if (/^https?:/i.test(source)) return source;
  if (/^data:/i.test(source)) {
    if (!frame) return source;
    const match = /^data:image\/(?:png|jpeg);base64,(.+)$/is.exec(source);
    if (!match) throw new Error('Proportional page backgrounds need a PNG or JPEG base64 data URI.');
    const bytes = Buffer.from(match[1], 'base64');
    return framedMedia({bytes, ...imageInfo(bytes)}, frame);
  }
  const file = resolve(globals.__opendocDocumentDirectory ?? process.cwd(), source);
  if (statSync(file).size > 50_000_000) throw new Error('Keep a page background image below 50 MB.');
  const bytes = readFileSync(file);
  const asset = { bytes, ...imageInfo(bytes) };
  return frame ? framedMedia(asset, frame) : mediaUri(asset);
}
