import { Paperclip } from 'lucide-react';
import { visibleRows, type TicketForm } from '@/lib/ticketForm';

interface TicketFormViewProps {
  form: TicketForm;
}

/** Long or multi-line answers take the full width; short ones pair up. */
const LONG_VALUE = 60;

/**
 * A ticket's template form as the server renders it: answered fields in the
 * template's order, grouped under their sections.
 */
export function TicketFormView({ form }: TicketFormViewProps) {
  const { rows, unanswered } = visibleRows(form);
  if (rows.length === 0) return null;

  return (
    <div className="space-y-3">
      <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
        {rows.map((row, index) => {
          if (row.kind === 'section') {
            return (
              <h3 key={index} className="border-b pb-1 pt-1 text-xs font-semibold sm:col-span-2">
                {row.label}
              </h3>
            );
          }

          const text = row.values.join(row.type === 'checkbox' ? ', ' : '\n');
          const isLong = row.type === 'textarea' || text.length > LONG_VALUE || text.includes('\n');

          return (
            <div key={index} className={isLong ? 'sm:col-span-2' : ''}>
              <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">
                {row.label || 'Ohne Bezeichnung'}
                {row.kind === 'extra' && ' (nicht mehr in der Vorlage)'}
              </dt>
              <dd className={['mt-0.5 text-sm', isLong ? 'whitespace-pre-wrap leading-relaxed' : 'break-words'].join(' ')}>
                {text}
                {row.files.map((name) => (
                  <span key={name} className="flex items-center gap-1.5">
                    <Paperclip className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <span className="truncate">{name}</span>
                  </span>
                ))}
              </dd>
            </div>
          );
        })}
      </dl>

      {(unanswered > 0 || form.templateChanged) && (
        <p className="text-[11px] text-muted-foreground">
          {unanswered > 0 && `${unanswered} ${unanswered === 1 ? 'Feld' : 'Felder'} nicht ausgefüllt`}
          {unanswered > 0 && form.templateChanged && ' · '}
          {form.templateChanged && 'Die Vorlage wurde seitdem geändert'}
        </p>
      )}
    </div>
  );
}
