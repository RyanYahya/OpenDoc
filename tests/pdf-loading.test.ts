import test from 'node:test';
import assert from 'node:assert/strict';
import type { PDFDocumentLoadingTask, PDFDocumentProxy } from 'pdfjs-dist';
import { loadPdfWithDeadline } from '../src/app/pdfLoading';

test('a stalled PDF stops waiting, releases its task, and permits a fresh attempt', async () => {
  let destroyed = 0;
  const stalled = { promise: new Promise(() => {}), destroy: async () => { destroyed++; } } as unknown as PDFDocumentLoadingTask;
  await assert.rejects(loadPdfWithDeadline(Promise.resolve(stalled), 10), /took too long/);
  assert.equal(destroyed, 1);
  const pdf = { numPages: 2 } as PDFDocumentProxy;
  const next = { promise: Promise.resolve(pdf), destroy: async () => {} } as PDFDocumentLoadingTask;
  assert.equal(await loadPdfWithDeadline(Promise.resolve(next), 100), pdf);
});

test('a worker that starts after the deadline is still released', async () => {
  let start!: (task: PDFDocumentLoadingTask) => void;
  let destroyed = 0;
  const loading = new Promise<PDFDocumentLoadingTask>(accept => { start = accept; });
  await assert.rejects(loadPdfWithDeadline(loading, 10), /took too long/);
  start({ promise: new Promise(() => {}), destroy: async () => { destroyed++; } } as unknown as PDFDocumentLoadingTask);
  await Promise.resolve();
  assert.equal(destroyed, 1);
});
