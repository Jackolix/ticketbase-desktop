/**
 * Ticket template forms ("form schema v2").
 *
 * Since the 2026-11 backend release, getTemplates returns a `form_schema` per
 * template and createTicket accepts `form_answers` against it. The server
 * validates and stores the answers; this module mirrors its rules closely
 * enough that the form can show the right fields and catch mistakes before
 * the round trip. The server's result is still the one that counts.
 *
 * Sources in the backend (read-only, see INTEGRATIONS.md §4):
 * - App\Libs\TemplateReader\FormSchema — field shapes, validation, normalising
 * - App\Libs\TemplateReader\Visibility\FormVisibility — which fields show
 * - resources/js/form-visibility.js — the browser port this one follows
 */

export type FormFieldType =
  | 'section'
  | 'paragraph'
  | 'text'
  | 'textarea'
  | 'select'
  | 'radio'
  | 'checkbox'
  | 'date'
  | 'file';

export interface FormOption {
  key: string;
  label: string;
}

export interface VisibilityCondition {
  field: string;
  operator: string;
  option: string | null;
}

export interface VisibilityGroup {
  match: 'all' | 'any';
  conditions: Array<VisibilityCondition | VisibilityGroup>;
}

export interface FormField {
  key: string;
  type: FormFieldType;
  label: string;
  help: string;
  placeholder: string;
  required: boolean;
  width: 'full' | 'half';
  options: FormOption[];
  /** Key of the section this field belongs to. */
  parent: string | null;
  visibility: VisibilityGroup | null;
}

export interface FormSchema {
  version: number;
  fields: FormField[];
}

/** An answer as the server takes it: text, option key(s), or a file. */
export type FormAnswer = string | string[] | File | null;
export type FormAnswers = Record<string, FormAnswer>;

export const LAYOUT_TYPES: FormFieldType[] = ['section', 'paragraph'];
export const INPUT_TYPES: FormFieldType[] = ['text', 'textarea', 'select', 'radio', 'checkbox', 'date', 'file'];
const OPTION_TYPES: FormFieldType[] = ['select', 'radio', 'checkbox'];

/** Same as FormSchema::FILE_MIMES on the server. */
export const FILE_EXTENSIONS = [
  'csv', 'txt', 'pdf', 'jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'heic', 'zip', 'doc', 'docx', 'xls', 'xlsx',
];
export const FILE_TYPES_LABEL = 'PDF, Bilder (JPG, PNG, GIF, BMP, WEBP, HEIC), Word, Excel, CSV, TXT und ZIP';
/** FormSchema::FILE_MAX_KB; the server may enforce a lower PHP limit. */
export const FILE_MAX_BYTES = 10240 * 1024;

const TEXT_MAX: Partial<Record<FormFieldType, number>> = { text: 2000, textarea: 20000 };

/**
 * Reads a schema defensively, the way FormSchema::fromArray does: unknown
 * types and duplicate keys are dropped, sections stay top-level, and each
 * section is followed directly by its fields.
 */
export function parseFormSchema(raw: unknown): FormSchema | null {
  if (!raw || typeof raw !== 'object') return null;
  const data = raw as { version?: unknown; fields?: unknown };
  if (!Array.isArray(data.fields)) return null;

  const fields: FormField[] = [];
  const used = new Set<string>();

  for (const entry of data.fields) {
    if (!entry || typeof entry !== 'object') continue;
    const f = entry as Record<string, unknown>;
    const type = String(f.type ?? '') as FormFieldType;
    const key = String(f.key ?? '');
    if (![...LAYOUT_TYPES, ...INPUT_TYPES].includes(type) || key === '' || used.has(key)) continue;
    used.add(key);

    const options: FormOption[] = OPTION_TYPES.includes(type) && Array.isArray(f.options)
      ? (f.options as Array<Record<string, unknown>>)
          .filter((o) => o && typeof o === 'object' && String(o.key ?? '') !== '')
          .map((o) => ({ key: String(o.key), label: String(o.label ?? '') }))
      : [];

    fields.push({
      key,
      type,
      label: String(f.label ?? ''),
      help: String(f.help ?? ''),
      placeholder: String(f.placeholder ?? ''),
      required: INPUT_TYPES.includes(type) && Boolean(f.required),
      width: f.width === 'half' ? 'half' : 'full',
      options,
      parent: typeof f.parent === 'string' && f.parent !== '' ? f.parent : null,
      visibility: normalizeGroup(f.visibility),
    });
  }

  return { version: Number(data.version ?? 2), fields: grouped(fields) };
}

function grouped(fields: FormField[]): FormField[] {
  const sections = new Set(fields.filter((f) => f.type === 'section').map((f) => f.key));
  const children = new Map<string, FormField[]>();
  const top: FormField[] = [];

  for (const field of fields) {
    if (field.type === 'section' || field.parent === null || !sections.has(field.parent)) {
      top.push({ ...field, parent: null });
    } else {
      children.set(field.parent, [...(children.get(field.parent) ?? []), field]);
    }
  }

  return top.flatMap((field) => [field, ...(children.get(field.key) ?? [])]);
}

function normalizeGroup(raw: unknown): VisibilityGroup | null {
  if (!raw || typeof raw !== 'object' || !Array.isArray((raw as VisibilityGroup).conditions)) return null;
  const group = raw as { match?: unknown; conditions: unknown[] };
  const conditions = group.conditions.flatMap((entry): Array<VisibilityCondition | VisibilityGroup> => {
    if (!entry || typeof entry !== 'object') return [];
    if (Array.isArray((entry as VisibilityGroup).conditions)) {
      const nested = normalizeGroup(entry);
      return nested ? [nested] : [];
    }
    const c = entry as Record<string, unknown>;
    return [{
      field: String(c.field ?? ''),
      operator: String(c.operator ?? ''),
      option: c.option === null || c.option === undefined ? null : String(c.option),
    }];
  });
  if (conditions.length === 0) return null;
  return { match: group.match === 'any' ? 'any' : 'all', conditions };
}

export function isInputField(field: FormField): boolean {
  return INPUT_TYPES.includes(field.type);
}

export function inputFields(schema: FormSchema): FormField[] {
  return schema.fields.filter(isInputField);
}

// ---------------------------------------------------------------------------
// Visibility
// ---------------------------------------------------------------------------

const OPERATORS_BY_TYPE: Partial<Record<FormFieldType, string[]>> = {
  select: ['equals', 'not_equals', 'is_set', 'is_not_set'],
  radio: ['equals', 'not_equals', 'is_set', 'is_not_set'],
  checkbox: ['contains', 'not_contains', 'is_set', 'is_not_set'],
};

const OPERATORS: Record<string, (selected: string[], option: string | null) => boolean> = {
  equals: (selected, option) => option !== null && selected.includes(option),
  contains: (selected, option) => option !== null && selected.includes(option),
  not_equals: (selected, option) => option === null || !selected.includes(option),
  not_contains: (selected, option) => option === null || !selected.includes(option),
  is_set: (selected) => selected.length > 0,
  is_not_set: (selected) => selected.length === 0,
};

function isGroup(entry: VisibilityCondition | VisibilityGroup): entry is VisibilityGroup {
  return Array.isArray((entry as VisibilityGroup).conditions);
}

function conditionsOf(group: VisibilityGroup | null): VisibilityCondition[] {
  if (!group) return [];
  return group.conditions.flatMap((entry) => (isGroup(entry) ? conditionsOf(entry) : [entry]));
}

function filterGroup(
  group: VisibilityGroup | null,
  keep: (condition: VisibilityCondition) => boolean,
): VisibilityGroup | null {
  if (!group) return null;
  const conditions = group.conditions.flatMap((entry): Array<VisibilityCondition | VisibilityGroup> => {
    if (isGroup(entry)) {
      const nested = filterGroup(entry, keep);
      return nested ? [nested] : [];
    }
    return keep(entry) ? [entry] : [];
  });
  return conditions.length ? { match: group.match, conditions } : null;
}

/**
 * The rules the server actually applies: conditions on a deleted or
 * unsuitable trigger, with a wrong operator or a deleted option, or closing a
 * cycle are left out (FormVisibility::structuralProblem / markCycles). A
 * group with no valid conditions left restricts nothing.
 */
export function activeRules(schema: FormSchema): Map<string, VisibilityGroup | null> {
  const elements = new Map(schema.fields.map((f) => [f.key, f]));

  const structurallyValid = (key: string) => (c: VisibilityCondition): boolean => {
    const trigger = elements.get(c.field);
    if (!trigger || c.field === key) return false;
    const operators = OPERATORS_BY_TYPE[trigger.type];
    if (!operators || !operators.includes(c.operator)) return false;
    if (c.operator === 'is_set' || c.operator === 'is_not_set') return true;
    return c.option !== null && trigger.options.some((o) => o.key === c.option);
  };

  const valid = new Map(schema.fields.map((f) => [f.key, filterGroup(f.visibility, structurallyValid(f.key))]));

  // "depends on" edges: an element depends on its section and its triggers.
  const edges = new Map<string, string[]>();
  for (const field of schema.fields) {
    const deps = [field.parent, ...conditionsOf(valid.get(field.key) ?? null).map((c) => c.field)]
      .filter((d): d is string => d !== null && elements.has(d));
    edges.set(field.key, [...new Set(deps)]);
  }

  const reaches = (from: string, to: string): boolean => {
    const seen = new Set([from]);
    const queue = [from];
    while (queue.length) {
      const current = queue.shift()!;
      if (current === to) return true;
      for (const next of edges.get(current) ?? []) {
        if (!seen.has(next)) {
          seen.add(next);
          queue.push(next);
        }
      }
    }
    return false;
  };

  // A condition closes a cycle when element and trigger can reach each other.
  const rules = new Map<string, VisibilityGroup | null>();
  for (const field of schema.fields) {
    rules.set(
      field.key,
      filterGroup(valid.get(field.key) ?? null, (c) => !(reaches(field.key, c.field) && reaches(c.field, field.key))),
    );
  }
  return rules;
}

/** Selected option keys of a field, as the server reads them. */
function selectedOptions(field: FormField, value: unknown): string[] {
  const values = Array.isArray(value) ? value : value === null || value === undefined ? [] : [value];
  const strings = values.filter((v) => typeof v === 'string' || typeof v === 'number').map(String);
  return field.options.map((o) => o.key).filter((key) => strings.includes(key));
}

function groupMatches(group: VisibilityGroup | null, selectedOf: (field: string) => string[]): boolean {
  if (!group) return true;
  const any = group.match === 'any';
  for (const entry of group.conditions) {
    const met = isGroup(entry)
      ? groupMatches(entry, selectedOf)
      : (OPERATORS[entry.operator] ?? (() => true))(selectedOf(entry.field), entry.option);
    if (met === any) return any;
  }
  return !any;
}

/**
 * Visibility of every element for the given answers, as
 * FormVisibility::visibleKeys computes it: an element shows when its own rule
 * holds and its section shows; a hidden trigger counts as nothing selected.
 */
export function visibleKeys(
  schema: FormSchema,
  answers: Record<string, unknown>,
  rules: Map<string, VisibilityGroup | null> = activeRules(schema),
): Record<string, boolean> {
  const elements = new Map(schema.fields.map((f) => [f.key, f]));
  const visible: Record<string, boolean> = {};
  const pending = new Set<string>();

  const isVisible = (key: string): boolean => {
    if (key in visible) return visible[key];
    const element = elements.get(key);
    if (!element || pending.has(key)) return true;
    pending.add(key);

    const result =
      (element.parent === null || isVisible(element.parent)) &&
      groupMatches(rules.get(key) ?? null, (trigger) => {
        const triggerField = elements.get(trigger);
        return triggerField && isVisible(trigger) ? selectedOptions(triggerField, answers[trigger]) : [];
      });

    pending.delete(key);
    visible[key] = result;
    return result;
  };

  for (const key of elements.keys()) isVisible(key);
  return visible;
}

// ---------------------------------------------------------------------------
// Validation and submission
// ---------------------------------------------------------------------------

function isBlank(value: FormAnswer | undefined): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === 'string') return value.trim() === '';
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot === -1 ? '' : name.slice(dot + 1).toLowerCase();
}

/**
 * Field errors the server would report, for visible fields only — a hidden
 * required field never blocks (FormSchema::rules with answers).
 */
export function validateAnswers(schema: FormSchema, answers: FormAnswers): Record<string, string> {
  const visible = visibleKeys(schema, answers);
  const errors: Record<string, string> = {};

  for (const field of inputFields(schema)) {
    if (visible[field.key] === false) continue;
    const value = answers[field.key];

    if (isBlank(value)) {
      if (field.required) {
        errors[field.key] = field.type === 'checkbox' ? 'Bitte mindestens eine Option wählen.' : 'Pflichtfeld';
      }
      continue;
    }

    const max = TEXT_MAX[field.type];
    if (max !== undefined && typeof value === 'string' && value.trim().length > max) {
      errors[field.key] = `Höchstens ${max} Zeichen.`;
    }
    if (field.type === 'date' && typeof value === 'string' && !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      errors[field.key] = 'Bitte ein gültiges Datum eingeben.';
    }
    if (field.type === 'file' && value instanceof File) {
      if (!FILE_EXTENSIONS.includes(extensionOf(value.name))) {
        errors[field.key] = `Dateityp nicht erlaubt. Erlaubt: ${FILE_TYPES_LABEL}.`;
      } else if (value.size > FILE_MAX_BYTES) {
        errors[field.key] = 'Die Datei ist größer als 10 MB.';
      }
    }
  }

  return errors;
}

/**
 * The answers to send: visible input fields only, trimmed, empty ones left
 * out. The server stores hidden fields as null and ignores files in them, so
 * sending them would only be noise.
 */
export function answersToSubmit(schema: FormSchema, answers: FormAnswers): FormAnswers {
  const visible = visibleKeys(schema, answers);
  const result: FormAnswers = {};

  for (const field of inputFields(schema)) {
    if (visible[field.key] === false) continue;
    const value = answers[field.key];
    if (isBlank(value)) continue;
    result[field.key] = typeof value === 'string' ? value.trim() : value ?? null;
  }

  return result;
}

export function hasFiles(answers: FormAnswers): boolean {
  return Object.values(answers).some((value) => value instanceof File);
}
