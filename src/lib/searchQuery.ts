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
 *
 * Typing a term is only reasonable if the app helps you finish it, which is
 * what `activeTermAt` is for: it reports the term the caret sits in so the
 * search box can offer the matching customers, statuses or priorities instead
 * of expecting anyone to remember how a company is spelled in the database.
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


/**
 * The term the caret currently sits in, if it is one.
 *
 * Reported so the search box can complete it. The caret is used rather than
 * "the last word" so that going back to fix an earlier term still offers
 * suggestions for that term rather than for the end of the line.
 */
export interface ActiveTerm {
  /** The field as typed, lowercased — `firma`, `kunde`, `status` … */
  field: string;
  /** The canonical filter it maps to, or null if the field is not one of ours. */
  filter: keyof ParsedSearch['filters'] | null;
  /** What has been typed after the colon so far, unquoted. */
  value: string;
  /** Where the whole term sits in the input. */
  start: number;
  end: number;
}

/** Splits on whitespace, treating a quoted run as a single token. */
function tokenize(input: string): Array<{ text: string; start: number; end: number }> {
  const tokens: Array<{ text: string; start: number; end: number }> = [];
  let start = -1;
  let quote: string | null = null;

  for (let i = 0; i < input.length; i += 1) {
    const char = input[i];

    if (quote) {
      if (char === quote) quote = null;
      continue;
    }

    if (char === '"' || char === "'") {
      if (start < 0) start = i;
      quote = char;
      continue;
    }

    if (/\s/.test(char)) {
      if (start >= 0) {
        tokens.push({ text: input.slice(start, i), start, end: i });
        start = -1;
      }
      continue;
    }

    if (start < 0) start = i;
  }

  if (start >= 0) tokens.push({ text: input.slice(start), start, end: input.length });
  return tokens;
}

const TERM_HEAD = /^([A-Za-z_][\w]*):(.*)$/;

export function activeTermAt(input: string, caret: number): ActiveTerm | null {
  const position = Math.max(0, Math.min(caret, input.length));

  for (const token of tokenize(input)) {
    // Inclusive at both ends: the caret sitting just after `firma:` is still
    // in that term, which is precisely when suggestions are most wanted.
    if (position < token.start || position > token.end) continue;

    const match = token.text.match(TERM_HEAD);
    if (!match) return null;

    const [, field, rawValue] = match;
    const alias = FIELD_ALIASES[field.toLowerCase()];

    return {
      field: field.toLowerCase(),
      filter: alias && alias !== 'sort' ? alias : null,
      value: unquote(rawValue),
      start: token.start,
      end: token.end,
    };
  }

  return null;
}

/**
 * Rewrites one term's value, returning the new query and where the caret
 * should land.
 *
 * Values with spaces are quoted, because an unquoted "Müller Logistik GmbH"
 * would parse as a company named "Müller" plus two stray free-text words.
 */
export function setTermValue(
  input: string,
  term: ActiveTerm,
  value: string,
): { text: string; caret: number } {
  const quoted = /\s/.test(value) ? `"${value.replace(/"/g, '')}"` : value;
  const replacement = `${term.field}:${quoted}`;

  const before = input.slice(0, term.start);
  const after = input.slice(term.end);
  // Leave a separator so the next term can be typed straight away.
  const separator = after.startsWith(' ') || after === '' ? '' : ' ';

  return {
    text: `${before}${replacement}${separator}${after}`,
    caret: before.length + replacement.length + separator.length,
  };
}

/** Field names offered as completions in the search box. */
export const SEARCH_FIELDS: Array<{ field: string; hint: string }> = [
  { field: 'id', hint: 'Ticketnummer' },
  { field: 'firma', hint: 'Kunde — mit Vorschlägen' },
  { field: 'status', hint: 'z. B. offen, warten' },
  { field: 'prio', hint: 'hoch, normal' },
  { field: 'von', hint: 'JJJJ-MM-TT' },
  { field: 'bis', hint: 'JJJJ-MM-TT' },
];

/** Priority values offered while typing `prio:`. */
export const PRIORITY_SUGGESTIONS: Array<{ value: string; label: string }> = [
  { value: 'sehr hoch', label: 'Sehr hoch' },
  { value: 'hoch', label: 'Hoch' },
  { value: 'normal', label: 'Normal' },
  { value: 'niedrig', label: 'Niedrig' },
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
