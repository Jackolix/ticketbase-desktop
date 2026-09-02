/**
 * A small .eml (RFC 5322 / MIME) reader.
 *
 * Tickets frequently carry a forwarded mail as an attachment, and there was no
 * way to read one without downloading it and leaving the app. This covers what
 * mail clients actually produce — folded headers, encoded-words,
 * quoted-printable and base64 bodies, multipart with nested parts — rather than
 * the whole of MIME.
 *
 * Deliberately no dependency: the alternative is a ~200 kB parser for a
 * secondary feature, and the format's awkward corners are in header decoding,
 * which is not much code.
 */

export interface EmlAttachment {
  filename: string;
  contentType: string;
  /** Decoded size in bytes, where it could be determined. */
  size: number;
}

export interface ParsedEmail {
  subject: string;
  from: string;
  to: string;
  cc: string;
  date: string;
  /** Best available body: text/plain if present, otherwise text/html stripped. */
  body: string;
  /** True when the body came from HTML rather than a plain-text part. */
  bodyFromHtml: boolean;
  attachments: EmlAttachment[];
}

interface MimePart {
  headers: Map<string, string>;
  body: string;
}

/** Parses a raw .eml document. Never throws; returns best effort. */
export function parseEml(raw: string): ParsedEmail {
  const text = raw.replace(/\r\n/g, '\n');
  const root = splitPart(text);

  const contentType = root.headers.get('content-type') ?? 'text/plain';
  const parts = expandParts(root, contentType);

  const plain = parts.find((p) => typeOf(p).startsWith('text/plain') && !isAttachment(p));
  const html = parts.find((p) => typeOf(p).startsWith('text/html') && !isAttachment(p));

  let body = '';
  let bodyFromHtml = false;
  if (plain) {
    body = decodeBody(plain);
  } else if (html) {
    body = decodeBody(html);
    bodyFromHtml = true;
  }

  const attachments: EmlAttachment[] = parts
    .filter(isAttachment)
    .map((part) => ({
      filename: attachmentName(part),
      contentType: typeOf(part).split(';')[0].trim(),
      size: estimateSize(part),
    }))
    .filter((a) => a.filename.length > 0);

  return {
    subject: decodeHeader(root.headers.get('subject') ?? ''),
    from: decodeHeader(root.headers.get('from') ?? ''),
    to: decodeHeader(root.headers.get('to') ?? ''),
    cc: decodeHeader(root.headers.get('cc') ?? ''),
    date: root.headers.get('date') ?? '',
    body,
    bodyFromHtml,
    attachments,
  };
}

/** Splits a MIME entity into its headers and body. */
function splitPart(text: string): MimePart {
  const boundary = text.indexOf('\n\n');
  const headerBlock = boundary === -1 ? text : text.slice(0, boundary);
  const body = boundary === -1 ? '' : text.slice(boundary + 2);

  return { headers: parseHeaders(headerBlock), body };
}

/**
 * Header names are case-insensitive and values may be folded across lines
 * with leading whitespace.
 */
function parseHeaders(block: string): Map<string, string> {
  const headers = new Map<string, string>();
  const unfolded = block.replace(/\n[ \t]+/g, ' ');

  for (const line of unfolded.split('\n')) {
    const at = line.indexOf(':');
    if (at <= 0) continue;
    const name = line.slice(0, at).trim().toLowerCase();
    if (!headers.has(name)) headers.set(name, line.slice(at + 1).trim());
  }
  return headers;
}

/** Flattens a multipart tree into a list of leaf parts. */
function expandParts(part: MimePart, contentType: string): MimePart[] {
  if (!/^multipart\//i.test(contentType)) return [part];

  const boundary = /boundary="?([^";\n]+)"?/i.exec(contentType)?.[1];
  if (!boundary) return [part];

  const chunks = part.body
    .split(`--${boundary}`)
    .slice(1) // before the first boundary is the preamble
    .filter((chunk) => !/^\s*--/.test(chunk)); // the closing boundary

  return chunks.flatMap((chunk) => {
    const child = splitPart(chunk.replace(/^\n/, ''));
    return expandParts(child, child.headers.get('content-type') ?? 'text/plain');
  });
}

function typeOf(part: MimePart): string {
  return (part.headers.get('content-type') ?? 'text/plain').toLowerCase();
}

function isAttachment(part: MimePart): boolean {
  const disposition = (part.headers.get('content-disposition') ?? '').toLowerCase();
  if (disposition.startsWith('attachment')) return true;
  // Inline images still carry a filename and are worth listing.
  return /name\s*=/.test(disposition) || /name\s*=/.test(typeOf(part));
}

function attachmentName(part: MimePart): string {
  const disposition = part.headers.get('content-disposition') ?? '';
  const contentType = part.headers.get('content-type') ?? '';

  const match =
    /filename\*?="?([^";\n]+)"?/i.exec(disposition) ??
    /name\*?="?([^";\n]+)"?/i.exec(contentType);

  return match ? decodeHeader(match[1].trim()) : '';
}

function estimateSize(part: MimePart): number {
  const encoding = (part.headers.get('content-transfer-encoding') ?? '').toLowerCase();
  const payload = part.body.replace(/\s/g, '');
  // base64 carries 3 bytes per 4 characters.
  return encoding === 'base64' ? Math.floor((payload.length * 3) / 4) : part.body.length;
}

function decodeBody(part: MimePart): string {
  const encoding = (part.headers.get('content-transfer-encoding') ?? '7bit').toLowerCase();
  const charset = /charset="?([^";\n]+)"?/i.exec(typeOf(part))?.[1] ?? 'utf-8';

  let bytes: Uint8Array | null = null;
  if (encoding === 'base64') {
    bytes = base64ToBytes(part.body.replace(/\s/g, ''));
  } else if (encoding === 'quoted-printable') {
    bytes = quotedPrintableToBytes(part.body);
  }

  if (!bytes) return part.body;

  try {
    return new TextDecoder(normaliseCharset(charset)).decode(bytes);
  } catch {
    return new TextDecoder('utf-8').decode(bytes);
  }
}

function normaliseCharset(charset: string): string {
  const value = charset.trim().toLowerCase().replace(/^"|"$/g, '');
  // TextDecoder knows windows-1252 but not the "cp" spellings mail uses.
  if (value === 'cp1252' || value === 'ansi_x3.4-1968') return 'windows-1252';
  return value;
}

function base64ToBytes(input: string): Uint8Array | null {
  try {
    const binary = atob(input);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return bytes;
  } catch {
    return null;
  }
}

function quotedPrintableToBytes(input: string): Uint8Array {
  // Soft line breaks first, then =XX escapes.
  const joined = input.replace(/=\n/g, '');
  const bytes: number[] = [];

  for (let i = 0; i < joined.length; i += 1) {
    const char = joined[i];
    if (char === '=' && i + 2 < joined.length) {
      const hex = joined.slice(i + 1, i + 3);
      if (/^[0-9a-fA-F]{2}$/.test(hex)) {
        bytes.push(parseInt(hex, 16));
        i += 2;
        continue;
      }
    }
    bytes.push(char.charCodeAt(0) & 0xff);
  }

  return new Uint8Array(bytes);
}

/**
 * Decodes RFC 2047 encoded-words, e.g.
 * `=?UTF-8?Q?Gr=C3=BC=C3=9Fe?=` or `=?ISO-8859-1?B?R3LDvMOfZQ==?=`.
 */
export function decodeHeader(value: string): string {
  if (!value.includes('=?')) return value.trim();

  return value
    .replace(/=\?([^?]+)\?([BbQq])\?([^?]*)\?=/g, (match, charset: string, kind: string, payload: string) => {
      const bytes =
        kind.toUpperCase() === 'B'
          ? base64ToBytes(payload)
          : quotedPrintableToBytes(payload.replace(/_/g, ' '));

      if (!bytes) return match;
      try {
        return new TextDecoder(normaliseCharset(charset)).decode(bytes);
      } catch {
        return match;
      }
    })
    // Adjacent encoded-words are joined without the whitespace between them.
    .replace(/\?=\s+=\?/g, '')
    .trim();
}
