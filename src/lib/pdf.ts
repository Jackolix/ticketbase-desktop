import type { PDFDocumentProxy } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';

/**
 * pdf.js wiring.
 *
 * Attachments are previewed by rendering them ourselves rather than by handing
 * a blob to the webview. Only WebView2 has a PDF viewer to hand it to: a blob
 * in an `<iframe>` renders as raw bytes there when the type is not carried
 * through, and WKWebView and WebKitGTK — the macOS and Linux builds — do not
 * display PDFs in a frame at all. Drawing to a canvas behaves the same on all
 * three.
 *
 * The `legacy` build is deliberate for the same reason: Linux runs on whatever
 * WebKitGTK the distribution ships, which lags well behind the Chromium inside
 * WebView2.
 */

type PdfjsModule = typeof import('pdfjs-dist');

let modulePromise: Promise<PdfjsModule> | null = null;

/**
 * Half a megabyte of parser, loaded the first time someone opens a PDF —
 * most tickets have none.
 */
function loadPdfjs(): Promise<PdfjsModule> {
  modulePromise ??= import('pdfjs-dist/legacy/build/pdf.mjs').then((pdfjs) => {
    pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
    return pdfjs;
  });
  return modulePromise;
}

/**
 * Starts fetching the library without waiting for it.
 *
 * Worth calling the moment a PDF is known to be coming: the parser and its
 * worker are together the larger part of the wait, and they have nothing to do
 * with the file, so there is no reason for them to queue behind the download.
 */
export function warmPdfjs(): void {
  void loadPdfjs().catch(() => {
    // A failure here is reported properly when `openPdf` retries and awaits it.
  });
}

/** Copied verbatim into `public/` — see scripts/copy-pdfjs-assets.js. */
const ASSET_BASE = '/pdfjs/';

/**
 * Opens a PDF for rendering.
 *
 * Takes the bytes rather than the `Blob` because pdf.js hands the buffer to its
 * worker, which detaches it — the caller keeps the `Blob` for downloading and
 * opening externally, and that has to stay intact.
 */
export async function openPdf(bytes: ArrayBuffer): Promise<PDFDocumentProxy> {
  const pdfjs = await loadPdfjs();
  return pdfjs.getDocument({
    data: bytes,
    wasmUrl: `${ASSET_BASE}wasm/`,
    standardFontDataUrl: `${ASSET_BASE}standard_fonts/`,
  }).promise;
}
