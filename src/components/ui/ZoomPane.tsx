import { useEffect, useLayoutEffect, useRef, useState } from 'react';

/** The range the toolbar and the wheel gesture share. */
export const MIN_ZOOM = 25;
export const MAX_ZOOM = 400;
/** What one toolbar press changes the zoom by. */
export const ZOOM_STEP = 25;

/** Breathing room around the content, in CSS pixels. */
export const GUTTER = 12;

/**
 * How much of a wheel notch becomes zoom. Tuned so one notch of a mouse wheel
 * (100px on Windows) is close to one press of the toolbar button, while a
 * trackpad's much smaller deltas still feel continuous.
 */
const WHEEL_SENSITIVITY = 0.0022;

type Fit = 'width' | 'contain';

interface ZoomPaneProps {
  /** The content's own size, before any fitting or zooming. */
  naturalWidth: number;
  naturalHeight: number;
  /**
   * `width` fills the pane horizontally and scrolls down — what a multi-page
   * document wants. `contain` brings the whole thing into view.
   */
  fit: Fit;
  /** Percent. 100 is the fitted size, not the content's own pixels. */
  zoom: number;
  rotation: number;
  /** The ctrl/shift + wheel gesture reports its new zoom here. */
  onZoomChange: (zoom: number) => void;
  /** Receives the factor to draw at, already including the fit. */
  children: (scale: number) => React.ReactNode;
}

/**
 * The scrolling, panning and zooming shell shared by the image and PDF
 * previews.
 *
 * It exists because zooming is only half a feature without a way to reach the
 * parts that have moved off screen: a centred item that outgrows its container
 * overflows on all four sides, but only the right and bottom of that overflow
 * can be scrolled to. Both viewers used to lose the left and top edges of
 * anything zoomed in.
 */
export function ZoomPane({
  naturalWidth,
  naturalHeight,
  fit,
  zoom,
  rotation,
  onZoomChange,
  children,
}: ZoomPaneProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [pane, setPane] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const node = scrollRef.current;
    if (!node) return;

    setPane({ width: node.clientWidth, height: node.clientHeight });
    const observer = new ResizeObserver(([entry]) =>
      setPane({ width: entry.contentRect.width, height: entry.contentRect.height }),
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  // A quarter turn swaps which of the content's dimensions faces the pane.
  const quarterTurned = rotation % 180 !== 0;
  const acrossPane = quarterTurned ? naturalHeight : naturalWidth;
  const downPane = quarterTurned ? naturalWidth : naturalHeight;

  const room = { width: pane.width - GUTTER * 2, height: pane.height - GUTTER * 2 };
  let fitScale = 0;
  if (acrossPane > 0 && room.width > 0) {
    fitScale =
      fit === 'contain' && downPane > 0
        ? Math.min(room.width / acrossPane, room.height / downPane)
        : room.width / acrossPane;
  }

  const scale = fitScale * (zoom / 100);
  const width = acrossPane * scale;
  const height = downPane * scale;
  const fitsPane = width <= room.width && height <= room.height;

  /**
   * Where to keep still through the next zoom, as an offset inside the pane.
   * The wheel sets the pointer; a toolbar press leaves it unset and the centre
   * is used, which is the only sensible guess when there is no pointer.
   */
  const anchor = useRef<{ x: number; y: number } | null>(null);
  const previousScale = useRef(scale);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    const before = previousScale.current;
    previousScale.current = scale;

    const at = anchor.current;
    anchor.current = null;
    if (!el || before <= 0 || scale <= 0 || before === scale) return;

    const ax = at ? at.x : el.clientWidth / 2;
    const ay = at ? at.y : el.clientHeight / 2;
    const factor = scale / before;
    el.scrollLeft = (el.scrollLeft + ax) * factor - ax;
    el.scrollTop = (el.scrollTop + ay) * factor - ay;
  }, [scale]);

  // Attached by hand because the gesture has to suppress the scroll it would
  // otherwise cause, and React's own wheel listener is passive.
  const latest = useRef({ zoom, onZoomChange });
  useEffect(() => {
    latest.current = { zoom, onZoomChange };
  });

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.shiftKey) return;
      event.preventDefault();

      const rect = el.getBoundingClientRect();
      anchor.current = { x: event.clientX - rect.left, y: event.clientY - rect.top };

      // Proportional rather than a fixed step, so the gesture is as fine as the
      // device driving it. Up zooms in, which is the way round every map and
      // document viewer does it.
      const next = latest.current.zoom * Math.exp(-event.deltaY * WHEEL_SENSITIVITY);
      latest.current.onZoomChange(Math.round(Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, next))));
    };

    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  // Dragging the content, the way every document viewer does it. Scrollbars
  // alone are a poor way around a zoomed-in page, and the horizontal one in
  // particular is easy to miss.
  const pannable = !fitsPane && scale > 0;
  const [panning, setPanning] = useState(false);
  const grab = useRef<{ x: number; y: number; left: number; top: number } | null>(null);

  const startPan = (event: React.PointerEvent<HTMLDivElement>) => {
    const el = scrollRef.current;
    if (!el || event.button !== 0) return;
    if (el.scrollWidth <= el.clientWidth && el.scrollHeight <= el.clientHeight) return;

    grab.current = { x: event.clientX, y: event.clientY, left: el.scrollLeft, top: el.scrollTop };
    setPanning(true);
    el.setPointerCapture(event.pointerId);
  };

  const movePan = (event: React.PointerEvent<HTMLDivElement>) => {
    const el = scrollRef.current;
    const from = grab.current;
    if (!el || !from) return;
    el.scrollLeft = from.left - (event.clientX - from.x);
    el.scrollTop = from.top - (event.clientY - from.y);
  };

  const endPan = (event: React.PointerEvent<HTMLDivElement>) => {
    const el = scrollRef.current;
    if (!grab.current) return;
    grab.current = null;
    setPanning(false);
    if (el?.hasPointerCapture(event.pointerId)) el.releasePointerCapture(event.pointerId);
  };

  return (
    <div
      ref={scrollRef}
      onPointerDown={startPan}
      onPointerMove={movePan}
      onPointerUp={endPan}
      onPointerCancel={endPan}
      // Centred while it fits, aligned to the start once it does not — see the
      // component's note on why centring alone loses the far edges.
      className={`flex h-full flex-col gap-3 overflow-auto ${
        fitsPane ? 'items-center justify-center' : 'items-start'
      } ${panning ? 'cursor-grabbing' : pannable ? 'cursor-grab' : ''}`}
      style={{ padding: GUTTER, touchAction: pannable ? 'none' : undefined }}
    >
      {children(scale)}
    </div>
  );
}
