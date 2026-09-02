import { parseTemplateData } from '@/lib/templateData';

interface TemplateFieldsProps {
  templateData: string | null | undefined;
  /** Show fields the requester left blank, dimmed. Defaults to hiding them. */
  showEmpty?: boolean;
  /** Values already shown elsewhere, e.g. the ticket description. */
  omitValues?: Array<string | null | undefined>;
}

/**
 * Renders a ticket's dynamic template as a labelled field list.
 *
 * These are structured forms — an onboarding request carries a dozen labelled
 * fields — and they were being flattened into one "Label: value" text blob.
 * Laying them out as label/value pairs, with long answers given their own
 * block, makes a template ticket scannable instead of a wall of text.
 */
export function TemplateFields({
  templateData,
  showEmpty = false,
  omitValues,
}: TemplateFieldsProps) {
  const all = parseTemplateData(templateData, { omitValues });
  const fields = showEmpty ? all : all.filter((f) => !f.isEmpty);

  if (fields.length === 0) return null;

  const emptyCount = all.length - all.filter((f) => !f.isEmpty).length;

  return (
    <div className="space-y-3">
      <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
        {fields.map((field) => (
          <div
            key={field.label}
            // Long or multi-line answers take the full width; short ones pair up.
            className={field.isLong ? 'sm:col-span-2' : ''}
          >
            <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">
              {field.label}
            </dt>
            <dd
              className={[
                'mt-0.5 text-sm',
                field.isLong ? 'whitespace-pre-wrap leading-relaxed' : 'break-words',
                field.isEmpty ? 'italic text-muted-foreground' : '',
              ].join(' ')}
            >
              {field.isEmpty ? 'nicht ausgefüllt' : field.value}
            </dd>
          </div>
        ))}
      </dl>

      {!showEmpty && emptyCount > 0 && (
        <p className="text-[11px] text-muted-foreground">
          {emptyCount} {emptyCount === 1 ? 'Feld' : 'Felder'} nicht ausgefüllt
        </p>
      )}
    </div>
  );
}
