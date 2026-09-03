import { describe, expect, it } from 'vitest';
import { findSimilarTickets, scoreSimilarity, tokenize, topKeywords } from './ticketSimilarity';
import type { Ticket } from '@/types/api';

function makeTicket(overrides: Partial<Ticket> & { id: number }): Ticket {
  return {
    description: '',
    status: 'In Bearbeitung',
    status_id: 13,
    summary: '',
    ticketCreator: '',
    ticketUser: '',
    ticketUserPhone: '',
    playStatus: null,
    ticketTerminatedUser: '',
    attachments: [],
    subject: '',
    priority: 'NORMAL',
    index: 2,
    my_ticket_id: 0,
    location_id: 0,
    company: {
      id: 8,
      name: 'Müller Logistik GmbH',
      number: 'K-1042',
      companyMail: '',
      companyPhone: '',
      companyZip: '',
      companyAdress: '',
    },
    dyn_template_id: 0,
    created_at: '01-09-2026 09:00',
    ticket_start: '',
    ticketMessagesCount: 0,
    template_data: '',
    pool_name: '',
    ...overrides,
  };
}

describe('tokenize', () => {
  it('drops function words and anything too short', () => {
    expect(tokenize('Der Drucker ist im EG nicht erreichbar')).toEqual([
      'drucker',
      'erreichbar',
    ]);
  });

  it('keeps German compounds whole', () => {
    // The compound is the distinctive token; splitting it would lose the point.
    expect(tokenize('Scanner am Terminalserver')).toEqual(['scanner', 'terminalserver']);
  });

  it('drops the words that appear in every ticket in this system', () => {
    // Otherwise everything looks related to everything.
    expect(tokenize('Ticket Problem Fehler beim Kunden')).toEqual([]);
    // But the word that says what it is about survives.
    expect(tokenize('Problem mit dem Exchange')).toEqual(['exchange']);
  });

  it('splits on punctuation and keeps digits', () => {
    expect(tokenize('Durchwahl 214 klingelt nicht!')).toEqual(['durchwahl', '214', 'klingelt']);
  });

  it('survives empty and missing input', () => {
    expect(tokenize('')).toEqual([]);
    expect(tokenize(null)).toEqual([]);
    expect(tokenize(undefined)).toEqual([]);
  });
});

describe('scoreSimilarity', () => {
  it('scores a recurrence of the same problem highly', () => {
    const current = makeTicket({ id: 2, summary: 'Drucker EG rechts offline nach Update' });
    const past = makeTicket({ id: 1, summary: 'Drucker EG rechts wieder offline' });

    const match = scoreSimilarity(current, past);

    expect(match.score).toBeGreaterThan(0.4);
    expect(match.shared).toEqual(expect.arrayContaining(['drucker', 'offline']));
  });

  it('scores unrelated tickets at the company bonus and no more', () => {
    const current = makeTicket({ id: 2, summary: 'Drucker EG rechts offline' });
    const other = makeTicket({ id: 1, summary: 'VPN-Zugang für neue Mitarbeiterin' });

    const match = scoreSimilarity(current, other);

    expect(match.shared).toEqual([]);
    // Same customer only — which is why a shared word is also required before
    // anything is shown.
    expect(match.score).toBeCloseTo(0.15, 5);
  });

  it('rewards the same service category', () => {
    const current = makeTicket({ id: 2, summary: 'Mail kommt nicht an', subject: 'E-Mail' });
    const withSubject = makeTicket({ id: 1, summary: 'Mail kommt verspätet', subject: 'E-Mail' });
    const withoutSubject = makeTicket({ id: 3, summary: 'Mail kommt verspätet', subject: 'Client' });

    expect(scoreSimilarity(current, withSubject).score).toBeGreaterThan(
      scoreSimilarity(current, withoutSubject).score,
    );
  });

  it('rewards the same customer', () => {
    const current = makeTicket({ id: 2, summary: 'Drucker offline' });
    const sameCustomer = makeTicket({ id: 1, summary: 'Drucker offline' });
    const otherCustomer = makeTicket({
      id: 3,
      summary: 'Drucker offline',
      company: { ...current.company, id: 99, name: 'Hoffmann Bau AG' },
    });

    expect(scoreSimilarity(current, sameCustomer).score).toBeGreaterThan(
      scoreSimilarity(current, otherCustomer).score,
    );
  });
});

describe('findSimilarTickets', () => {
  const current = makeTicket({
    id: 100,
    summary: 'Scanner wird am Terminalserver nicht erkannt',
    subject: 'Hardware',
  });

  it('ranks the recurrence above the merely adjacent', () => {
    const results = findSimilarTickets(current, [
      makeTicket({ id: 1, summary: 'VPN-Zugang für neue Mitarbeiterin einrichten' }),
      makeTicket({ id: 2, summary: 'Scanner am Terminalserver erneut nicht erkannt' }),
      makeTicket({ id: 3, summary: 'Terminalserver langsam nach Update' }),
    ]);

    expect(results.map((r) => r.ticket.id)).toEqual([2, 3]);
    expect(results[0].score).toBeGreaterThan(results[1].score);
  });

  it('never suggests the ticket you are already looking at', () => {
    const results = findSimilarTickets(current, [current, makeTicket({ ...current, id: 100 })]);
    expect(results).toEqual([]);
  });

  it('deduplicates a candidate pool built from overlapping queries', () => {
    const duplicate = makeTicket({ id: 2, summary: 'Scanner am Terminalserver nicht erkannt' });
    const results = findSimilarTickets(current, [duplicate, duplicate, duplicate]);

    expect(results).toHaveLength(1);
  });

  it('returns nothing rather than noise when nothing is related', () => {
    const results = findSimilarTickets(current, [
      makeTicket({ id: 1, summary: 'Rechnung prüfen' }),
      makeTicket({ id: 2, summary: 'Urlaubsantrag weiterleiten' }),
    ]);

    expect(results).toEqual([]);
  });

  it('honours the limit', () => {
    const many = Array.from({ length: 20 }, (_, i) =>
      makeTicket({ id: i + 1, summary: 'Scanner am Terminalserver nicht erkannt' }),
    );

    expect(findSimilarTickets(current, many, 3)).toHaveLength(3);
  });
});

describe('topKeywords', () => {
  it('prefers the long compound, which is the specific word', () => {
    const ticket = makeTicket({
      id: 1,
      summary: 'Scanner wird am Terminalserver nicht erkannt',
    });

    expect(topKeywords(ticket, 1)).toEqual(['terminalserver']);
  });

  it('returns nothing for a ticket with no usable words', () => {
    expect(topKeywords(makeTicket({ id: 1, summary: 'Das Problem' }))).toEqual([]);
  });
});
