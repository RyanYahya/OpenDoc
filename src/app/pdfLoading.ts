import type { PDFDocumentLoadingTask, PDFDocumentProxy } from 'pdfjs-dist';

/** Bound both worker startup and the PDF transfer; retries must use a fresh task. */
export function loadPdfWithDeadline(loading: Promise<PDFDocumentLoadingTask>, timeout = 60_000): Promise<PDFDocumentProxy> {
  return new Promise((accept, reject) => {
    const timer = setTimeout(() => {
      reject(new Error('The PDF preview took too long to load. Try again.'));
      void loading.then(task => task.destroy()).catch(() => {});
    }, timeout);
    loading.then(task => task.promise).then(accept, reject).finally(() => clearTimeout(timer));
  });
}
