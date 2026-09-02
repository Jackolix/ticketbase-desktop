/**
 * Date handling for ticket timestamps.
 *
 * The backend formats every ticket timestamp with PHP's `date('d-m-Y H:i')`
 * (see APIController::getTicketDataa) — day first, then month. That format is
 * NOT parseable by `new Date()`:
 *
 *   new Date('02-09-2026 08:14')  ->  Mon Feb 09 2026   (day and month swapped)
 *   new Date('25-12-2026')        ->  Invalid Date      (no month 25)
 *
 * So anything that reaches for the native constructor on these strings is
 * wrong for every day of the month, and outright broken for days past the 12th.
 */

const D_M_Y_HM = /^(\d{2})-(\d{2})-(\d{4})\s+(\d{2}):(\d{2})$/;
const D_M_Y = /^(\d{2})-(\d{2})-(\d{4})$/;

/**
 * Parses a ticket timestamp in the backend's `d-m-Y H:i` (or `d-m-Y`) format,
 * falling back to native parsing for anything else (ISO strings, mostly).
 *
 * Returns null for empty input and for strings nothing can make sense of.
 */
export function parseTicketDate(dateString: string): Date | null {
  if (!dateString) return null;

  const withTime = dateString.match(D_M_Y_HM);
  if (withTime) {
    const [, day, month, year, hour, minute] = withTime;
    const date = new Date(
      parseInt(year),
      parseInt(month) - 1,
      parseInt(day),
      parseInt(hour),
      parseInt(minute),
    );
    if (!isNaN(date.getTime())) return date;
  }

  const withoutTime = dateString.match(D_M_Y);
  if (withoutTime) {
    const [, day, month, year] = withoutTime;
    const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
    if (!isNaN(date.getTime())) return date;
  }

  const date = new Date(dateString);
  return isNaN(date.getTime()) ? null : date;
}

/**
 * Comparator for sorting tickets by timestamp, ascending.
 *
 * Use this instead of `new Date(a).getTime() - new Date(b).getTime()`, which
 * silently produces NaN for most real ticket dates and leaves the sort order
 * undefined.
 *
 * Unparseable dates sort last in both directions, so a single bad row can't
 * scramble the rest of the list.
 */
export function compareTicketDates(a: string, b: string): number {
  const da = parseTicketDate(a);
  const db = parseTicketDate(b);

  if (da === null && db === null) return 0;
  if (da === null) return 1;
  if (db === null) return -1;

  return da.getTime() - db.getTime();
}
