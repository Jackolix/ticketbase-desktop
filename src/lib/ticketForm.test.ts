import { describe, expect, it } from 'vitest';
import { readTicketForm, visibleRows } from './ticketForm';

const raw = {
  source: 'v2',
  template_changed: false,
  rows: [
    { kind: 'section', label: 'Gerät', type: 'section', values: [], files: [], answered: false },
    { kind: 'field', label: 'Was ist betroffen?', type: 'checkbox', values: ['Bildschirm', 'Tastatur'], files: [], answered: true },
    { kind: 'field', label: 'Seriennummer', type: 'text', values: [], files: [], answered: false },
    { kind: 'field', label: 'Foto', type: 'file', values: [], files: ['bild.png'], answered: true },
    { kind: 'section', label: 'Leer', type: 'section', values: [], files: [], answered: false },
    { kind: 'field', label: 'Nichts', type: 'text', values: [], files: [], answered: false },
  ],
};

describe('readTicketForm', () => {
  it('reads the server block', () => {
    const form = readTicketForm(raw);
    expect(form?.source).toBe('v2');
    expect(form?.rows).toHaveLength(6);
    expect(form?.rows[3].files).toEqual(['bild.png']);
  });

  it('returns null when there is no form to show', () => {
    expect(readTicketForm(null)).toBeNull();
    expect(readTicketForm({ source: 'none', rows: [] })).toBeNull();
    expect(readTicketForm({ source: 'v2', rows: [{ kind: 'section', label: 'Nur Abschnitt' }] })).toBeNull();
  });
});

describe('visibleRows', () => {
  it('keeps answered fields and only the sections that still head one', () => {
    const { rows, unanswered } = visibleRows(readTicketForm(raw)!);
    expect(rows.map((row) => row.label)).toEqual(['Gerät', 'Was ist betroffen?', 'Foto']);
    expect(unanswered).toBe(2);
  });
});
