/**
 * Semantic tones for ticket status and priority.
 *
 * The mappings that lived inline in Dashboard and TicketDetail switched on
 * English strings — 'new', 'in progress', 'closed' — while the backend's
 * statuses table is German ('Neu', 'In Bearbeitung', 'Abgeschlossen', …). Every
 * status therefore fell through to the default, so the colour carried no
 * information at all. Priority had the same problem: the backend sends
 * 'VERY_HIGH' / 'HIGH' / 'NORMAL', the checks compared against 'High' /
 * 'Medium'.
 *
 * Everything here matches on the values the backend actually emits, normalised,
 * with a documented fallback for statuses added later.
 */

export type Tone = 'neutral' | 'info' | 'active' | 'warning' | 'success' | 'danger';

/** Tailwind classes for a soft badge in the given tone. */
export const TONE_BADGE: Record<Tone, string> = {
  neutral: 'bg-tone-neutral-soft text-tone-neutral border-transparent',
  info: 'bg-tone-info-soft text-tone-info border-transparent',
  active: 'bg-tone-active-soft text-tone-active border-transparent',
  warning: 'bg-tone-warning-soft text-tone-warning border-transparent',
  success: 'bg-tone-success-soft text-tone-success border-transparent',
  danger: 'bg-tone-danger-soft text-tone-danger border-transparent',
};

/** Solid colour for a priority rail or dot. */
export const TONE_RAIL: Record<Tone, string> = {
  neutral: 'bg-tone-neutral',
  info: 'bg-tone-info',
  active: 'bg-tone-active',
  warning: 'bg-tone-warning',
  success: 'bg-tone-success',
  danger: 'bg-tone-danger',
};

function normalise(value: string): string {
  return value.trim().toLowerCase();
}

const STATUS_TONES: Array<[string, Tone]> = [
  ['neu', 'info'],
  ['zugewiesen', 'info'],
  ['in bearbeitung', 'active'],
  ['vor ort', 'active'],
  ['terminiert', 'neutral'],
  ['reterminiert', 'neutral'],
  ['prüfen', 'warning'],
  ['pruefen', 'warning'],
  ['ausstehend', 'warning'],
  ['wieder geöffnet', 'danger'],
  ['wieder geoeffnet', 'danger'],
  ['abgeschlossen', 'success'],
];

/**
 * Tone for a ticket status.
 *
 * "Warten auf Rückmeldung …" has several variants (internal, external), so it
 * is matched by prefix rather than listed exhaustively. Unknown statuses fall
 * back to neutral, which reads as "no signal" rather than pretending to mean
 * something.
 */
export function statusTone(status: string): Tone {
  const key = normalise(status);
  if (!key) return 'neutral';

  const exact = STATUS_TONES.find(([name]) => name === key);
  if (exact) return exact[1];

  if (key.startsWith('warten auf')) return 'warning';

  return 'neutral';
}

/**
 * Tone for a ticket priority.
 *
 * `priorityIndex` is the backend's numeric ranking and is used as a fallback,
 * because some tickets carry an index without a recognisable priority string.
 */
export function priorityTone(priority: string, priorityIndex = 0): Tone {
  switch (normalise(priority)) {
    case 'very_high':
    case 'very high':
      return 'danger';
    case 'high':
      return 'warning';
    case 'normal':
    case 'low':
      return 'neutral';
    default:
      if (priorityIndex > 7) return 'danger';
      if (priorityIndex > 4) return 'warning';
      return 'neutral';
  }
}

/** Human-readable priority label; the raw values are SCREAMING_CASE. */
export function priorityLabel(priority: string): string {
  switch (normalise(priority)) {
    case 'very_high':
      return 'Sehr hoch';
    case 'high':
      return 'Hoch';
    case 'normal':
      return 'Normal';
    case 'low':
      return 'Niedrig';
    default:
      return priority;
  }
}
