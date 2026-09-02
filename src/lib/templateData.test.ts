import { describe, expect, it } from 'vitest';
import { parseTemplateData, summariseTemplate, ticketDescriptionText } from './templateData';

// Taken from real rows in the tickets seeder.
const VIRUS_FORM = JSON.stringify({
  'Wo befindet sich der Virus': ['Lokaler PC / Notebook'],
  'Wie viele sind betroffen?': 'Ein Arbeitsplatz',
  'Bitte geben Sie weitere Informationen ein':
    'Es gibt keinen Virus, aber auf meinem Laptop ist die Lizenz für McAfee nicht mehr aktiv.\r\n',
});

const ONBOARDING_FORM = JSON.stringify({
  Titel: '',
  Anrede: 'Herr',
  Vorname: 'Ayyub',
  Nachname: 'Abodji',
  'Eintritts Datum': '2023-10-01',
  'Windows Anmeldename': 'a.abodji@example.test',
});

describe('parseTemplateData', () => {
  it('keeps the form labels as they are, since they are already readable', () => {
    const fields = parseTemplateData(VIRUS_FORM);
    expect(fields.map((f) => f.label)).toEqual([
      'Wo befindet sich der Virus',
      'Wie viele sind betroffen?',
      'Bitte geben Sie weitere Informationen ein',
    ]);
  });

  it('unwraps the single-element arrays that choice fields produce', () => {
    const [choice] = parseTemplateData(VIRUS_FORM);
    expect(choice.value).toBe('Lokaler PC / Notebook');
  });

  it('joins multi-select values', () => {
    const fields = parseTemplateData(JSON.stringify({ Betroffen: ['PC', 'Drucker'] }));
    expect(fields[0].value).toBe('PC, Drucker');
  });

  it('normalises CRLF and trims trailing whitespace', () => {
    const fields = parseTemplateData(VIRUS_FORM);
    const notes = fields[2].value;
    expect(notes).not.toContain('\r');
    expect(notes.endsWith('aktiv.')).toBe(true);
  });

  it('flags empty fields rather than dropping them', () => {
    // Which fields the requester left blank is itself information.
    const fields = parseTemplateData(ONBOARDING_FORM);
    const titel = fields.find((f) => f.label === 'Titel')!;
    expect(titel.isEmpty).toBe(true);
    expect(fields).toHaveLength(6);
  });

  it('flags long and multi-line values so they can be laid out differently', () => {
    const fields = parseTemplateData(VIRUS_FORM);
    expect(fields[1].isLong).toBe(false);
    expect(fields[2].isLong).toBe(true);
  });

  it('renders booleans in German', () => {
    const fields = parseTemplateData(JSON.stringify({ Dringend: true, Extern: false }));
    expect(fields.map((f) => f.value)).toEqual(['Ja', 'Nein']);
  });

  it('returns nothing for the shapes that mean "no template"', () => {
    expect(parseTemplateData('[]')).toEqual([]);
    expect(parseTemplateData('')).toEqual([]);
    expect(parseTemplateData(null)).toEqual([]);
    expect(parseTemplateData(undefined)).toEqual([]);
  });

  it('never throws on malformed JSON', () => {
    expect(parseTemplateData('{not json')).toEqual([]);
    expect(parseTemplateData('"a string"')).toEqual([]);
    expect(parseTemplateData('42')).toEqual([]);
  });
});

describe('summariseTemplate', () => {
  it('shows the first filled values and counts the rest', () => {
    // The old behaviour joined every value with commas into a run-on.
    expect(summariseTemplate(ONBOARDING_FORM, 2)).toBe('Herr · Ayyub · +3');
  });

  it('skips empty fields', () => {
    expect(summariseTemplate(ONBOARDING_FORM, 1).startsWith('Herr')).toBe(true);
  });

  it('uses only the first line of a multi-line value', () => {
    const raw = JSON.stringify({ Notiz: 'Zeile eins\nZeile zwei' });
    expect(summariseTemplate(raw)).toBe('Zeile eins');
  });

  it('returns an empty string when there is nothing to show', () => {
    expect(summariseTemplate('[]')).toBe('');
    expect(summariseTemplate(JSON.stringify({ a: '', b: '' }))).toBe('');
  });
});

describe('ticketDescriptionText', () => {
  it('prefers a real description', () => {
    expect(ticketDescriptionText('Server down', VIRUS_FORM)).toBe('Server down');
  });

  it('falls back to a template summary when the description is blank', () => {
    expect(ticketDescriptionText('   ', VIRUS_FORM)).toContain('Lokaler PC');
  });

  it('falls back to a readable message when there is neither', () => {
    expect(ticketDescriptionText('', '[]')).toBe('Keine Beschreibung vorhanden');
  });
});
