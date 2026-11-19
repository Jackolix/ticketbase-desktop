/**
 * Showing why a row matched.
 *
 * The store matches each word on its own, ignoring case and accents, and also
 * reads "ue" as "ü" (see `fold` and `transliterated` in src-tauri/src/store).
 * Highlighting has to make the same calls, or a row found for "muller" would
 * show nothing marked in "Müller Logistik" and look like a false hit.
 */

const FOLD: Record<string, string> = {
  ä: 'a', à: 'a', á: 'a', â: 'a', ã: 'a', å: 'a',
  ö: 'o', ò: 'o', ó: 'o', ô: 'o', õ: 'o', ø: 'o',
  ü: 'u', ù: 'u', ú: 'u', û: 'u',
  é: 'e', è: 'e', ê: 'e', ë: 'e',
  í: 'i', ì: 'i', î: 'i', ï: 'i',
  ç: 'c', ñ: 'n', ß: 'ss',
};

/** Lowercased, accents stripped, `ß` as `ss` — the store's `ufold`. */
export function fold(input: string): string {
  let out = '';
  for (const char of input.toLowerCase()) out += FOLD[char] ?? char;
  return out;
}

/** "mueller" → "muller"; null when nothing changed. Mirrors the store. */
export function transliterated(folded: string): string | null {
  const chars = [...folded];
  let out = '';
  let changed = false;

  for (let i = 0; i < chars.length; i += 1) {
    const c = chars[i];
    const afterConsonant = i === 0 || !'aeiouy'.includes(chars[i - 1]);
    if ((c === 'a' || c === 'o' || c === 'u') && chars[i + 1] === 'e' && afterConsonant) {
      out += c;
      i += 1;
      changed = true;
    } else {
      out += c;
    }
  }

  return changed ? out : null;
}

/** Free text split into words; a quoted run is one word. Mirrors the store. */
export function searchWords(input: string | undefined): string[] {
  if (!input) return [];
  const words: string[] = [];
  let current = '';
  let quoted = false;

  const flush = () => {
    const word = current.trim();
    if (word) words.push(word);
    current = '';
  };

  for (const char of input) {
    if (char === '"') {
      flush();
      quoted = !quoted;
    } else if (/\s/.test(char) && !quoted) {
      flush();
    } else {
      current += char;
    }
  }
  flush();
  return words;
}

export interface HighlightPart {
  text: string;
  match: boolean;
}

/**
 * Splits `text` into marked and unmarked runs for the given words.
 *
 * Folding can change length (`ß` → `ss`), so matching happens on the folded
 * text and each folded position is mapped back to the character it came from.
 */
export function highlight(text: string, words: string[]): HighlightPart[] {
  if (!text || words.length === 0) return [{ text, match: false }];

  const chars = [...text];
  let folded = '';
  /** For each code unit of `folded`, the index into `chars` it came from. */
  const origin: number[] = [];

  chars.forEach((char, index) => {
    const piece = fold(char);
    folded += piece;
    for (let i = 0; i < piece.length; i += 1) origin.push(index);
  });

  const needles = new Set<string>();
  for (const word of words) {
    const f = fold(word);
    if (!f) continue;
    needles.add(f);
    const alt = transliterated(f);
    if (alt) needles.add(alt);
  }

  const marked = new Array<boolean>(chars.length).fill(false);
  for (const needle of needles) {
    let from = folded.indexOf(needle);
    while (from !== -1) {
      const first = origin[from];
      const last = origin[from + needle.length - 1];
      for (let i = first; i <= last; i += 1) marked[i] = true;
      from = folded.indexOf(needle, from + 1);
    }
  }

  const parts: HighlightPart[] = [];
  chars.forEach((char, index) => {
    const match = marked[index];
    const previous = parts[parts.length - 1];
    if (previous && previous.match === match) previous.text += char;
    else parts.push({ text: char, match });
  });
  return parts;
}

/** Whether every word occurs in `text`, by the same rules as the store. */
export function containsAll(text: string, words: string[]): boolean {
  const folded = fold(text);
  return words.every((word) => {
    const f = fold(word);
    const alt = transliterated(f);
    return folded.includes(f) || (alt !== null && folded.includes(alt));
  });
}

/**
 * A short piece of `text` around the first match, for showing why a row was
 * found when the match is not in anything the row displays.
 */
export function excerpt(text: string, words: string[], radius = 48): string | null {
  const flat = text.replace(/\s+/g, ' ').trim();
  const parts = highlight(flat, words);

  let offset = 0;
  for (const part of parts) {
    if (part.match) {
      const chars = [...flat];
      const start = Math.max(0, offset - radius);
      const end = Math.min(chars.length, offset + [...part.text].length + radius);
      return `${start > 0 ? '… ' : ''}${chars.slice(start, end).join('').trim()}${end < chars.length ? ' …' : ''}`;
    }
    offset += [...part.text].length;
  }
  return null;
}
