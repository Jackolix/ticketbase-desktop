import { describe, expect, it } from 'vitest';
import { decodeHeader, parseEml } from './emlParser';

const SIMPLE = [
  'From: Peter Guba <peter.guba@example.test>',
  'To: ITM Team <team@itm.example>',
  'Subject: Aktualisierung Sicherheitspaket compact',
  'Date: Mon, 1 Sep 2026 09:14:22 +0200',
  'Content-Type: text/plain; charset="utf-8"',
  '',
  'Hallo ITM-Team,',
  '',
  'bitte um Bearbeitung.',
].join('\r\n');

const MULTIPART = [
  'From: "Müller, Anna" <anna@example.test>',
  'Subject: =?UTF-8?Q?Gr=C3=BC=C3=9Fe_aus_K=C3=B6ln?=',
  'Content-Type: multipart/mixed; boundary="BOUND1"',
  '',
  '--BOUND1',
  'Content-Type: text/plain; charset="utf-8"',
  'Content-Transfer-Encoding: quoted-printable',
  '',
  'Gr=C3=BC=C3=9Fe und viele Dank=C3=A4',
  '',
  '--BOUND1',
  'Content-Type: application/pdf; name="Angebot.pdf"',
  'Content-Disposition: attachment; filename="Angebot.pdf"',
  'Content-Transfer-Encoding: base64',
  '',
  'JVBERi0xLjQKJeLjz9MK',
  '',
  '--BOUND1--',
].join('\r\n');

describe('parseEml', () => {
  it('reads the standard headers', () => {
    const mail = parseEml(SIMPLE);
    expect(mail.from).toBe('Peter Guba <peter.guba@example.test>');
    expect(mail.to).toBe('ITM Team <team@itm.example>');
    expect(mail.subject).toBe('Aktualisierung Sicherheitspaket compact');
    expect(mail.date).toBe('Mon, 1 Sep 2026 09:14:22 +0200');
  });

  it('reads a plain-text body', () => {
    expect(parseEml(SIMPLE).body).toContain('bitte um Bearbeitung.');
    expect(parseEml(SIMPLE).bodyFromHtml).toBe(false);
  });

  it('decodes quoted-printable bodies with their charset', () => {
    const mail = parseEml(MULTIPART);
    expect(mail.body.trim()).toBe('Grüße und viele Dankä');
  });

  it('decodes RFC 2047 encoded-word subjects', () => {
    expect(parseEml(MULTIPART).subject).toBe('Grüße aus Köln');
  });

  it('lists attachments with type and decoded size', () => {
    const [attachment] = parseEml(MULTIPART).attachments;
    expect(attachment.filename).toBe('Angebot.pdf');
    expect(attachment.contentType).toBe('application/pdf');
    expect(attachment.size).toBeGreaterThan(0);
  });

  it('does not treat the body part as an attachment', () => {
    expect(parseEml(MULTIPART).attachments).toHaveLength(1);
  });

  it('prefers text/plain over text/html when both are present', () => {
    const alternative = [
      'Subject: Test',
      'Content-Type: multipart/alternative; boundary="B"',
      '',
      '--B',
      'Content-Type: text/plain',
      '',
      'Nur Text',
      '',
      '--B',
      'Content-Type: text/html',
      '',
      '<p>Markup</p>',
      '',
      '--B--',
    ].join('\r\n');

    const mail = parseEml(alternative);
    expect(mail.body.trim()).toBe('Nur Text');
    expect(mail.bodyFromHtml).toBe(false);
  });

  it('falls back to the HTML part and flags it', () => {
    const htmlOnly = [
      'Subject: Test',
      'Content-Type: text/html; charset="utf-8"',
      '',
      '<p>Nur Markup</p>',
    ].join('\r\n');

    const mail = parseEml(htmlOnly);
    expect(mail.bodyFromHtml).toBe(true);
    expect(mail.body).toContain('Nur Markup');
  });

  it('unfolds headers wrapped across lines', () => {
    const folded = ['Subject: Ein sehr langer', ' Betreff über zwei Zeilen', '', 'Body'].join('\r\n');
    expect(parseEml(folded).subject).toBe('Ein sehr langer Betreff über zwei Zeilen');
  });

  it('handles nested multipart parts', () => {
    const nested = [
      'Content-Type: multipart/mixed; boundary="OUTER"',
      '',
      '--OUTER',
      'Content-Type: multipart/alternative; boundary="INNER"',
      '',
      '--INNER',
      'Content-Type: text/plain',
      '',
      'Verschachtelt',
      '',
      '--INNER--',
      '',
      '--OUTER--',
    ].join('\r\n');

    expect(parseEml(nested).body.trim()).toBe('Verschachtelt');
  });

  it('never throws on junk', () => {
    expect(() => parseEml('')).not.toThrow();
    expect(() => parseEml('not an email at all')).not.toThrow();
    expect(parseEml('').subject).toBe('');
  });
});

describe('decodeHeader', () => {
  it('decodes base64 encoded-words', () => {
    expect(decodeHeader('=?UTF-8?B?R3LDvMOfZQ==?=')).toBe('Grüße');
  });

  it('honours the declared charset rather than assuming UTF-8', () => {
    // The same word, encoded as ISO-8859-1 bytes. Decoding these as UTF-8
    // would produce mojibake, which is what mail clients get wrong.
    expect(decodeHeader('=?ISO-8859-1?B?R3L832U=?=')).toBe('Grüße');
  });

  it('decodes Q-encoding, including underscore as space', () => {
    expect(decodeHeader('=?UTF-8?Q?Hallo_Welt?=')).toBe('Hallo Welt');
  });

  it('leaves plain headers untouched', () => {
    expect(decodeHeader('Simple Subject')).toBe('Simple Subject');
  });

  it('leaves an unknown charset as-is rather than mangling it', () => {
    const value = '=?NOT-A-CHARSET?B?QQ==?=';
    expect(decodeHeader(value)).toBe(value);
  });
});

describe('attachment contents', () => {
  it('decodes a base64 attachment to its real bytes', () => {
    // "%PDF-1.4\n%âãÏÓ\n" — the header of the fixture PDF.
    const [attachment] = parseEml(MULTIPART).attachments;

    expect(attachment.bytes).not.toBeNull();
    expect([...attachment.bytes!.slice(0, 5)]).toEqual([0x25, 0x50, 0x44, 0x46, 0x2d]);
    // The size is the decoded length, not a guess from the encoded payload.
    expect(attachment.size).toBe(attachment.bytes!.length);
  });

  it('keeps binary bytes intact rather than decoding them as text', () => {
    // 0xFF 0xD8 0xFF is a JPEG header and is not valid UTF-8; running it
    // through a text decoder would replace it with U+FFFD and destroy the
    // image. This is why attachments do not go through decodeBody.
    const jpegHeader = btoa(String.fromCharCode(0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10));
    const mail = parseEml(
      [
        'Content-Type: multipart/mixed; boundary="B"',
        '',
        '--B',
        'Content-Type: text/plain',
        '',
        'Anbei das Bild.',
        '',
        '--B',
        'Content-Type: image/jpeg; name="foto.jpg"',
        'Content-Disposition: attachment; filename="foto.jpg"',
        'Content-Transfer-Encoding: base64',
        '',
        jpegHeader,
        '',
        '--B--',
      ].join('\r\n'),
    );

    const [image] = mail.attachments;
    expect(image.filename).toBe('foto.jpg');
    expect(image.contentType).toBe('image/jpeg');
    expect([...image.bytes!]).toEqual([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
  });

  it('decodes an inline image, which is how pasted screenshots arrive', () => {
    const mail = parseEml(
      [
        'Content-Type: multipart/related; boundary="R"',
        '',
        '--R',
        'Content-Type: text/html',
        '',
        '<p>Siehe Screenshot</p>',
        '',
        '--R',
        'Content-Type: image/png; name="screenshot.png"',
        'Content-Disposition: inline; filename="screenshot.png"',
        'Content-Transfer-Encoding: base64',
        '',
        btoa(String.fromCharCode(0x89, 0x50, 0x4e, 0x47)),
        '',
        '--R--',
      ].join('\r\n'),
    );

    expect(mail.attachments).toHaveLength(1);
    expect([...mail.attachments[0].bytes!]).toEqual([0x89, 0x50, 0x4e, 0x47]);
  });

  it('reports null bytes for an encoding it cannot decode', () => {
    // Better a disabled row than a corrupt file handed to the viewer.
    const mail = parseEml(
      [
        'Content-Type: multipart/mixed; boundary="B"',
        '',
        '--B',
        'Content-Type: application/octet-stream; name="x.bin"',
        'Content-Disposition: attachment; filename="x.bin"',
        'Content-Transfer-Encoding: x-uuencode',
        '',
        'begin 644 x.bin',
        '',
        '--B--',
      ].join('\r\n'),
    );

    expect(mail.attachments[0].bytes).toBeNull();
  });
});
