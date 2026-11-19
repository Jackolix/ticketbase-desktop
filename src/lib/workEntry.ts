import { apiClient } from '@/lib/api';
import { PAUSE, PLAY, RESUME, STOP } from '@/lib/playerStatus';
import type { ApiResponse } from '@/types/api';

/**
 * Saving a work entry (Arbeitseintrag) on a ticket.
 *
 * Since the 2026-11 backend release, `saveVerlaufApi` only accepts an entry
 * when the user's timer on that ticket is in the STOP state; otherwise it
 * answers "Spielstatus muss auf Stop sein!". `correctWatch` has the same
 * precondition. That holds for every way the app saves an entry — finishing
 * the timer, the manual entry form, forwarding — so all of them go through
 * here.
 *
 * The order is fixed: stop the timer, then record a time correction, then save.
 */

/** A failure the server explained; the message is fit to show the user. */
export class WorkEntryError extends Error {}

/**
 * Brings the user's timer on the ticket to STOP.
 *
 * - Already stopped (an earlier save attempt failed after stopping): nothing to do.
 * - Running: stop it with the state it is in; the server only acts on PLAY or RESUME.
 * - Paused: the server cannot stop from PAUSE, so resume first. The resumed
 *   moment adds no billable time worth speaking of.
 * - No timer at all (manual entry, forwarding): start and stop one. Starting
 *   takes the ticket over (status "In Bearbeitung", the user as owner), which
 *   is what the web player does too; a ticket someone else owns cannot be
 *   started, and the server would not let this user change it anyway.
 */
export async function stopTimerForSave(ticketId: number, userId: number): Promise<void> {
  const status = await apiClient.getPlayerStatus(ticketId, userId);
  if (status.status !== 'success') {
    throw new WorkEntryError(status.message || 'Die Zeiterfassung konnte nicht gelesen werden.');
  }

  const state = status.playerStatus?.play_status ?? 0;

  switch (state) {
    case STOP:
      return;
    case PLAY:
    case RESUME:
      expectSuccess(await apiClient.stop(ticketId, userId, state), 'Die Zeiterfassung konnte nicht gestoppt werden.');
      return;
    case PAUSE:
      expectSuccess(await apiClient.resume(ticketId, userId, PAUSE), 'Die Zeiterfassung konnte nicht gestoppt werden.');
      expectSuccess(await apiClient.stop(ticketId, userId, RESUME), 'Die Zeiterfassung konnte nicht gestoppt werden.');
      return;
    default: {
      const started = await apiClient.play(ticketId, userId);
      if (started.status === 'exists') {
        throw new WorkEntryError(
          'Das Ticket ist einem Kollegen zugewiesen. Einträge kann nur der Bearbeiter speichern.',
        );
      }
      expectSuccess(started, 'Die Zeiterfassung konnte nicht gestartet werden.');
      expectSuccess(await apiClient.stop(ticketId, userId, PLAY), 'Die Zeiterfassung konnte nicht gestoppt werden.');
    }
  }
}

export interface WorkEntry {
  ticketId: number;
  userId: number;
  text: string;
  statusId: number;
  /**
   * Minutes to book instead of what the timer measured. Omit to book the
   * measured time, which the server rounds up to the customer's block.
   */
  minutes?: number;
  /** Original measured minutes, recorded alongside a correction. */
  measuredMinutes?: number;
  /** Assignee for an "assigned" or "scheduled" status; defaults to the user. */
  assigneeId?: number;
  /** Appointment, `YYYY-MM-DD HH:mm:ss` local time. */
  appointment?: string;
}

/** Stops the timer, records a correction if asked to, and saves the entry. */
export async function saveWorkEntry(entry: WorkEntry): Promise<void> {
  await stopTimerForSave(entry.ticketId, entry.userId);

  if (entry.minutes !== undefined && entry.minutes > 0) {
    expectSuccess(
      await apiClient.correctWatch({
        ticket_id: entry.ticketId,
        user_id: entry.userId,
        old_time: entry.measuredMinutes ?? 0,
        new_time: entry.minutes,
      }),
      'Die Zeit konnte nicht übernommen werden.',
    );
  }

  expectSuccess(
    await apiClient.saveTicketHistory({
      ticket_id: entry.ticketId,
      user_id: entry.userId,
      verlauf_text: entry.text,
      status_id: entry.statusId,
      ...(entry.assigneeId !== undefined && { retermUserId: entry.assigneeId }),
      ...(entry.appointment !== undefined && { retermDate: entry.appointment }),
    }),
    'Der Server hat den Eintrag abgelehnt.',
  );
}

/** `Date` → `YYYY-MM-DD HH:mm:ss` in local time, the format the server parses. */
export function toServerDateTime(date: Date): string {
  const pad = (n: number) => n.toString().padStart(2, '0');
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
    `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
  );
}

function expectSuccess(response: ApiResponse | null | undefined, fallback: string): void {
  if (response?.status !== 'success') {
    throw new WorkEntryError(response?.message || fallback);
  }
}
