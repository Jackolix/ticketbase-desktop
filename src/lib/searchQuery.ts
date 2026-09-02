import type { TicketQuery, TicketSort } from '@/lib/sync';

/**
 * Structured search for the ticket board.
 *
 * Everything runs against the local SQLite store, so filters can be expressed
 * inline instead of through a row of dropdowns:
 *
 *   4812                      → the ticket with that id
 *   id:4812                   → same, explicit
 *   firma:müller              → tickets for a company whose name contains that
 *   status:warten             → any status starting "Warten …"
 *   prio:hoch                 → priority
 *   von:2026-09-01            → created on or after
 *   bis:2026-09-30            → created on or before
 *   exchange mail             → free text over summary, description, company
 *
 * Terms combine, and anything not recognised as a field falls through to free
 * text — so a stray colon never swallows the query.
 */

export interface ParsedSearch {
  /** Store filters derived from the field terms. */
  filters: Omit<TicketQuery, 'bucket' | 'sort' | 'limit' | 'offset'>;
  /** The recognised field terms, for rendering as removable chips. */
  chips: SearchChip[];
  /** True when a bare number was read as a ticket id. */
  looksLikeId: boolean;
}

export interface SearchChip {
  /** The exact text in the query, so it can be removed again. */
  raw: string;
  field: string;
  value: string;
}

/** German-first, with English aliases, since the backend data is German. */
const FIELD_ALIASES: Record<string, keyof ParsedSearch['filters'] | 'sort'> = {
  id: 'id',
  nr: 'id',
  firma: 'companyName',
  kunde: 'companyName',
  company: 'companyName',
  status: 'status',
  prio: 'priority',
  priority: 'priority',
  von: 'dateFrom',
  from: 'dateFrom',
  bis: 'dateTo',
  to: 'dateTo',
};

/** Priority shorthands mapped onto the values the backend stores. */
const PRIORITY_ALIASES: Record<string, string> = {
  hoch: 'HIGH',
  high: 'HIGH',
  'sehr hoch': 'VERY_HIGH',
  sehrhoch: 'VERY_HIGH',
  kritisch: 'VERY_HIGH',
  normal: 'NORMAL',
  niedrig: 'LOW',
  low: 'LOW',
};

const TERM = /(\w+):("[^"]*"|'[^']*'|\S+)/g;

export function parseSearch(input: string): ParsedSearch {
  const filters: ParsedSearch['filters'] = {};
  const chips: SearchChip[] = [];
  let looksLikeId = false;

  let free = input;

  for (const match of input.matchAll(TERM)) {
    const [raw, rawField, rawValue] = match;
    const field = FIELD_ALIASES[rawField.toLowerCase()];
    if (!field || field === 'sort') continue;

    const value = unquote(rawValue);
    if (!value) continue;

    switch (field) {
      case 'id': {
        const id = parseInt(value, 10);
        if (!Number.isFinite(id) || id <= 0) continue;
        filters.id = id;
        break;
      }
      case 'priority':
        filters.priority = PRIORITY_ALIASES[value.toLowerCase()] ?? value;
        break;
      case 'companyName':
        filters.companyName = value;
        break;
      case 'status':
        filters.status = value;
        break;
      case 'dateFrom':
        filters.dateFrom = value;
        break;
      case 'dateTo':
        filters.dateTo = value;
        break;
      default:
        // Every alias target is handled above; anything else is a mapping bug.
        continue;
    }

    chips.push({ raw, field: rawField.toLowerCase(), value });
    free = free.replace(raw, ' ');
  }

  const text = free.trim().replace(/\s+/g, ' ');

  if (text) {
    // A bare number is almost always a ticket id being pasted in.
    if (/^\d{2,}$/.test(text) && filters.id === undefined) {
      filters.id = parseInt(text, 10);
      looksLikeId = true;
    } else {
      filters.search = text;
    }
  }

  return { filters, chips, looksLikeId };
}

function unquote(value: string): string {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

/** Removes one chip's term from the raw query string. */
export function removeChip(input: string, chip: SearchChip): string {
  return input.replace(chip.raw, ' ').trim().replace(/\s+/g, ' ');
}

/** Field names offered as completions in the search box. */
export const SEARCH_FIELDS: Array<{ field: string; hint: string }> = [
  { field: 'id', hint: 'Ticketnummer' },
  { field: 'firma', hint: 'Kundenname' },
  { field: 'status', hint: 'z. B. offen, warten' },
  { field: 'prio', hint: 'hoch, normal' },
  { field: 'von', hint: 'JJJJ-MM-TT' },
  { field: 'bis', hint: 'JJJJ-MM-TT' },
];

export const SORT_LABELS: Record<TicketSort, string> = {
  'date-desc': 'Neueste zuerst',
  'date-asc': 'Älteste zuerst',
  'priority-high': 'Priorität ↓',
  'priority-low': 'Priorität ↑',
  'id-desc': 'Nummer ↓',
  'id-asc': 'Nummer ↑',
  'company-asc': 'Kunde A–Z',
  'company-desc': 'Kunde Z–A',
  'status-asc': 'Status A–Z',
  'status-desc': 'Status Z–A',
};
