import { useEffect, useState } from 'react';
import { apiClient } from '@/lib/api';
import type { SaveStatus } from '@/types/api';

/**
 * Statuses a work entry can be saved with.
 *
 * The server keeps a status catalog: each status has a behaviour and a
 * "selectable on save" flag, and `saveVerlaufApi` rejects any other status
 * with "Bitte Status auswählen!". The live list comes from `getSaveStatuses`;
 * tenants can rename statuses and add their own, so it is not hardcoded.
 */

/**
 * Used only when the list cannot be loaded. Mirrors the defaults the backend
 * migration seeds (2026_10_15_152220_add_catalog_columns_to_statuses_table).
 */
export const FALLBACK_SAVE_STATUSES: SaveStatus[] = [
  status(2, 'Zugewiesen', 'assigned'),
  status(9, 'Terminiert', 'scheduled'),
  status(5, 'Warte auf Rückmeldung (extern)', 'waiting'),
  status(11, 'Ausstehend', 'waiting'),
  status(4, 'Geschlossen', 'closed'),
];

let cached: Promise<SaveStatus[]> | null = null;

/** Loads the list once per window; a failed load is retried next time. */
export function loadSaveStatuses(): Promise<SaveStatus[]> {
  if (!cached) {
    cached = apiClient
      .getSaveStatuses()
      .then((response) => {
        if (response.status !== 'success' || !response.statuses?.length) {
          throw new Error(response.message || 'empty status list');
        }
        return response.statuses;
      })
      .catch((error) => {
        console.error('Failed to load save statuses, using defaults:', error);
        cached = null;
        return FALLBACK_SAVE_STATUSES;
      });
  }
  return cached;
}

/**
 * Statuses for saving one's own work. "Assigned" hands the ticket to someone
 * else, which is what the forward dialog is for, so it is left out here.
 */
export function ownWorkStatuses(statuses: SaveStatus[]): SaveStatus[] {
  return statuses.filter((s) => !s.requires_other_assignee);
}

/** The status that hands a ticket to a colleague, for the forward dialog. */
export function forwardStatus(statuses: SaveStatus[]): SaveStatus | undefined {
  return statuses.find((s) => s.requires_other_assignee);
}

/**
 * Default selection. Finishing the timer usually finishes the ticket, so it
 * defaults to the closing status; a manual entry is usually an interim note,
 * so it defaults to the first status that neither closes the ticket nor needs
 * a date — closing should be a deliberate choice there.
 */
export function defaultSaveStatus(
  statuses: SaveStatus[],
  prefer: 'close' | 'keep-open' = 'close',
): SaveStatus | undefined {
  const preferred =
    prefer === 'close'
      ? statuses.find((s) => s.closes_ticket)
      : statuses.find((s) => !s.closes_ticket && !s.requires_date);
  return preferred ?? statuses[0];
}

/** Whether the chosen status is complete: a "scheduled" status needs a date. */
export function isSaveStatusComplete(statuses: SaveStatus[], statusId: string, appointment: string): boolean {
  const status = statuses.find((s) => String(s.id) === statusId);
  if (!status) return false;
  return !status.requires_date || appointment.trim() !== '';
}

export function useSaveStatuses(): SaveStatus[] {
  const [statuses, setStatuses] = useState<SaveStatus[]>(FALLBACK_SAVE_STATUSES);

  useEffect(() => {
    let active = true;
    void loadSaveStatuses().then((list) => {
      if (active) setStatuses(list);
    });
    return () => {
      active = false;
    };
  }, []);

  return statuses;
}

function status(id: number, name: string, behavior: string): SaveStatus {
  return {
    id,
    name,
    behavior,
    requires_date: behavior === 'scheduled',
    requires_other_assignee: behavior === 'assigned',
    closes_ticket: behavior === 'closed',
    color: null,
  };
}
