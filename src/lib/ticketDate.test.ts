import { describe, expect, it } from 'vitest';
import { compareTicketDates, parseTicketDate } from './ticketDate';

describe('parseTicketDate', () => {
  it('reads the backend d-m-Y H:i format day-first', () => {
    const d = parseTicketDate('02-09-2026 08:14')!;
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(8); // September, zero-indexed
    expect(d.getDate()).toBe(2);
    expect(d.getHours()).toBe(8);
    expect(d.getMinutes()).toBe(14);
  });

  it('reads d-m-Y without a time component', () => {
    const d = parseTicketDate('25-12-2026')!;
    expect(d.getMonth()).toBe(11); // December
    expect(d.getDate()).toBe(25);
  });

  it('handles days past the 12th, which native parsing cannot', () => {
    expect(new Date('25-12-2026').getTime()).toBeNaN();

    const d = parseTicketDate('25-12-2026')!;
    expect(d).toBeInstanceOf(Date);
    expect(isNaN(d.getTime())).toBe(false);
  });

  it('does not silently swap day and month', () => {
    // 02-09 is 2 September, never 9 February.
    const ours = parseTicketDate('02-09-2026 08:14')!;
    const naive = new Date('02-09-2026 08:14');

    expect(ours.getMonth()).toBe(8);
    expect(naive.getMonth()).toBe(1);
    expect(ours.getTime()).not.toBe(naive.getTime());
  });

  it('falls back to native parsing for ISO strings', () => {
    const d = parseTicketDate('2026-09-02T08:14:00Z')!;
    expect(d.getTime()).toBe(Date.parse('2026-09-02T08:14:00Z'));
  });

  it('returns null for empty and unparseable input', () => {
    expect(parseTicketDate('')).toBeNull();
    expect(parseTicketDate('not a date')).toBeNull();
  });
});

describe('compareTicketDates', () => {
  it('orders backend-formatted dates chronologically', () => {
    const unsorted = ['25-12-2026', '02-09-2026 08:14', '01-09-2026 16:31'];
    const sorted = [...unsorted].sort(compareTicketDates);

    expect(sorted).toEqual(['01-09-2026 16:31', '02-09-2026 08:14', '25-12-2026']);
  });

  it('orders dates that native parsing gets backwards', () => {
    // Naively parsed, '02-09-2026' (Feb 9) sorts BEFORE '11-01-2026' (Nov 1).
    // Read day-first, 2 Sept correctly sorts AFTER 11 Jan.
    expect(compareTicketDates('11-01-2026', '02-09-2026')).toBeLessThan(0);
  });

  it('sorts unparseable dates last without scrambling the rest', () => {
    const sorted = ['02-09-2026', '', '01-09-2026', 'garbage'].sort(compareTicketDates);

    expect(sorted.slice(0, 2)).toEqual(['01-09-2026', '02-09-2026']);
    expect(sorted.slice(2)).toHaveLength(2);
  });

  it('treats two unparseable dates as equal', () => {
    expect(compareTicketDates('', 'garbage')).toBe(0);
  });
});
