import { describe, expect, it } from 'vitest';
import { parseSearch, removeChip } from './searchQuery';

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
