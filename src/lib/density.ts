/**
 * Row density for the ticket board.
 *
 * The board was built at one fixed size — 12px titles over 10px metadata —
 * which fits a lot of tickets on screen and is genuinely hard to read. Rather
 * than trade one fixed size for another, the size is a preference: `compact`
 * keeps the original dispatch-board density, `comfortable` is the default and
 * is a step up from it, and `large` is sized for someone who would otherwise
 * reach for the operating system's magnifier.
 *
 * Every value is a Tailwind class rather than a CSS variable so the classes
 * stay statically visible to the compiler — Tailwind only emits what it can see
 * in the source, and an interpolated `text-[${n}px]` emits nothing at all.
 */

export type Density = 'compact' | 'comfortable' | 'large';

export interface DensityTokens {
  /** Vertical padding on each cell. */
  row: string;
  /** The ticket summary. */
  title: string;
  /** The secondary line under it. */
  meta: string;
  /** Numeric columns — id, date. */
  mono: string;
  badge: string;
  /** Width of the customer column before it truncates. */
  company: string;
  icon: string;
  /** Column headers. */
  head: string;
  /** The open-in-window button. */
  action: string;
}

export const DENSITY: Record<Density, DensityTokens> = {
  compact: {
    row: 'py-1.5',
    title: 'text-xs',
    meta: 'text-[10px]',
    mono: 'text-[11px]',
    badge: 'px-1.5 py-0 text-[10px]',
    company: 'max-w-[180px]',
    icon: 'h-3 w-3',
    head: 'text-[10px]',
    action: 'h-6 w-6',
  },
  comfortable: {
    row: 'py-2.5',
    title: 'text-sm',
    meta: 'text-xs',
    mono: 'text-xs',
    badge: 'px-2 py-0.5 text-xs',
    company: 'max-w-[220px]',
    icon: 'h-3.5 w-3.5',
    head: 'text-[11px]',
    action: 'h-7 w-7',
  },
  large: {
    row: 'py-3.5',
    title: 'text-base',
    meta: 'text-sm',
    mono: 'text-sm',
    badge: 'px-2.5 py-0.5 text-sm',
    company: 'max-w-[280px]',
    icon: 'h-4 w-4',
    head: 'text-xs',
    action: 'h-8 w-8',
  },
};

export const DENSITY_LABELS: Record<Density, string> = {
  compact: 'Kompakt',
  comfortable: 'Standard',
  large: 'Groß',
};

export const DEFAULT_DENSITY: Density = 'comfortable';

const STORAGE_KEY = 'ticketBoardDensity';

export function isDensity(value: unknown): value is Density {
  return value === 'compact' || value === 'comfortable' || value === 'large';
}

/**
 * The stored preference, or the default.
 *
 * localStorage rather than sessionStorage: this is a preference about eyesight,
 * not about the current search, and having to set it again every launch would
 * defeat the point.
 */
export function readDensity(): Density {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return isDensity(stored) ? stored : DEFAULT_DENSITY;
  } catch {
    // Private windows and locked-down profiles can throw on access.
    return DEFAULT_DENSITY;
  }
}

export function writeDensity(density: Density): void {
  try {
    localStorage.setItem(STORAGE_KEY, density);
  } catch {
    // Not being able to remember the choice is not a reason to refuse it.
  }
}
