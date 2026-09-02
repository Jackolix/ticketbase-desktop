/**
 * Dynamic ticket template data.
 *
 * Tickets created from a template carry a JSON object in `template_data` whose
 * keys are the form's field labels, already human-readable and German:
 *
 *   {"Wo befindet sich der Virus":["Lokaler PC / Notebook"],
 *    "Wie viele sind betroffen?":"Ein Arbeitsplatz",
 *    "Bitte geben Sie weitere Informationen ein":"…"}
 *
 * Values are strings, or single-element arrays for choice fields. getTickets
 * flattens those arrays server-side (sanitizeTemplateDataJson) but
 * getTicketById returns the raw column, so both shapes reach the client and
 * both have to be handled.
 *
 * This was previously flattened into one "Label: value" string joined by
 * newlines — or, in the list, every value joined by commas into an unreadable
 * run-on. The structure was there all along; it just was not being used.
 */

export interface TemplateField {
  label: string;
  value: string;
  /** True when the field was submitted empty. */
  isEmpty: boolean;
  /** Multi-line or long values want a full-width block rather than a column. */
  isLong: boolean;
}

/** Values past this length read better as a block than as a table cell. */
const LONG_VALUE = 60;

/**
 * Parses `template_data` into ordered fields.
 *
 * Returns an empty array for anything unparseable — an absent template is
 * indistinguishable from a broken one as far as rendering is concerned, and
 * neither should throw.
 */
export function parseTemplateData(raw: string | null | undefined): TemplateField[] {
  if (!raw || !raw.trim()) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }

  // An empty template serialises as `[]`, not `{}`.
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return [];

  return Object.entries(parsed as Record<string, unknown>).map(([label, rawValue]) => {
    const value = normaliseValue(rawValue);
    return {
      label: label.trim(),
      value,
      isEmpty: value.length === 0,
      isLong: value.length > LONG_VALUE || value.includes('\n'),
    };
  });
}

function normaliseValue(value: unknown): string {
  if (value == null) return '';

  if (Array.isArray(value)) {
    // Choice fields arrive as arrays; join in case more than one was picked.
    return value
      .map((entry) => normaliseValue(entry))
      .filter(Boolean)
      .join(', ');
  }

  if (typeof value === 'object') {
    return Object.values(value as Record<string, unknown>)
      .map((entry) => normaliseValue(entry))
      .filter(Boolean)
      .join(', ');
  }

  if (typeof value === 'boolean') return value ? 'Ja' : 'Nein';

  // Trim trailing newlines the form editor tends to leave behind.
  return String(value).replace(/\r\n/g, '\n').trim();
}

/**
 * One-line summary of a template, for list rows.
 *
 * Shows the first few filled values rather than every value joined by commas,
 * which produced an unreadable run-on for the larger onboarding templates.
 */
export function summariseTemplate(raw: string | null | undefined, limit = 3): string {
  const filled = parseTemplateData(raw).filter((f) => !f.isEmpty);
  if (filled.length === 0) return '';

  const shown = filled
    .slice(0, limit)
    .map((f) => f.value.split('\n')[0])
    .join(' · ');

  const remaining = filled.length - Math.min(limit, filled.length);
  return remaining > 0 ? `${shown} · +${remaining}` : shown;
}

/**
 * The text to show for a ticket: its description, or a readable fallback drawn
 * from the template when the description is empty.
 */
export function ticketDescriptionText(
  description: string,
  templateData: string | null | undefined,
): string {
  if (description && description.trim()) return description.trim();

  const summary = summariseTemplate(templateData, 4);
  return summary || 'Keine Beschreibung vorhanden';
}
