import { useMemo } from 'react';
import { Paperclip, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import {
  activeRules,
  FILE_EXTENSIONS,
  FILE_TYPES_LABEL,
  visibleKeys,
  type FormAnswer,
  type FormAnswers,
  type FormField,
  type FormSchema,
} from '@/lib/formSchema';

interface TemplateFormFieldsProps {
  schema: FormSchema;
  answers: FormAnswers;
  onChange: (key: string, value: FormAnswer) => void;
  /** Messages by field key. */
  errors: Record<string, string>;
  disabled?: boolean;
}

/** Radix Select cannot hold an empty value, so "no choice" needs a stand-in. */
const NONE = '__none__';

/**
 * The fields of a ticket template's form.
 *
 * Fields hidden by the template's rules are not rendered; their values stay
 * in `answers` so a toggled-back choice keeps what was typed, but they are
 * left out when the ticket is sent (answersToSubmit), as the server ignores
 * them anyway.
 */
export function TemplateFormFields({ schema, answers, onChange, errors, disabled }: TemplateFormFieldsProps) {
  const rules = useMemo(() => activeRules(schema), [schema]);
  const visible = visibleKeys(schema, answers, rules);
  const shown = schema.fields.filter((field) => visible[field.key] !== false);

  if (shown.length === 0) return null;

  return (
    <div className="grid gap-x-4 gap-y-4 sm:grid-cols-2">
      {shown.map((field) => (
        <div
          key={field.key}
          className={cn(
            field.width === 'full' || field.type === 'section' || field.type === 'paragraph'
              ? 'sm:col-span-2'
              : 'sm:col-span-1',
            field.parent !== null && 'border-l-2 border-muted pl-3',
          )}
        >
          <FieldControl
            field={field}
            value={answers[field.key] ?? null}
            onChange={(value) => onChange(field.key, value)}
            error={errors[field.key]}
            disabled={disabled}
          />
        </div>
      ))}
    </div>
  );
}

interface FieldControlProps {
  field: FormField;
  value: FormAnswer;
  onChange: (value: FormAnswer) => void;
  error?: string;
  disabled?: boolean;
}

function FieldControl({ field, value, onChange, error, disabled }: FieldControlProps) {
  const id = `tf-${field.key}`;

  if (field.type === 'section') {
    return (
      <div className="border-b pb-1 pt-2">
        <h3 className="text-sm font-semibold">{field.label}</h3>
        {field.help && <p className="text-xs text-muted-foreground">{field.help}</p>}
      </div>
    );
  }

  if (field.type === 'paragraph') {
    return <p className="whitespace-pre-wrap text-sm text-muted-foreground">{field.label}</p>;
  }

  const label = (
    <Label htmlFor={id} className="text-sm">
      {field.label || 'Ohne Bezeichnung'}
      {field.required && ' *'}
    </Label>
  );

  return (
    <div className="space-y-1.5" role={field.type === 'radio' || field.type === 'checkbox' ? 'group' : undefined}>
      {label}
      {renderInput()}
      {field.help && <p className="text-xs text-muted-foreground">{field.help}</p>}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );

  function renderInput() {
    const text = typeof value === 'string' ? value : '';
    const invalid = error ? 'border-destructive' : undefined;

    switch (field.type) {
      case 'text':
        return (
          <Input id={id} value={text} placeholder={field.placeholder} disabled={disabled}
            maxLength={2000} className={invalid} onChange={(e) => onChange(e.target.value)} />
        );
      case 'textarea':
        return (
          <Textarea id={id} value={text} placeholder={field.placeholder} disabled={disabled}
            maxLength={20000} rows={3} className={invalid} onChange={(e) => onChange(e.target.value)} />
        );
      case 'date':
        return (
          <Input id={id} type="date" value={text} disabled={disabled} className={cn('w-[180px]', invalid)}
            onChange={(e) => onChange(e.target.value || null)} />
        );
      case 'select':
        return (
          <Select value={text || NONE} disabled={disabled}
            onValueChange={(next) => onChange(next === NONE ? null : next)}>
            <SelectTrigger id={id} className={cn('w-full', invalid)}>
              <SelectValue placeholder={field.placeholder || 'Bitte wählen'} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE} className="text-muted-foreground">
                {field.placeholder || 'Bitte wählen'}
              </SelectItem>
              {field.options.map((option) => (
                <SelectItem key={option.key} value={option.key}>{option.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        );
      case 'radio':
        return (
          <div className="flex flex-wrap gap-x-4 gap-y-1.5">
            {field.options.map((option) => (
              <label key={option.key} className="flex items-center gap-2 text-sm">
                <input type="radio" name={id} value={option.key} checked={text === option.key}
                  disabled={disabled} className="h-4 w-4 accent-primary"
                  onChange={() => onChange(option.key)} />
                {option.label}
              </label>
            ))}
            {text && !field.required && (
              <button type="button" disabled={disabled} onClick={() => onChange(null)}
                className="text-xs text-muted-foreground underline-offset-2 hover:underline">
                Auswahl aufheben
              </button>
            )}
          </div>
        );
      case 'checkbox': {
        const selected = Array.isArray(value) ? value : [];
        return (
          <div className="flex flex-wrap gap-x-4 gap-y-1.5">
            {field.options.map((option) => (
              <label key={option.key} className="flex items-center gap-2 text-sm">
                <input type="checkbox" value={option.key} checked={selected.includes(option.key)}
                  disabled={disabled} className="h-4 w-4 accent-primary"
                  onChange={(e) =>
                    onChange(
                      e.target.checked
                        ? field.options.map((o) => o.key).filter((k) => k === option.key || selected.includes(k))
                        : selected.filter((k) => k !== option.key),
                    )
                  } />
                {option.label}
              </label>
            ))}
          </div>
        );
      }
      case 'file': {
        const file = value instanceof File ? value : null;
        return file ? (
          <div className="flex items-center gap-2 rounded-md border bg-muted/50 p-2 text-sm">
            <Paperclip className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="flex-1 truncate">{file.name}</span>
            <span className="text-xs text-muted-foreground">{(file.size / 1024).toFixed(1)} KB</span>
            <button type="button" disabled={disabled} onClick={() => onChange(null)}
              aria-label="Datei entfernen" className="text-muted-foreground hover:text-destructive">
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <>
            <Input id={id} type="file" disabled={disabled} className={cn('cursor-pointer', invalid)}
              accept={FILE_EXTENSIONS.map((ext) => `.${ext}`).join(',')}
              onChange={(e) => onChange(e.target.files?.[0] ?? null)} />
            <p className="text-[11px] text-muted-foreground">{FILE_TYPES_LABEL}, höchstens 10 MB</p>
          </>
        );
      }
      default:
        return null;
    }
  }
}
