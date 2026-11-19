import { describe, expect, it } from 'vitest';
import {
  activeRules,
  answersToSubmit,
  parseFormSchema,
  validateAnswers,
  visibleKeys,
  type FormSchema,
} from './formSchema';
// Copied from the backend (tests/Fixtures/form-visibility-cases.json), which
// runs the same cases against its PHP and browser evaluators.
import fixture from './__fixtures__/form-visibility-cases.json';

const schema = parseFormSchema(fixture.schema) as FormSchema;

describe('visibility, against the backend shared cases', () => {
  it('keeps exactly the rules the server keeps', () => {
    const rules = activeRules(schema);
    const config: Record<string, unknown> = {};
    for (const field of schema.fields) {
      const rule = rules.get(field.key) ?? null;
      if (field.parent !== null || rule !== null) config[field.key] = { parent: field.parent, rule };
    }
    // The server always writes `option`, null for is_set / is_not_set.
    expect(JSON.parse(JSON.stringify(config))).toEqual(fixture.config.elements);
  });

  for (const testCase of fixture.cases) {
    it(testCase.name, () => {
      const visible = visibleKeys(schema, testCase.answers as Record<string, unknown>);
      const hidden = Object.keys(visible).filter((key) => !visible[key]).sort();
      expect(hidden).toEqual(testCase.hidden);
    });
  }
});

describe('parseFormSchema', () => {
  it('drops unknown types and duplicate keys, and keeps sections followed by their fields', () => {
    const parsed = parseFormSchema({
      version: 2,
      fields: [
        { key: 'f_a', type: 'text', label: 'A', parent: 's_1' },
        { key: 's_1', type: 'section', label: 'Abschnitt' },
        { key: 'f_b', type: 'text', label: 'B' },
        { key: 'f_b', type: 'text', label: 'Doppelt' },
        { key: 'f_c', type: 'rating', label: 'Unbekannt' },
        { key: 'f_d', type: 'text', label: 'Waise', parent: 's_missing' },
      ],
    });
    expect(parsed?.fields.map((f) => f.key)).toEqual(['s_1', 'f_a', 'f_b', 'f_d']);
    expect(parsed?.fields.find((f) => f.key === 'f_d')?.parent).toBeNull();
  });

  it('returns null for something that is not a schema', () => {
    expect(parseFormSchema(null)).toBeNull();
    expect(parseFormSchema({ version: 2 })).toBeNull();
  });
});

describe('validateAnswers and answersToSubmit', () => {
  it('requires visible required fields only', () => {
    // GmbH section hidden: its required Handelsregisternummer must not block.
    expect(validateAnswers(schema, { f_form: 'o_ez' })).toEqual({});
    expect(validateAnswers(schema, { f_form: 'o_gmbh' })).toEqual({ f_hrb: 'Pflichtfeld' });
    expect(validateAnswers(schema, { f_form: 'o_gmbh', f_hrb: 'HRB 1' })).toEqual({});
  });

  it('sends visible, non-empty answers only, trimmed', () => {
    expect(
      answersToSubmit(schema, { f_form: 'o_ez', f_hrb: 'HRB 1', f_devices: [], f_not_ez: '  x ' }),
    ).toEqual({ f_form: 'o_ez' });
    expect(answersToSubmit(schema, { f_form: 'o_gmbh', f_hrb: ' HRB 1 ' })).toEqual({
      f_form: 'o_gmbh',
      f_hrb: 'HRB 1',
    });
  });

  it('checks file type and date format', () => {
    const files = parseFormSchema({
      version: 2,
      fields: [
        { key: 'f_file', type: 'file', label: 'Datei' },
        { key: 'f_date', type: 'date', label: 'Datum' },
      ],
    }) as FormSchema;
    const errors = validateAnswers(files, {
      f_file: new File(['x'], 'setup.exe'),
      f_date: '19.11.2026',
    });
    expect(Object.keys(errors).sort()).toEqual(['f_date', 'f_file']);
    expect(
      validateAnswers(files, { f_file: new File(['x'], 'foto.PNG'), f_date: '2026-11-19' }),
    ).toEqual({});
  });
});
