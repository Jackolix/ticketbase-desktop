/**
 * Status options offered when saving work on a ticket.
 *
 * Ids match the statuses table. Kept in one place because the ticket detail
 * form and the timer's finish dialog both offer them, and they had drifted into
 * two separate hardcoded lists.
 */
export const TICKET_STATUS_OPTIONS: Array<{ id: string; label: string }> = [
  { id: '4', label: 'Abgeschlossen' },
  { id: '3', label: 'Prüfen' },
  { id: '2', label: 'Terminiert' },
  { id: '5', label: 'Offen' },
  { id: '6', label: 'Vor Ort' },
  { id: '8', label: 'Wieder geöffnet' },
  { id: '9', label: 'Warten auf Rückmeldung vom Ticketbenutzer' },
  { id: '11', label: 'Warten auf Rückmeldung (Extern)' },
];

/**
 * The id of "Abgeschlossen".
 *
 * Load-bearing beyond a label: `getTicketsQuery` filters `status_id != 4`, so a
 * ticket reaching this value leaves every list the sync can see.
 */
export const CLOSED_STATUS_ID = 4;
