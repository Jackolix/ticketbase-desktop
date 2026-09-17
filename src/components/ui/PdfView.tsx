import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import type { PDFDocumentProxy, RenderTask } from 'pdfjs-dist';

import { ZoomPane } from '@/components/ui/ZoomPane';
import { openPdf } from '@/lib/pdf';

/**
 * How far outside the viewport a page is still worth having drawn. Roughly a
 * viewport above and below, so scrolling at a normal pace never waits on a
 * render, while a hundred-page document keeps only a handful of canvases.
 */
const PRERENDER_MARGIN = '100% 0px';

/**
 * Drawing at the display's density keeps text sharp, but a HiDPI screen at 400%
 * would ask for a canvas past what the webview will allocate.
 */
const MAX_PIXEL_RATIO = 2;

interface PdfViewProps {
  /** The document's bytes. Read once; the caller keeps the `Blob`. */
  blob: Blob;
  /** Percent, from the preview's toolbar. 100 fits the page to the pane. */
  zoom: number;
  rotation: number;
  /** The ctrl/shift + wheel gesture reports its new zoom here. */
  onZoomChange: (zoom: number) => void;
  /** Reports the page count once the document opens, for the toolbar. */
  onLoad: (pageCount: number) => void;
  /** The topmost page currently on screen. */
  onPageChange: (page: number) => void;
  onError: (message: string) => void;
}

/**
 * Renders a PDF page by page onto canvases.
 *
 * See `@/lib/pdf` for why the webview is not asked to display the file itself.
 */
export function PdfView({
  blob,
  zoom,
  rotation,
  onZoomChange,
  onLoad,
  onPageChange,
  onError,
}: PdfViewProps) {
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  /** Page one at scale 1. Every page is assumed to match it, which all but a
   *  handful of documents do, and each page corrects itself once drawn. */
  const [baseSize, setBaseSize] = useState<{ width: number; height: number } | null>(null);

  // The callbacks belong to the caller's render, not to this effect's
  // dependencies — reading them through a ref keeps an inline arrow from
  // reopening the document on every keystroke elsewhere in the modal.
  const callbacks = useRef({ onLoad, onPageChange, onError });
  useEffect(() => {
    callbacks.current = { onLoad, onPageChange, onError };
  });

  useEffect(() => {
    let cancelled = false;
    let opened: PDFDocumentProxy | null = null;

    const load = async () => {
      try {
        const document = await openPdf(await blob.arrayBuffer());
        if (cancelled) {
          void document.destroy();
          return;
        }
        opened = document;

        const first = await document.getPage(1);
        const { width, height } = first.getViewport({ scale: 1 });
        if (cancelled) return;

        setBaseSize({ width, height });
        setDoc(document);
        callbacks.current.onLoad(document.numPages);
      } catch (err) {
        console.error('Failed to open PDF:', err);
        if (cancelled) return;
        callbacks.current.onError(messageFor(err));
      }
    };

    void load();

    return () => {
      cancelled = true;
      setDoc(null);
      setBaseSize(null);
      void opened?.destroy();
    };
  }, [blob]);

  // Which pages are on screen, so the toolbar can say where the reader is.
  const onScreen = useRef(new Set<number>());
  const reportVisibility = useCallback((page: number, visible: boolean) => {
    const pages = onScreen.current;
    if (visible) pages.add(page);
    else pages.delete(page);
    if (pages.size > 0) callbacks.current.onPageChange(Math.min(...pages));
  }, []);

  if (!doc || !baseSize) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        <p className="text-xs text-muted-foreground">PDF wird geladen…</p>
      </div>
    );
  }

  const quarterTurned = rotation % 180 !== 0;

  return (
    <ZoomPane
      naturalWidth={baseSize.width}
      naturalHeight={baseSize.height}
      // Pages are read one after another down the pane, so the width is what
      // should fill it; the rest is scrolled to.
      fit="width"
      zoom={zoom}
      rotation={rotation}
      onZoomChange={onZoomChange}
    >
      {(scale) =>
        Array.from({ length: doc.numPages }, (_, index) => (
          <PdfPage
            key={index + 1}
            doc={doc}
            pageNumber={index + 1}
            scale={scale}
            rotation={rotation}
            width={(quarterTurned ? baseSize.height : baseSize.width) * scale}
            height={(quarterTurned ? baseSize.width : baseSize.height) * scale}
            onVisibilityChange={reportVisibility}
          />
        ))
      }
    </ZoomPane>
  );
}

/**
 * One page.
 *
 * Sized from the document before anything is drawn, so the scrollbar is right
 * from the start and does not jump as pages arrive.
 */
function PdfPage({
  doc,
  pageNumber,
  scale,
  rotation,
  width,
  height,
  onVisibilityChange,
}: {
  doc: PDFDocumentProxy;
  pageNumber: number;
  scale: number;
  rotation: number;
  width: number;
  height: number;
  onVisibilityChange: (page: number, visible: boolean) => void;
}) {
  const holderRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [near, setNear] = useState(false);
  const [drawn, setDrawn] = useState(false);

  // `root: null` measures against the viewport but still honours the modal's
  // own clipping, so the scroll container needs no threading through.
  useEffect(() => {
    const node = holderRef.current;
    if (!node) return;

    const observer = new IntersectionObserver(([entry]) => setNear(entry.isIntersecting), {
      rootMargin: PRERENDER_MARGIN,
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const node = holderRef.current;
    if (!node) return;

    const observer = new IntersectionObserver(([entry]) =>
      onVisibilityChange(pageNumber, entry.isIntersecting),
    );
    observer.observe(node);
    return () => {
      observer.disconnect();
      onVisibilityChange(pageNumber, false);
    };
  }, [pageNumber, onVisibilityChange]);

  useEffect(() => {
    if (!near) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    let cancelled = false;
    let task: RenderTask | null = null;

    const draw = async () => {
      const page = await doc.getPage(pageNumber);
      if (cancelled) return;

      const viewport = page.getViewport({ scale, rotation });
      const ratio = Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO);

      canvas.width = Math.round(viewport.width * ratio);
      canvas.height = Math.round(viewport.height * ratio);
      canvas.style.width = `${Math.round(viewport.width)}px`;
      canvas.style.height = `${Math.round(viewport.height)}px`;

      task = page.render({
        canvas,
        viewport,
        transform: ratio === 1 ? undefined : [ratio, 0, 0, ratio, 0, 0],
      });
      await task.promise;
      if (!cancelled) setDrawn(true);
    };

    void draw().catch((err: unknown) => {
      // Cancelling a page to redraw it at another zoom is routine, not a fault.
      if (err instanceof Error && err.name === 'RenderingCancelledException') return;
      console.error(`Failed to render PDF page ${pageNumber}:`, err);
    });

    return () => {
      cancelled = true;
      task?.cancel();
      setDrawn(false);
      // Release the backing store. A long document would otherwise hold on to
      // every page it has been scrolled past.
      canvas.width = 0;
      canvas.height = 0;
    };
  }, [near, doc, pageNumber, scale, rotation]);

  return (
    <div
      ref={holderRef}
      style={{ width, height }}
      className="relative shrink-0 bg-white shadow-sm ring-1 ring-black/10"
    >
      <canvas ref={canvasRef} className={drawn ? undefined : 'invisible'} />
      {!drawn && (
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="font-mono text-[11px] tabular-nums text-neutral-400">{pageNumber}</span>
        </div>
      )}
    </div>
  );
}

/** pdf.js reports why it gave up through the error's name. */
function messageFor(err: unknown): string {
  if (err instanceof Error) {
    if (err.name === 'PasswordException') {
      return 'Diese PDF ist passwortgeschützt und kann nicht angezeigt werden.';
    }
    if (err.name === 'InvalidPDFException') {
      return 'Diese Datei konnte nicht als PDF gelesen werden.';
    }
  }
  return 'Die PDF konnte nicht angezeigt werden.';
}
