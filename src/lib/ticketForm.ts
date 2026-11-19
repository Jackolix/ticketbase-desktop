/**
 * The `form` block of a ticket (backend 2026-11, INTEGRATIONS.md §4.4).
 *
 * The ticket lists render each ticket's template form server-side, the same
 * way the web shows it: rows with labels in the template's order, every value
 * of a multi-choice field, sections, and old values whose field no longer
 * exists ("extra"). That beats re-reading `template_data`, whose keys are
 * whatever label a field had when the ticket was created and which held only
 * the first value of a choice.
 */

export interface TicketFormRow {
  kind: 'section' | 'field' | 'extra';
  label: string;
  type: string;
  values: string[];
  /** Original names of uploaded files. The API exposes no download path. */
  files: string[];
  answered: boolean;
}

export interface TicketForm {
  /** v2: a form ticket; legacy: an old ticket read through the template; none: no form. */
  source: 'v2' | 'legacy' | 'none';
  /** The template changed after the ticket was created; rows show what was asked then. */
  templateChanged: boolean;
  rows: TicketFormRow[];
}

const strings = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((v) => typeof v === 'string' || typeof v === 'number').map(String) : [];

/**
 * Reads the block defensively. Returns null when there is nothing worth
 * showing, so the caller can fall back to `template_data`.
 */
export function readTicketForm(raw: unknown): TicketForm | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const data = raw as Record<string, unknown>;

  const source = data.source === 'v2' || data.source === 'legacy' ? data.source : 'none';
  if (source === 'none' || !Array.isArray(data.rows)) return null;

  const rows: TicketFormRow[] = data.rows.flatMap((entry): TicketFormRow[] => {
    if (!entry || typeof entry !== 'object') return [];
    const row = entry as Record<string, unknown>;
    const kind = row.kind === 'section' || row.kind === 'extra' ? row.kind : 'field';
    return [{
      kind,
      label: typeof row.label === 'string' ? row.label : '',
      type: typeof row.type === 'string' ? row.type : '',
      values: strings(row.values),
      files: strings(row.files),
      answered: Boolean(row.answered),
    }];
  });

  if (!rows.some((row) => row.kind !== 'section')) return null;
  return { source, templateChanged: Boolean(data.template_changed), rows };
}

/**
 * Rows to display: answered fields under the sections that still have one.
 * Unanswered fields are counted instead of listed, as TemplateFields does.
 */
export function visibleRows(form: TicketForm): { rows: TicketFormRow[]; unanswered: number } {
  const rows: TicketFormRow[] = [];
  let unanswered = 0;
  let pendingSection: TicketFormRow | null = null;

  for (const row of form.rows) {
    if (row.kind === 'section') {
      pendingSection = row;
      continue;
    }
    if (!row.answered) {
      unanswered += 1;
      continue;
    }
    if (pendingSection) {
      rows.push(pendingSection);
      pendingSection = null;
    }
    rows.push(row);
  }

  return { rows, unanswered };
}
