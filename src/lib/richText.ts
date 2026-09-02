/**
 * Normalising ticket text.
 *
 * Ticket descriptions and history entries are frequently pasted email bodies.
 * The backend runs `strip_tags()` over history replies, which removes the
 * markup but leaves everything between it — so a message that was one blank
 * line per paragraph in Outlook arrives as three or four, and reads as a
 * column of isolated sentences.
 *
 * Descriptions are not stripped server-side at all, so those can still contain
 * real HTML.
 *
 * The web frontend shows the same thing; this is a client-side improvement, not
 * a data change.
 */

/** Blank lines beyond this many in a row carry no meaning. */
const MAX_CONSECUTIVE_BLANKS = 1;

/**
 * Built from its code point rather than typed literally: an invisible
 * character in source is unreviewable, and it trips no-irregular-whitespace.
 */
const NON_BREAKING_SPACE = String.fromCharCode(160);

/**
 * Turns raw ticket text into something readable: markup removed, entities
 * decoded, runs of blank lines collapsed, trailing spaces dropped.
 *
 * Paragraph breaks are preserved — a single blank line still separates
 * paragraphs — because losing them would be as bad as the original problem.
 */
export function normalizeTicketText(input: string | null | undefined): string {
  if (!input) return '';

  let text = input;

  // Block-level markup becomes a line break at both ends before tags are
  // removed, so adjacent paragraphs stay separated instead of running together.
  text = text
    .replace(/<\s*br\s*\/?\s*>/gi, '\n')
    .replace(/<\s*(p|div|tr|li|h[1-6])(\s[^>]*)?>/gi, '\n')
    .replace(/<\s*\/\s*(p|div|tr|li|h[1-6])\s*>/gi, '\n')
    .replace(/<[^>]+>/g, '');

  text = decodeEntities(text);

  // Line endings, plus the non-breaking spaces Outlook leaves behind.
  text = text.replace(/\r\n?/g, '\n').split(NON_BREAKING_SPACE).join(' ');

  const lines = text.split('\n').map((line) => line.replace(/[ \t]+$/g, ''));

  const out: string[] = [];
  let blanks = 0;
  for (const line of lines) {
    if (line.trim() === '') {
      blanks += 1;
      if (blanks > MAX_CONSECUTIVE_BLANKS) continue;
    } else {
      blanks = 0;
    }
    out.push(line);
  }

  return out.join('\n').trim();
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  auml: 'ä',
  ouml: 'ö',
  uuml: 'ü',
  Auml: 'Ä',
  Ouml: 'Ö',
  Uuml: 'Ü',
  szlig: 'ß',
  euro: '€',
  hellip: '…',
  ndash: '–',
  mdash: '—',
};

/**
 * Decodes HTML entities without touching the DOM.
 *
 * Using innerHTML for this would parse attacker-controlled markup, and this
 * text comes from email. A table plus numeric escapes covers what actually
 * appears in practice.
 */
function decodeEntities(text: string): string {
  if (!text.includes('&')) return text;

  return text.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (match, entity: string) => {
    if (entity.startsWith('#')) {
      const isHex = entity[1] === 'x' || entity[1] === 'X';
      const code = parseInt(isHex ? entity.slice(2) : entity.slice(1), isHex ? 16 : 10);
      return Number.isFinite(code) && code > 0 ? safeFromCodePoint(code) : match;
    }
    return NAMED_ENTITIES[entity] ?? match;
  });
}

function safeFromCodePoint(code: number): string {
  try {
    return String.fromCodePoint(code);
  } catch {
    return '';
  }
}

/**
 * Splits a pasted email body into the new message and the quoted history
 * below it, so the reply can lead and the thread can be collapsed.
 *
 * Returns `quoted: ''` when no quote marker is found, which is the common case.
 */
export function splitQuotedReply(text: string): { body: string; quoted: string } {
  const lines = text.split('\n');

  // German and English Outlook separators, plus the classic "On … wrote:".
  const markers = [
    /^\s*-{2,}\s*(Urspr[üu]ngliche Nachricht|Original Message)\s*-{2,}\s*$/i,
    /^\s*Von:\s/,
    /^\s*From:\s/,
    /^\s*Am .+ schrieb .+:\s*$/,
    /^\s*On .+ wrote:\s*$/,
    /^\s*_{5,}\s*$/,
  ];

  const at = lines.findIndex((line) => markers.some((m) => m.test(line)));
  // A marker in the first couple of lines means the whole message is a
  // forward, not a reply with history — keep it whole.
  if (at < 2) return { body: text, quoted: '' };

  return {
    body: lines.slice(0, at).join('\n').trim(),
    quoted: lines.slice(at).join('\n').trim(),
  };
}
