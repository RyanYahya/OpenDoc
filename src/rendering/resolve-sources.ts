/**
 * Asset resolver from @formepdf/renderer 0.20.1, dist/resolve.js.
 * Copyright (c) 2026 Daniel Molitor. MIT; see vendor/formepdf/LICENSE.
 * Only TypeScript annotations and formatting differ from upstream. Keeping this
 * narrow module avoids loading the unrelated HTML compiler in every render.
 */
import { readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';

interface AssetNode {
  kind?: { type?: string; src?: unknown };
  children?: AssetNode[];
}

export function uint8ArrayToBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64');
}

/// Resolve font sources to base64 strings for the WASM engine.
/// File paths are resolved relative to `basePath` (defaults to cwd).
/// Uint8Array values are base64-encoded. Data URIs pass through as-is.
export async function resolveFontSources(doc: Record<string, unknown>, basePath?: string): Promise<void> {
  const fonts = doc.fonts as { src?: unknown }[] | undefined;
  if (!fonts?.length) return;
  const baseDir = basePath ?? process.cwd();
  for (const font of fonts) {
    if (font.src instanceof Uint8Array) {
      font.src = uint8ArrayToBase64(font.src);
    } else if (typeof font.src === 'string' && !font.src.startsWith('data:')) {
      const fontPath = resolve(baseDir, font.src);
      const bytes = await readFile(fontPath);
      font.src = uint8ArrayToBase64(new Uint8Array(bytes));
    }
  }
}

const MIME_BY_EXT: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.bmp': 'image/bmp',
  '.ico': 'image/x-icon',
  '.avif': 'image/avif',
};

/// Resolve image sources — converts HTTP/HTTPS URLs and local file paths to base64 data URIs.
/// Walks the document tree recursively. File paths are resolved relative to `basePath`.
export async function resolveImageSources(doc: Record<string, unknown>, basePath?: string): Promise<void> {
  const children = doc.children as AssetNode[] | undefined;
  if (!children?.length) return;
  await Promise.all(children.map((node) => resolveImageSourcesInNode(node, basePath)));
}

async function resolveImageSourcesInNode(node: AssetNode, basePath?: string): Promise<void> {
  const kind = node.kind;
  if (kind?.type === 'Image' && typeof kind.src === 'string') {
    const src = kind.src;
    if (src.startsWith('data:')) {
      // Already a data URI — pass through.
    } else if (src.startsWith('http://') || src.startsWith('https://')) {
      const res = await fetch(src);
      if (!res.ok) throw new Error(`Failed to fetch image: ${src} (${res.status})`);
      const contentType = res.headers.get('content-type') || 'image/png';
      const buf = new Uint8Array(await res.arrayBuffer());
      kind.src = `data:${contentType};base64,${uint8ArrayToBase64(buf)}`;
    } else if (basePath) {
      const filePath = resolve(basePath, src);
      const ext = extname(filePath).toLowerCase();
      const mime = MIME_BY_EXT[ext] || 'application/octet-stream';
      const bytes = await readFile(filePath);
      kind.src = `data:${mime};base64,${uint8ArrayToBase64(new Uint8Array(bytes))}`;
    }
  }
  const children = node.children;
  if (children?.length) await Promise.all(children.map((child) => resolveImageSourcesInNode(child, basePath)));
}

/// Resolve all asset sources (fonts + images) in parallel.
export async function resolveAllSources(doc: Record<string, unknown>, basePath?: string): Promise<void> {
  await Promise.all([resolveFontSources(doc, basePath), resolveImageSources(doc, basePath)]);
}
