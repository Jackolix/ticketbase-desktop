import type { Ticket } from '@/types/api';

/**
 * Finding the ticket where this problem was solved last time.
 *
 * The backend has no search of any kind, let alone a similarity one, so this
 * runs over what the local store already holds. That is a real constraint on
 * what it can find: open tickets are always there, closed ones only once the
 * customer's archive has been pulled in. It is honest about that rather than
 * pretending an empty result means "this never happened before".
 *
 * The scoring is deliberately simple — weighted token overlap plus a few
 * structural signals. Anything cleverer would be guessing at German compound
 * words without a stemmer, and a wrong "similar" ticket costs more attention
 * than a missing one.
 */

/**
 * Words carrying no signal about what a ticket is about.
 *
 * German function words, plus the handful of nouns that appear in nearly every
 * ticket in this system ("Ticket", "Problem", "Fehler") and would otherwise
 * make everything look related to everything.
 */
const STOPWORDS = new Set([
  'aber', 'alle', 'allen', 'als', 'am', 'an', 'auch', 'auf', 'aus', 'bei',
  'beim', 'bin', 'bis', 'bitte', 'da', 'damit', 'dann', 'das', 'dass', 'dem',
  'den', 'der', 'des', 'die', 'dies', 'diese', 'diesem', 'diesen', 'dieser',
  'doch', 'dort', 'ein', 'eine', 'einem', 'einen', 'einer', 'eines', 'er',
  'es', 'für', 'gibt', 'hat', 'haben', 'hier', 'ich', 'ihr', 'im', 'in',
  'ist', 'ja', 'kann', 'kein', 'keine', 'mehr', 'mit', 'nach', 'nicht',
  'noch', 'nun', 'nur', 'ob', 'oder', 'ohne', 'schon', 'sehr', 'sein',
  'seine', 'sich', 'sie', 'sind', 'so', 'soll', 'über', 'um', 'und', 'uns',
  'unter', 'vom', 'von', 'vor', 'war', 'was', 'wenn', 'werden', 'wie',
  'wieder', 'wir', 'wird', 'wo', 'zu', 'zum', 'zur',
  // Ubiquitous in this system, so useless for telling tickets apart.
  'ticket', 'tickets', 'problem', 'probleme', 'fehler', 'bitte', 'neu',
  'neue', 'neuer', 'neues', 'kunde', 'kunden',
  // English, for the mixed-language summaries that do occur.
  'and', 'for', 'not', 'the', 'with',
]);

/** Shorter than this and a token is noise, not a keyword. */
const MIN_TOKEN = 3;

/**
 * Splits text into comparable keywords.
 *
 * Splits on anything that is not a letter or digit, which keeps German
 * compounds ("Terminalserver") intact — they are the most distinctive tokens
 * these summaries have.
 */
export function tokenize(text: string | null | undefined): string[] {
  if (!text) return [];

  return text
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((token) => token.length >= MIN_TOKEN && !STOPWORDS.has(token));
}

/** The words a ticket is about: its summary, its service category, its form. */
function keywords(ticket: Ticket): Set<string> {
  return new Set([
    ...tokenize(ticket.summary),
    ...tokenize(ticket.subject),
    ...tokenize(ticket.description).slice(0, 40),
  ]);
}

export interface SimilarTicket {
  ticket: Ticket;
  /** 0 to 1. Only the ordering is meaningful; the absolute value is not. */
  score: number;
  /** The words that made it match, for showing why. */
  shared: string[];
}

/** Below this, a match is coincidence rather than a related problem. */
const MIN_SCORE = 0.2;

/**
 * How much each signal can contribute. They sum to 1, so the score never needs
 * clamping — an earlier version added the bonuses on top and capped at 1, which
 * flattened every strong match to exactly 1.0 and destroyed the ordering
 * precisely where it mattered most.
 */
const WEIGHT_WORDS = 0.6;
const WEIGHT_COMPANY = 0.15;
const WEIGHT_SUBJECT = 0.2;
const WEIGHT_TEMPLATE = 0.05;

/**
 * Scores one candidate against the ticket being viewed.
 *
 * Jaccard overlap on keywords, then structural signals. Same customer matters
 * because "did we have this before at this site" is the question being asked;
 * the same service category is the strongest single signal the data carries.
 */
export function scoreSimilarity(current: Ticket, candidate: Ticket): SimilarTicket {
  const a = keywords(current);
  const b = keywords(candidate);

  const shared = [...a].filter((token) => b.has(token));
  const union = new Set([...a, ...b]).size;

  let score = union === 0 ? 0 : (shared.length / union) * WEIGHT_WORDS;

  if (candidate.company?.id && candidate.company.id === current.company?.id) {
    score += WEIGHT_COMPANY;
  }
  if (candidate.subject && candidate.subject === current.subject) score += WEIGHT_SUBJECT;
  // A shared template means the same form was filled in — usually the same
  // kind of request.
  if (candidate.dyn_template_id && candidate.dyn_template_id === current.dyn_template_id) {
    score += WEIGHT_TEMPLATE;
  }

  return { ticket: candidate, score, shared };
}

/**
 * The most similar tickets among `candidates`, best first.
 *
 * The current ticket is excluded, as are duplicates by id — the candidate pool
 * is assembled from several overlapping queries.
 */
export function findSimilarTickets(
  current: Ticket,
  candidates: Ticket[],
  limit = 5,
): SimilarTicket[] {
  const seen = new Set<number>([current.id]);

  return candidates
    .filter((candidate) => {
      if (seen.has(candidate.id)) return false;
      seen.add(candidate.id);
      return true;
    })
    .map((candidate) => scoreSimilarity(current, candidate))
    .filter((match) => match.score >= MIN_SCORE && match.shared.length > 0)
    .sort((a, b) => b.score - a.score || b.ticket.id - a.ticket.id)
    .slice(0, limit);
}

/**
 * The most distinctive words of a ticket, for use as a store search term.
 *
 * Longest first: in German the long compound is the specific one
 * ("Terminalserver" over "server").
 */
export function topKeywords(ticket: Ticket, limit = 3): string[] {
  return [...keywords(ticket)].sort((a, b) => b.length - a.length).slice(0, limit);
}
