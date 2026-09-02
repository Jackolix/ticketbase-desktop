import { describe, expect, it } from 'vitest';
import { priorityLabel, priorityTone, statusTone } from './ticketStatus';

describe('statusTone', () => {
  it('recognises the German statuses the backend actually sends', () => {
    // These all fell through to a single default colour before, because the
    // old mappings switched on 'new' / 'in progress' / 'closed'.
    expect(statusTone('Neu')).toBe('info');
    expect(statusTone('In Bearbeitung')).toBe('active');
    expect(statusTone('Vor Ort')).toBe('active');
    expect(statusTone('Abgeschlossen')).toBe('success');
    expect(statusTone('Wieder geöffnet')).toBe('danger');
    expect(statusTone('Prüfen')).toBe('warning');
    expect(statusTone('Terminiert')).toBe('neutral');
  });

  it('gives closed and reopened visibly different tones', () => {
    expect(statusTone('Abgeschlossen')).not.toBe(statusTone('Wieder geöffnet'));
  });

  it('matches every "Warten auf Rückmeldung" variant by prefix', () => {
    expect(statusTone('Warten auf Rückmeldung vom Ticketbenutzer')).toBe('warning');
    expect(statusTone('Warten auf Rückmeldung (extern)')).toBe('warning');
  });

  it('is case and whitespace insensitive', () => {
    expect(statusTone('  ABGESCHLOSSEN  ')).toBe('success');
  });

  it('tolerates umlaut-free spellings', () => {
    expect(statusTone('Pruefen')).toBe('warning');
  });

  it('falls back to neutral for unknown or empty statuses', () => {
    expect(statusTone('Etwas Neues')).toBe('neutral');
    expect(statusTone('')).toBe('neutral');
  });
});

describe('priorityTone', () => {
  it('recognises the SCREAMING_CASE values the backend sends', () => {
    // The old check compared against 'High' and 'Medium', which never matched.
    expect(priorityTone('VERY_HIGH')).toBe('danger');
    expect(priorityTone('HIGH')).toBe('warning');
    expect(priorityTone('NORMAL')).toBe('neutral');
  });

  it('falls back to the numeric index when the string is unrecognised', () => {
    expect(priorityTone('', 9)).toBe('danger');
    expect(priorityTone('', 5)).toBe('warning');
    expect(priorityTone('', 1)).toBe('neutral');
  });

  it('prefers the explicit priority over the index', () => {
    expect(priorityTone('NORMAL', 9)).toBe('neutral');
  });
});

describe('priorityLabel', () => {
  it('renders the raw values readably', () => {
    expect(priorityLabel('VERY_HIGH')).toBe('Sehr hoch');
    expect(priorityLabel('HIGH')).toBe('Hoch');
    expect(priorityLabel('NORMAL')).toBe('Normal');
  });

  it('passes through anything it does not recognise', () => {
    expect(priorityLabel('Sonderfall')).toBe('Sonderfall');
  });
});
