import { describe, expect, it } from 'vitest';
import { parseReleaseNotes } from './releaseNotes';

describe('parseReleaseNotes', () => {
  it('reads headings and bullets out of a GitHub release body', () => {
    const blocks = parseReleaseNotes(
      ['## Neu', '', '- Archiv für abgeschlossene Tickets', '- Kundenvorschläge'].join('\n'),
    );

    expect(blocks).toEqual([
      { kind: 'heading', text: 'Neu' },
      { kind: 'item', text: 'Archiv für abgeschlossene Tickets' },
      { kind: 'item', text: 'Kundenvorschläge' },
    ]);
  });

  it('strips inline markup down to the words', () => {
    // Rendered raw, this is a line full of asterisks and brackets.
    const blocks = parseReleaseNotes(
      '- **Timer** bleibt erhalten, siehe [den Commit](https://example.test/x) und `sync.ts`',
    );

    expect(blocks[0].text).toBe('Timer bleibt erhalten, siehe den Commit und sync.ts');
  });

  it('accepts the bullet characters people actually use', () => {
    const blocks = parseReleaseNotes(['- eins', '* zwei', '+ drei'].join('\n'));
    expect(blocks.map((b) => b.kind)).toEqual(['item', 'item', 'item']);
    expect(blocks.map((b) => b.text)).toEqual(['eins', 'zwei', 'drei']);
  });

  it('drops the lines GitHub writes for itself', () => {
    const blocks = parseReleaseNotes(
      [
        '- Echte Änderung',
        '',
        '---',
        '**Full Changelog**: https://github.com/x/y/compare/v1.0.0...v1.1.0',
      ].join('\n'),
    );

    expect(blocks).toEqual([{ kind: 'item', text: 'Echte Änderung' }]);
  });

  it('does not end on a heading that introduces nothing', () => {
    const blocks = parseReleaseNotes(['- eins', '', '## Sonstiges'].join('\n'));
    expect(blocks).toEqual([{ kind: 'item', text: 'eins' }]);
  });

  it('handles CRLF, which is what a Windows-built release note carries', () => {
    expect(parseReleaseNotes('- eins\r\n- zwei')).toHaveLength(2);
  });

  it('caps the list, since this renders in a corner of the screen', () => {
    const many = Array.from({ length: 40 }, (_, i) => `- Punkt ${i}`).join('\n');
    expect(parseReleaseNotes(many, 5)).toHaveLength(5);
  });

  it('returns nothing for an empty or missing body', () => {
    expect(parseReleaseNotes('')).toEqual([]);
    expect(parseReleaseNotes(null)).toEqual([]);
    expect(parseReleaseNotes(undefined)).toEqual([]);
    expect(parseReleaseNotes('   \n\n  ')).toEqual([]);
  });

  it('keeps prose that is not a list', () => {
    const blocks = parseReleaseNotes('Dieses Update behebt einen Fehler in der Zeiterfassung.');
    expect(blocks).toEqual([
      { kind: 'text', text: 'Dieses Update behebt einen Fehler in der Zeiterfassung.' },
    ]);
  });
});
