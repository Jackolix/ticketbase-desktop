import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_DENSITY,
  DENSITY,
  DENSITY_LABELS,
  isDensity,
  readDensity,
  writeDensity,
} from './density';

/**
 * The suite runs in the node environment, so there is no localStorage unless
 * one is provided. That is useful in itself: the first case below is the real
 * behaviour of a browser that refuses storage access.
 */
function stubStorage(initial: Record<string, string> = {}) {
  const store = new Map(Object.entries(initial));
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
    clear: () => store.clear(),
  });
  return store;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('density tokens', () => {
  it('covers every density with every token', () => {
    for (const density of Object.keys(DENSITY) as Array<keyof typeof DENSITY>) {
      for (const [token, value] of Object.entries(DENSITY[density])) {
        expect(value, `${density}.${token}`).toBeTruthy();
      }
      expect(DENSITY_LABELS[density]).toBeTruthy();
    }
  });

  it('uses literal class names, not interpolated ones', () => {
    // Tailwind only emits classes it can see in the source; a computed
    // `text-[${n}px]` would silently render as no styling at all.
    for (const tokens of Object.values(DENSITY)) {
      for (const value of Object.values(tokens)) {
        expect(value).not.toContain('${');
      }
    }
  });

  it('lets the customer column grow with the text', () => {
    // A fixed width truncates "Kern & Partner Steuerberatung" sooner the
    // larger the type gets, which is backwards.
    expect(DENSITY.compact.company).toBe('max-w-[180px]');
    expect(DENSITY.large.company).toBe('max-w-[280px]');
  });

  it('defaults to something larger than the original board', () => {
    // The whole point of the setting: the default is a step up from compact.
    expect(DEFAULT_DENSITY).toBe('comfortable');
    expect(DENSITY[DEFAULT_DENSITY].title).toBe('text-sm');
    expect(DENSITY.compact.title).toBe('text-xs');
  });
});

describe('readDensity', () => {
  it('falls back to the default when storage is unavailable entirely', () => {
    expect(readDensity()).toBe(DEFAULT_DENSITY);
    expect(() => writeDensity('large')).not.toThrow();
  });

  it('falls back to the default when nothing is stored', () => {
    stubStorage();
    expect(readDensity()).toBe(DEFAULT_DENSITY);
  });

  it('round-trips a stored choice', () => {
    stubStorage();
    writeDensity('large');
    expect(readDensity()).toBe('large');
  });

  it('ignores a stored value that is no longer valid', () => {
    stubStorage({ ticketBoardDensity: 'enormous' });
    expect(readDensity()).toBe(DEFAULT_DENSITY);
  });

  it('survives storage that throws on access', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('access denied');
      },
      setItem: () => {
        throw new Error('access denied');
      },
    });

    expect(readDensity()).toBe(DEFAULT_DENSITY);
    expect(() => writeDensity('large')).not.toThrow();
  });
});

describe('isDensity', () => {
  it('accepts only the three known values', () => {
    expect(isDensity('compact')).toBe(true);
    expect(isDensity('comfortable')).toBe(true);
    expect(isDensity('large')).toBe(true);
    expect(isDensity('huge')).toBe(false);
    expect(isDensity(null)).toBe(false);
  });
});
