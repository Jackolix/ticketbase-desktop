/**
 * Release notes, as the updater receives them.
 *
 * The body comes from the GitHub release verbatim, which means Markdown: `##`
 * headings, `-` bullets, links, emphasis. Rendered as a raw string it is a wall
 * of asterisks and brackets, so this turns it into the handful of blocks the
 * notification actually shows.
 *
 * Deliberately not a Markdown parser. This renders into plain text nodes, so
 * the syntax is stripped rather than interpreted — there is no path here for
 * markup from a release body to become markup in the app.
 */

export interface ReleaseNoteBlock {
  kind: 'heading' | 'item' | 'text';
  text: string;
}

/** Lines GitHub adds itself, which say nothing to the person updating. */
const NOISE = [
  /^\*\*full changelog\*\*/i,
  /^full changelog/i,
  /^see the assets to download/i,
  /^<!--/,
];

/** Strips inline Markdown down to the words. */
function plain(line: string): string {
  return line
    // Links: keep the label, drop the target.
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    // Bold, italic, inline code.
    .replace(/(\*\*|__)(.*?)\1/g, '$2')
    .replace(/(\*|_)(.*?)\1/g, '$2')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Splits a release body into displayable blocks, longest-form first.
 *
 * `limit` caps the result because the notification is a corner of the screen,
 * not a changelog viewer.
 */
export function parseReleaseNotes(
  body: string | null | undefined,
  limit = 12,
): ReleaseNoteBlock[] {
  if (!body || !body.trim()) return [];

  const blocks: ReleaseNoteBlock[] = [];

  for (const raw of body.replace(/\r\n?/g, '\n').split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    if (NOISE.some((pattern) => pattern.test(line))) continue;

    // A rule between sections carries nothing once the layout is ours.
    if (/^([-*_])\1{2,}$/.test(line)) continue;

    const heading = /^#{1,6}\s+(.*)$/.exec(line);
    if (heading) {
      const text = plain(heading[1]);
      if (text) blocks.push({ kind: 'heading', text });
      continue;
    }

    const item = /^[-*+]\s+(.*)$/.exec(line);
    if (item) {
      const text = plain(item[1]);
      if (text) blocks.push({ kind: 'item', text });
      continue;
    }

    const text = plain(line);
    if (text) blocks.push({ kind: 'text', text });
  }

  // A trailing heading introduces nothing, so it is not worth a line.
  while (blocks.length > 0 && blocks[blocks.length - 1].kind === 'heading') {
    blocks.pop();
  }

  return blocks.slice(0, limit);
}
