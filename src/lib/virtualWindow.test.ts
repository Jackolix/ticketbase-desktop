import { describe, expect, it } from 'vitest';
import { shouldVirtualize, virtualWindow, VIRTUALIZE_THRESHOLD } from './virtualWindow';

const base = { rowHeight: 40, scrollTop: 0, viewportHeight: 600, overscan: 10 };

describe('virtualWindow', () => {
  it('renders only the visible rows plus overscan', () => {
    // 600px of viewport at 40px a row is 15 rows, plus 10 either side.
    const w = virtualWindow({ ...base, count: 800, scrollTop: 4000 });

    expect(w.start).toBe(90); // 4000/40 = 100, minus overscan
    expect(w.end).toBe(125); // 100 + 15 + 10
    expect(w.end - w.start).toBeLessThan(40);
  });

  it('keeps the total height right, so the scrollbar does not lie', () => {
    const count = 800;
    const w = virtualWindow({ ...base, count, scrollTop: 4000 });

    const rendered = (w.end - w.start) * base.rowHeight;
    expect(w.padTop + rendered + w.padBottom).toBe(count * base.rowHeight);
  });

  it('renders from the top when the list has not been scrolled', () => {
    const w = virtualWindow({ ...base, count: 800 });
    expect(w.start).toBe(0);
    expect(w.padTop).toBe(0);
  });

  it('has no bottom spacer at the end of the list', () => {
    const w = virtualWindow({ ...base, count: 200, scrollTop: 200 * 40 });
    expect(w.end).toBe(200);
    expect(w.padBottom).toBe(0);
  });

  it('leaves short lists alone', () => {
    // Windowing a list that fits costs more than it saves, and uneven row
    // heights would show most here.
    const w = virtualWindow({ ...base, count: 20, scrollTop: 100 });
    expect(w).toEqual({ start: 0, end: 20, padTop: 0, padBottom: 0 });
  });

  it('renders everything until a row has been measured', () => {
    // The first paint has to happen before anything can be measured, and
    // guessing wrong would show blank space.
    const w = virtualWindow({ ...base, count: 800, rowHeight: 0 });
    expect(w).toEqual({ start: 0, end: 800, padTop: 0, padBottom: 0 });

    expect(virtualWindow({ ...base, count: 800, rowHeight: NaN }).end).toBe(800);
  });

  it('handles an empty list', () => {
    expect(virtualWindow({ ...base, count: 0 })).toEqual({
      start: 0,
      end: 0,
      padTop: 0,
      padBottom: 0,
    });
  });

  it('survives a scroll position past the end of the content', () => {
    // Happens when the list shrinks under a scrolled viewport — a filter that
    // suddenly matches less.
    const w = virtualWindow({ ...base, count: 200, scrollTop: 999_999 });

    expect(w.start).toBeLessThanOrEqual(199);
    expect(w.end).toBe(200);
    expect(w.padBottom).toBe(0);
    expect(w.padTop).toBeGreaterThanOrEqual(0);
  });

  it('never returns an inverted range', () => {
    for (const scrollTop of [0, 100, 5000, 100_000]) {
      for (const count of [0, 1, 81, 500]) {
        const w = virtualWindow({ ...base, count, scrollTop });
        expect(w.end).toBeGreaterThanOrEqual(w.start);
        expect(w.padTop).toBeGreaterThanOrEqual(0);
        expect(w.padBottom).toBeGreaterThanOrEqual(0);
      }
    }
  });
});

describe('shouldVirtualize', () => {
  it('kicks in only past the threshold', () => {
    expect(shouldVirtualize(VIRTUALIZE_THRESHOLD)).toBe(false);
    expect(shouldVirtualize(VIRTUALIZE_THRESHOLD + 1)).toBe(true);
  });
});
