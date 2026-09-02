import type { Ticket } from '@/types/api';

/**
 * Shape returned by the backend's `getTicketById` endpoint.
 *
 * This is a hand-written approximation of what APIController::getTicketById
 * actually emits. Phase 02 replaces it with a Zod schema derived from the
 * controller, at which point the `any`s and the optionality guesses go away.
 */
export interface RawTicketById {
  id: number;
  description?: string | null;
  status?: { name?: string | null } | null;
  status_id?: number | null;
  summary?: string | null;
  userone?: { name?: string | null } | null;
  ticketuser?: { name?: string | null; phone?: string | null } | null;
  servicedetail?: { name?: string | null } | null;
  priority?: string | null;
  priority_index?: number | null;
  my_ticket_id?: number | null;
  location_id?: number | null;
  companyone?: {
    id?: number | null;
    name?: string | null;
    number?: string | null;
    email?: string | null;
    phone?: string | null;
    zip?: string | null;
    address?: string | null;
  } | null;
  dyn_template_id?: number | null;
  created_at?: string | null;
  template_data?: string | null;
}

/**
 * Maps a `getTicketById` response onto the `Ticket` shape the UI consumes.
 *
 * Extracted verbatim from the three identical copies that previously lived in
 * App.tsx, TicketList.tsx and TicketWindow.tsx. Behaviour is intentionally
 * unchanged here so the extraction stays reviewable on its own.
 *
 * KNOWN LOSSY — fixed in Phase 02, characterised by tests until then:
 *   - `attachments` is always [] even when the ticket has files
 *   - `ticket_start` is always ''
 *   - `ticketMessagesCount` is always 0
 *   - `ticketTerminatedUser` is always ''
 *   - `pool_name` is always ''
 *
 * The practical effect is that a ticket opened by ID (from search, a
 * notification, or a popped-out window) silently shows no attachments, while
 * the same ticket opened from the list shows them.
 */
export function transformTicketById(raw: RawTicketById): Ticket {
  return {
    id: raw.id,
    description: raw.description || '',
    status: raw.status?.name || '',
    status_id: raw.status_id || 0,
    summary: raw.summary || '',
    ticketCreator: raw.userone?.name || '',
    ticketUser: raw.ticketuser?.name || '',
    ticketUserPhone: raw.ticketuser?.phone || '',
    ticketTerminatedUser: '',
    attachments: [],
    subject: raw.servicedetail?.name || '',
    priority: raw.priority || '',
    index: raw.priority_index || 0,
    my_ticket_id: raw.my_ticket_id || 0,
    location_id: raw.location_id || 0,
    company: {
      id: raw.companyone?.id || 0,
      name: raw.companyone?.name || '',
      number: raw.companyone?.number || '',
      companyMail: raw.companyone?.email || '',
      companyPhone: raw.companyone?.phone || '',
      companyZip: raw.companyone?.zip || '',
      companyAdress: raw.companyone?.address || '',
    },
    dyn_template_id: raw.dyn_template_id || 0,
    created_at: raw.created_at || '',
    ticket_start: '',
    ticketMessagesCount: 0,
    template_data: raw.template_data || '',
    pool_name: '',
  };
}
