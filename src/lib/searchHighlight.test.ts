import { describe, expect, it } from 'vitest';
import {
  containsAll,
  excerpt,
  fold,
  highlight,
  searchWords,
  transliterated,
} from './searchHighlight';

const marked = (text: string, words: string[]) =>
  highlight(text, words)
    .filter((part) => part.match)
    .map((part) => part.text);

describe('fold', () => {
  it('lowercases and strips accents like the store does', () => {
    expect(fold('MÜLLER Straße Café')).toBe('muller strasse cafe');
  });
});

describe('transliterated', () => {
  it('reads ue after a consonant as ü, and leaves real ue alone', () => {
    expect(transliterated('mueller')).toBe('muller');
    expect(transliterated('neue')).toBeNull();
  });
});

describe('searchWords', () => {
  it('splits on spaces and keeps quoted runs together', () => {
    expect(searchWords('drucker "rechts offline" eg')).toEqual(['drucker', 'rechts offline', 'eg']);
    expect(searchWords(undefined)).toEqual([]);
  });
});

describe('highlight', () => {
  it('marks every word, case-insensitively', () => {
    expect(marked('Drucker EG rechts offline', ['offline', 'drucker'])).toEqual([
      'Drucker',
      'offline',
    ]);
  });

  it('marks the original characters when the match was folded', () => {
    expect(marked('Müller Logistik', ['muller'])).toEqual(['Müller']);
    expect(marked('Müller Logistik', ['mueller'])).toEqual(['Müller']);
    expect(marked('Hauptstraße 5', ['strasse'])).toEqual(['straße']);
  });

  it('returns the text untouched when nothing matches', () => {
    expect(highlight('abc', ['x'])).toEqual([{ text: 'abc', match: false }]);
    expect(highlight('abc', [])).toEqual([{ text: 'abc', match: false }]);
  });
});

describe('containsAll / excerpt', () => {
  it('requires every word', () => {
    expect(containsAll('Drucker offline', ['drucker', 'offline'])).toBe(true);
    expect(containsAll('Drucker offline', ['drucker', 'scanner'])).toBe(false);
  });

  it('cuts a window around the first match', () => {
    const text = `${'a '.repeat(60)}der Scanner im Keller ${'b '.repeat(60)}`;
    const piece = excerpt(text, ['scanner'], 10)!;
    expect(piece.startsWith('… ')).toBe(true);
    expect(piece.endsWith(' …')).toBe(true);
    expect(piece).toContain('Scanner');
    expect(excerpt('nothing here', ['scanner'])).toBeNull();
  });
});
