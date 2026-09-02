import { describe, expect, it } from 'vitest';
import { transformTicketById, type RawTicketById } from './ticketTransform';

const raw: RawTicketById = {
  id: 4812,
  description: 'Exchange-Server nimmt keine Mails an',
  status: { name: 'In Arbeit' },
  status_id: 3,
  summary: 'Mailversand gestört',
  userone: { name: 'Anna Weber' },
  ticketuser: { name: 'Jonas Müller', phone: '+49 221 5550101' },
  servicedetail: { name: 'E-Mail' },
  priority: 'Hoch',
  priority_index: 3,
  my_ticket_id: 17,
  location_id: 42,
  companyone: {
    id: 8,
    name: 'Müller Logistik GmbH',
    number: 'K-1042',
    email: 'it@mueller-logistik.example',
    phone: '+49 221 5550100',
    zip: '50667',
    address: 'Hafenstraße 12',
  },
  dyn_template_id: 5,
  created_at: '02-09-2026 08:14',
  template_data: '{"Fehlercode":"550"}',
};

describe('transformTicketById', () => {
  it('maps the fields the backend actually provides', () => {
    const t = transformTicketById(raw);

    expect(t.id).toBe(4812);
    expect(t.description).toBe('Exchange-Server nimmt keine Mails an');
    expect(t.status).toBe('In Arbeit');
    expect(t.status_id).toBe(3);
    expect(t.summary).toBe('Mailversand gestört');
    expect(t.ticketCreator).toBe('Anna Weber');
    expect(t.ticketUser).toBe('Jonas Müller');
    expect(t.ticketUserPhone).toBe('+49 221 5550101');
    expect(t.subject).toBe('E-Mail');
    expect(t.priority).toBe('Hoch');
    expect(t.index).toBe(3);
    expect(t.my_ticket_id).toBe(17);
    expect(t.location_id).toBe(42);
    expect(t.dyn_template_id).toBe(5);
    expect(t.created_at).toBe('02-09-2026 08:14');
    expect(t.template_data).toBe('{"Fehlercode":"550"}');
  });

  it('flattens the company relation onto the ticket', () => {
    const t = transformTicketById(raw);

    expect(t.company).toEqual({
      id: 8,
      name: 'Müller Logistik GmbH',
      number: 'K-1042',
      companyMail: 'it@mueller-logistik.example',
      companyPhone: '+49 221 5550100',
      companyZip: '50667',
      companyAdress: 'Hafenstraße 12',
    });
  });

  it('survives a response with every relation missing', () => {
    const t = transformTicketById({ id: 1 });

    expect(t.id).toBe(1);
    expect(t.status).toBe('');
    expect(t.ticketCreator).toBe('');
    expect(t.company.id).toBe(0);
    expect(t.company.name).toBe('');
  });

  it('coerces null relations rather than throwing', () => {
    const t = transformTicketById({
      id: 2,
      status: null,
      ticketuser: null,
      companyone: null,
      description: null,
    });

    expect(t.status).toBe('');
    expect(t.ticketUser).toBe('');
    expect(t.description).toBe('');
    expect(t.company.name).toBe('');
  });

  // ---------------------------------------------------------------------
  // Characterisation of known-broken behaviour. These document what the
  // function does TODAY so the Phase 02 fix has something to flip. When that
  // lands, these expectations invert — that is the point of them.
  // ---------------------------------------------------------------------
  describe('known lossy fields (fixed in Phase 02)', () => {
    it('drops attachments even when the ticket has them', () => {
      const t = transformTicketById({
        ...raw,
        // The endpoint does return attachments; the transform ignores them.
      } as RawTicketById);

      expect(t.attachments).toEqual([]);
    });

    it('blanks ticket_start, pool_name and ticketTerminatedUser', () => {
      const t = transformTicketById(raw);

      expect(t.ticket_start).toBe('');
      expect(t.pool_name).toBe('');
      expect(t.ticketTerminatedUser).toBe('');
    });

    it('reports zero unread messages regardless of the real count', () => {
      expect(transformTicketById(raw).ticketMessagesCount).toBe(0);
    });
  });
});
