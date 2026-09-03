/**
 * Which slice of a long list is worth rendering.
 *
 * The ticket board mounted every row it had. At 800 tickets — an ordinary
 * "Alle" on a real installation — switching tabs took 2.6 seconds, all of it
 * building DOM nodes nobody could see. Rendering only the rows in view, with
 * spacer rows standing in for the rest, keeps the scrollbar honest and the
 * work proportional to the window rather than the list.
 */

export interface VirtualWindow {
  /** First row index to render, inclusive. */
  start: number;
  /** Last row index to render, exclusive. */
  end: number;
  /** Height of the spacer standing in for the rows above `start`. */
  padTop: number;
  /** Height of the spacer standing in for the rows below `end`. */
  padBottom: number;
}

export interface VirtualWindowInput {
  count: number;
  /** Measured height of one row. Zero or unknown disables windowing. */
  rowHeight: number;
  scrollTop: number;
  viewportHeight: number;
  /**
   * Rows rendered beyond each edge. Covers the gap between a scroll event and
   * the re-render that answers it, so fast scrolling does not show blank space.
   */
  overscan?: number;
}

const DEFAULT_OVERSCAN = 10;

/**
 * Below this, windowing costs more than it saves — and short lists are where
 * uneven row heights would be most visible.
 */
export const VIRTUALIZE_THRESHOLD = 80;

/** Whether a list is long enough to be worth windowing. */
export function shouldVirtualize(count: number): boolean {
  return count > VIRTUALIZE_THRESHOLD;
}

/**
 * The rows to render for a given scroll position.
 *
 * Falls back to rendering everything when the row height is not yet known —
 * the first paint has to happen before anything can be measured, and a wrong
 * guess would show blank space.
 */
export function virtualWindow({
  count,
  rowHeight,
  scrollTop,
  viewportHeight,
  overscan = DEFAULT_OVERSCAN,
}: VirtualWindowInput): VirtualWindow {
  if (count <= 0) return { start: 0, end: 0, padTop: 0, padBottom: 0 };

  if (!Number.isFinite(rowHeight) || rowHeight <= 0 || !shouldVirtualize(count)) {
    return { start: 0, end: count, padTop: 0, padBottom: 0 };
  }

  const top = Math.max(0, scrollTop);
  const height = Math.max(0, viewportHeight);

  const first = Math.floor(top / rowHeight);
  const visible = Math.ceil(height / rowHeight);

  const start = Math.max(0, Math.min(count - 1, first - overscan));
  const end = Math.max(start, Math.min(count, first + visible + overscan));

  return {
    start,
    end,
    padTop: start * rowHeight,
    padBottom: Math.max(0, (count - end) * rowHeight),
  };
}
