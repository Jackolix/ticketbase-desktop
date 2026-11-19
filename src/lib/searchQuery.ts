import type { TicketQuery, TicketSort } from '@/lib/sync';

/**
 * Structured search for the ticket board.
 *
 * Everything runs against the local SQLite store, so filters can be expressed
 * inline instead of through a row of dropdowns:
 *
 *   4812                      → that ticket first, then anything mentioning 4812
 *   id:4812                   → exactly that ticket
 *   firma:müller              → tickets for a company whose name contains that
 *   status:warten             → any status starting "Warten …"
 *   prio:hoch                 → priority
 *   von:1.9.2026              → created on or after (also 2026-09-01, 1.9.)
 *   bis:30.09.2026            → created on or before
 *   exchange mail             → every word, in any order, anywhere in the ticket
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
  /** True when the free text is a bare number, most likely a ticket number. */
  looksLikeId: boolean;
  /**
   * That number, when `looksLikeId`. It is searched as text too — "214" is as
   * likely a phone extension as a ticket — but it is what a lookup of a ticket
   * the store does not have should ask the backend for.
   */
  number?: number;
}

export interface SearchChip {
  /** The exact text in the query, so it can be removed again. */
  raw: string;
  field: string;
  value: string;
  /** Set when the value could not be understood, so it filters nothing. */
  invalid?: boolean;
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
    let invalid = false;

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
      case 'dateTo': {
        const iso = parseDate(value);
        if (iso) filters[field] = iso;
        else invalid = true;
        break;
      }
      default:
        // Every alias target is handled above; anything else is a mapping bug.
        continue;
    }

    chips.push({ raw, field: rawField.toLowerCase(), value, ...(invalid ? { invalid } : {}) });
    free = free.replace(raw, ' ');
  }

  const text = free.trim().replace(/\s+/g, ' ');

  let number: number | undefined;

  if (text) {
    filters.search = text;
    // A bare number is usually a ticket number being pasted in. It is still
    // searched as text; this only marks it for a lookup if no ticket has it.
    if (/^\d{2,}$/.test(text) && filters.id === undefined) {
      number = parseInt(text, 10);
      looksLikeId = true;
    }
  }

  return { filters, chips, looksLikeId, ...(number !== undefined ? { number } : {}) };
}

/**
 * Reads a date the way people type one here — `1.9.2026`, `01.09.26`, `1.9.`
 * for this year — or as ISO. Returns `YYYY-MM-DD`, or null if it is not a real
 * date, so `bis:31.02.` filters nothing instead of everything.
 */
export function parseDate(value: string, today: Date = new Date()): string | null {
  let year: number;
  let month: number;
  let day: number;

  const iso = value.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  const german = value.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2}|\d{4})?$/);

  if (iso) {
    [year, month, day] = [Number(iso[1]), Number(iso[2]), Number(iso[3])];
  } else if (german) {
    day = Number(german[1]);
    month = Number(german[2]);
    year = german[3] ? Number(german[3]) : today.getFullYear();
    if (german[3]?.length === 2) year += 2000;
  } else {
    return null;
  }

  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return null;
  }

  const pad = (n: number) => String(n).padStart(2, '0');
  return `${year}-${pad(month)}-${pad(day)}`;
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
  { field: 'firma', hint: 'Kunde — mit Vorschlägen' },
  { field: 'status', hint: 'z. B. neu, warten, prüfen' },
  { field: 'prio', hint: 'sehr hoch, hoch, normal, niedrig' },
  { field: 'von', hint: 'erstellt ab, z. B. 1.9.2026' },
  { field: 'bis', hint: 'erstellt bis, z. B. 30.9.' },
  { field: 'id', hint: 'genau diese Ticketnummer' },
];

/**
 * Fields whose name starts with what has been typed, so `fi` offers `firma:`.
 * Aliases count, so `kunde` does too.
 */
export function fieldsMatching(prefix: string): Array<{ field: string; hint: string }> {
  const needle = prefix.toLowerCase();
  if (!needle) return [];
  return SEARCH_FIELDS.filter(({ field }) => {
    const target = FIELD_ALIASES[field];
    return Object.entries(FIELD_ALIASES).some(
      ([alias, mapped]) => mapped === target && alias.startsWith(needle) && alias !== needle,
    );
  });
}

/**
 * The free-text word the caret sits in, if any — for offering "did you mean
 * the customer …?" while someone types a plain word.
 */
export function wordAt(
  input: string,
  caret: number,
): { text: string; start: number; end: number } | null {
  const position = Math.max(0, Math.min(caret, input.length));
  for (const token of tokenize(input)) {
    if (position < token.start || position > token.end) continue;
    if (token.text.includes(':') || /^["']/.test(token.text)) return null;
    return token;
  }
  return null;
}

/** Replaces a free-text word with a field term, quoting as `setTermValue` does. */
export function replaceWord(
  input: string,
  word: { start: number; end: number },
  field: string,
  value: string,
): { text: string; caret: number } {
  return setTermValue(
    input,
    { field, filter: null, value: '', start: word.start, end: word.end },
    value,
  );
}

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
