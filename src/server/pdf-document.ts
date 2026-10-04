import { dirname, resolve, sep } from 'node:path';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { runtimeResolve } from '../runtime/paths';

/** Open PDF bytes for server-side page images, with PDF.js's own fonts and character maps. */
export function openPdf(bytes: Uint8Array) {
  const pdfjs = dirname(runtimeResolve('pdfjs-dist/package.json'));
  return getDocument({
    data: new Uint8Array(bytes), useSystemFonts: false, verbosity: 0,
    standardFontDataUrl: resolve(pdfjs, 'standard_fonts') + sep,
    cMapUrl: resolve(pdfjs, 'cmaps') + sep, cMapPacked: true, wasmUrl: resolve(pdfjs, 'wasm') + sep,
  });
}
