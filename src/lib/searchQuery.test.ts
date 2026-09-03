import { describe, expect, it } from 'vitest';
import { activeTermAt, parseSearch, removeChip, setTermValue } from './searchQuery';

describe('parseSearch', () => {
  it('reads a bare number as a ticket id', () => {
    const { filters, looksLikeId } = parseSearch('4812');
    expect(filters.id).toBe(4812);
    expect(looksLikeId).toBe(true);
    expect(filters.search).toBeUndefined();
  });

  it('treats free text as a search term, not an id', () => {
    const { filters, looksLikeId } = parseSearch('exchange mail');
    expect(filters.search).toBe('exchange mail');
    expect(filters.id).toBeUndefined();
    expect(looksLikeId).toBe(false);
  });

  it('parses field terms', () => {
    const { filters } = parseSearch('firma:müller status:offen prio:hoch');
    expect(filters.companyName).toBe('müller');
    expect(filters.status).toBe('offen');
    expect(filters.priority).toBe('HIGH');
  });

  it('maps priority shorthands onto the backend values', () => {
    expect(parseSearch('prio:hoch').filters.priority).toBe('HIGH');
    expect(parseSearch('prio:kritisch').filters.priority).toBe('VERY_HIGH');
    expect(parseSearch('prio:normal').filters.priority).toBe('NORMAL');
  });

  it('accepts English aliases alongside the German fields', () => {
    expect(parseSearch('company:kern').filters.companyName).toBe('kern');
    expect(parseSearch('from:2026-09-01').filters.dateFrom).toBe('2026-09-01');
  });

  it('supports quoted values with spaces', () => {
    const { filters } = parseSearch('firma:"Müller Logistik GmbH"');
    expect(filters.companyName).toBe('Müller Logistik GmbH');
  });

  it('combines field terms with leftover free text', () => {
    const { filters } = parseSearch('firma:müller exchange down');
    expect(filters.companyName).toBe('müller');
    expect(filters.search).toBe('exchange down');
  });

  it('leaves an unknown field in the free text rather than dropping it', () => {
    // A stray colon must never silently swallow part of the query.
    const { filters } = parseSearch('foo:bar exchange');
    expect(filters.search).toBe('foo:bar exchange');
  });

  it('ignores a field term with an empty value', () => {
    const { filters } = parseSearch('firma:');
    expect(filters.companyName).toBeUndefined();
  });

  it('ignores a non-numeric or negative id', () => {
    expect(parseSearch('id:abc').filters.id).toBeUndefined();
    expect(parseSearch('id:0').filters.id).toBeUndefined();
  });

  it('lets an explicit id: win over a bare number', () => {
    const { filters } = parseSearch('id:4812 999');
    expect(filters.id).toBe(4812);
  });

  it('returns nothing for an empty query', () => {
    const { filters, chips } = parseSearch('   ');
    expect(filters).toEqual({});
    expect(chips).toHaveLength(0);
  });

  it('reports chips so they can be rendered and removed', () => {
    const { chips } = parseSearch('firma:müller status:offen rest');
    expect(chips.map((c) => [c.field, c.value])).toEqual([
      ['firma', 'müller'],
      ['status', 'offen'],
    ]);
  });

  it('is case insensitive on field names', () => {
    expect(parseSearch('FIRMA:müller').filters.companyName).toBe('müller');
  });

  it('parses date ranges', () => {
    const { filters } = parseSearch('von:2026-09-01 bis:2026-09-30');
    expect(filters.dateFrom).toBe('2026-09-01');
    expect(filters.dateTo).toBe('2026-09-30');
  });
});

describe('removeChip', () => {
  it('removes just that term and tidies the whitespace', () => {
    const query = 'firma:müller status:offen exchange';
    const { chips } = parseSearch(query);
    const firma = chips.find((c) => c.field === 'firma')!;

    expect(removeChip(query, firma)).toBe('status:offen exchange');
  });

  it('leaves the query usable after removing the only term', () => {
    const { chips } = parseSearch('firma:müller');
    expect(removeChip('firma:müller', chips[0])).toBe('');
  });
});

describe('activeTermAt', () => {
  it('reports the term the caret is inside, not the last one typed', () => {
    const query = 'firma:mül status:offen';
    // Caret still in the company term, after going back to edit it.
    const term = activeTermAt(query, 'firma:mül'.length);

    expect(term?.field).toBe('firma');
    expect(term?.filter).toBe('companyName');
    expect(term?.value).toBe('mül');
  });

  it('treats a bare field as an active term so suggestions open immediately', () => {
    const term = activeTermAt('firma:', 6);
    expect(term?.field).toBe('firma');
    expect(term?.value).toBe('');
  });

  it('keeps a quoted value in one piece', () => {
    const query = 'firma:"Müller Logistik GmbH"';
    const term = activeTermAt(query, query.length);

    expect(term?.value).toBe('Müller Logistik GmbH');
    expect(term?.end).toBe(query.length);
  });

  it('returns nothing for free text', () => {
    expect(activeTermAt('exchange kaputt', 3)).toBeNull();
  });

  it('reports an unknown field without a filter', () => {
    // So the box can leave it alone rather than guessing what it meant.
    const term = activeTermAt('foo:bar', 7);
    expect(term?.field).toBe('foo');
    expect(term?.filter).toBeNull();
  });
});

describe('setTermValue', () => {
  it('completes the term the caret is in and leaves the rest alone', () => {
    const query = 'firma:mül status:offen';
    const term = activeTermAt(query, 'firma:mül'.length)!;

    const { text } = setTermValue(query, term, 'Müller Logistik');
    expect(text).toBe('firma:"Müller Logistik" status:offen');
  });

  it('quotes names with spaces, which would otherwise split into free text', () => {
    const term = activeTermAt('firma:', 6)!;
    const { text } = setTermValue('firma:', term, 'Müller Logistik GmbH');

    // Unquoted, everything after the first word would be searched as free text.
    expect(text).toBe('firma:"Müller Logistik GmbH"');
    expect(parseSearch(text).filters.companyName).toBe('Müller Logistik GmbH');
    expect(parseSearch(text).filters.search).toBeUndefined();
  });

  it('leaves the caret ready for the next term', () => {
    const term = activeTermAt('firma:mül', 9)!;
    const { text, caret } = setTermValue('firma:mül', term, 'Schmidt');

    expect(text).toBe('firma:Schmidt');
    expect(caret).toBe(text.length);
  });

  it('does not double the separator when one is already there', () => {
    const query = 'firma:mül status:offen';
    const term = activeTermAt(query, 3)!;

    expect(setTermValue(query, term, 'Schmidt').text).toBe('firma:Schmidt status:offen');
  });
});
