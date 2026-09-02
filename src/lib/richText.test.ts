import { describe, expect, it } from 'vitest';
import { normalizeTicketText, splitQuotedReply } from './richText';

describe('normalizeTicketText', () => {
  it('collapses the blank-line runs that pasted email leaves behind', () => {
    // Reproduces a real ticket: each paragraph separated by three blank lines,
    // which rendered as isolated sentences down the page.
    const pasted = [
      'Hallo ITM-Team,', '', '', '',
      'da Frau Navratil in Urlaub ist bitte um entsprechende Bearbeitung…', '', '', '',
      'Danke und viele Grüße', '', '', '',
      'Peter Guba',
    ].join('\n');

    expect(normalizeTicketText(pasted)).toBe(
      [
        'Hallo ITM-Team,',
        '',
        'da Frau Navratil in Urlaub ist bitte um entsprechende Bearbeitung…',
        '',
        'Danke und viele Grüße',
        '',
        'Peter Guba',
      ].join('\n'),
    );
  });

  it('keeps single blank lines, so paragraphs stay separated', () => {
    expect(normalizeTicketText('eins\n\nzwei')).toBe('eins\n\nzwei');
  });

  it('turns block markup into line breaks before stripping it', () => {
    // Without this, <p>a</p><p>b</p> collapses to "ab".
    expect(normalizeTicketText('<p>eins</p><p>zwei</p>')).toBe('eins\n\nzwei');
    expect(normalizeTicketText('eins<br>zwei')).toBe('eins\nzwei');
  });

  it('removes inline markup', () => {
    expect(normalizeTicketText('<b>fett</b> und <i>kursiv</i>')).toBe('fett und kursiv');
  });

  it('decodes the entities that survive strip_tags', () => {
    expect(normalizeTicketText('Gr&uuml;&szlig;e &amp; Dank')).toBe('Grüße & Dank');
    expect(normalizeTicketText('5 &lt; 10')).toBe('5 < 10');
  });

  it('decodes numeric entities, decimal and hex', () => {
    expect(normalizeTicketText('&#8364;100')).toBe('€100');
    expect(normalizeTicketText('&#x20AC;100')).toBe('€100');
  });

  it('leaves unknown entities alone rather than mangling them', () => {
    expect(normalizeTicketText('&unknownthing; bleibt')).toBe('&unknownthing; bleibt');
  });

  it('normalises CRLF, non-breaking spaces and trailing whitespace', () => {
    expect(normalizeTicketText('eins   \r\nzwei drei')).toBe('eins\nzwei drei');
  });

  it('trims leading and trailing blank lines', () => {
    expect(normalizeTicketText('\n\n\nInhalt\n\n\n')).toBe('Inhalt');
  });

  it('handles empty input', () => {
    expect(normalizeTicketText('')).toBe('');
    expect(normalizeTicketText(null)).toBe('');
    expect(normalizeTicketText(undefined)).toBe('');
  });
});

describe('splitQuotedReply', () => {
  it('separates a reply from the quoted thread below it', () => {
    const text = [
      'Kurze Rückmeldung: erledigt.',
      '',
      'Von: Peter Guba',
      'Gesendet: Montag, 1. September 2026',
      'Betreff: Sicherheitspaket',
      '',
      'Bitte um Bearbeitung.',
    ].join('\n');

    const { body, quoted } = splitQuotedReply(text);
    expect(body).toBe('Kurze Rückmeldung: erledigt.');
    expect(quoted.startsWith('Von: Peter Guba')).toBe(true);
  });

  it('recognises the Outlook separator and "wrote:" forms', () => {
    for (const marker of [
      '-----Ursprüngliche Nachricht-----',
      'Am 1.9.2026 schrieb Peter Guba:',
      'On 1 Sep 2026 Peter Guba wrote:',
    ]) {
      const { quoted } = splitQuotedReply(`Antwort\n\n${marker}\nalter Text`);
      expect(quoted.startsWith(marker)).toBe(true);
    }
  });

  it('keeps a forwarded message whole when the marker is at the very top', () => {
    // Nothing precedes it, so there is no reply to separate out.
    const text = 'Von: Peter Guba\nBetreff: Weiterleitung\n\nInhalt';
    const { body, quoted } = splitQuotedReply(text);
    expect(body).toBe(text);
    expect(quoted).toBe('');
  });

  it('returns the text unchanged when there is no quote', () => {
    const { body, quoted } = splitQuotedReply('Nur eine Notiz.');
    expect(body).toBe('Nur eine Notiz.');
    expect(quoted).toBe('');
  });
});
