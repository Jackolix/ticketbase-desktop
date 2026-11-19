import { beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({
  getPlayerStatus: vi.fn(),
  play: vi.fn(),
  resume: vi.fn(),
  stop: vi.fn(),
  correctWatch: vi.fn(),
  saveTicketHistory: vi.fn(),
}));

vi.mock('@/lib/api', () => ({ apiClient: api }));

import { PAUSE, PLAY, RESUME, STOP } from './playerStatus';
import { saveWorkEntry, toServerDateTime, WorkEntryError } from './workEntry';

const ok = { status: 'success' };

function serverState(play_status: number) {
  api.getPlayerStatus.mockResolvedValue({ status: 'success', playerStatus: { play_status } });
}

/** Names of the API calls made, in order. */
function calls(): string[] {
  return Object.entries(api)
    .flatMap(([name, fn]) => fn.mock.invocationCallOrder.map((order) => [order, name] as const))
    .sort((a, b) => a[0] - b[0])
    .map(([, name]) => name);
}

const entry = { ticketId: 7, userId: 3, text: 'Drucker getauscht', statusId: 4 };

beforeEach(() => {
  vi.clearAllMocks();
  for (const fn of [api.play, api.resume, api.stop, api.correctWatch, api.saveTicketHistory]) {
    fn.mockResolvedValue(ok);
  }
});

describe('saveWorkEntry', () => {
  it('stops a running timer with its own state before saving', async () => {
    serverState(RESUME);
    await saveWorkEntry(entry);
    expect(calls()).toEqual(['getPlayerStatus', 'stop', 'saveTicketHistory']);
    expect(api.stop).toHaveBeenCalledWith(7, 3, RESUME);
  });

  it('resumes a paused timer first, because the server cannot stop from PAUSE', async () => {
    serverState(PAUSE);
    await saveWorkEntry(entry);
    expect(calls()).toEqual(['getPlayerStatus', 'resume', 'stop', 'saveTicketHistory']);
    expect(api.resume).toHaveBeenCalledWith(7, 3, PAUSE);
    expect(api.stop).toHaveBeenCalledWith(7, 3, RESUME);
  });

  it('only saves when an earlier attempt already stopped the timer', async () => {
    serverState(STOP);
    await saveWorkEntry(entry);
    expect(calls()).toEqual(['getPlayerStatus', 'saveTicketHistory']);
  });

  it('starts and stops a timer when none is running, then books the minutes', async () => {
    serverState(0);
    await saveWorkEntry({ ...entry, minutes: 20 });
    expect(calls()).toEqual(['getPlayerStatus', 'play', 'stop', 'correctWatch', 'saveTicketHistory']);
    expect(api.stop).toHaveBeenCalledWith(7, 3, PLAY);
    expect(api.correctWatch).toHaveBeenCalledWith(
      expect.objectContaining({ ticket_id: 7, new_time: 20 }),
    );
  });

  it('passes assignee and appointment through', async () => {
    serverState(STOP);
    await saveWorkEntry({ ...entry, statusId: 2, assigneeId: 9, appointment: '2026-11-20 09:30:00' });
    expect(api.saveTicketHistory).toHaveBeenCalledWith(
      expect.objectContaining({ status_id: 2, retermUserId: 9, retermDate: '2026-11-20 09:30:00' }),
    );
  });

  it('refuses a ticket someone else is working on', async () => {
    serverState(0);
    api.play.mockResolvedValue({ status: 'exists' });
    await expect(saveWorkEntry(entry)).rejects.toBeInstanceOf(WorkEntryError);
    expect(api.saveTicketHistory).not.toHaveBeenCalled();
  });

  it('surfaces the server message when the save is rejected', async () => {
    serverState(STOP);
    api.saveTicketHistory.mockResolvedValue({ status: 'error', message: 'Bitte Status auswählen!' });
    await expect(saveWorkEntry(entry)).rejects.toThrow('Bitte Status auswählen!');
  });

  it('does not save when the correction is rejected', async () => {
    serverState(STOP);
    api.correctWatch.mockResolvedValue({ status: 'error', message: 'Bitte eine ganze Minutenzahl' });
    await expect(saveWorkEntry({ ...entry, minutes: 5 })).rejects.toThrow('Bitte eine ganze Minutenzahl');
    expect(api.saveTicketHistory).not.toHaveBeenCalled();
  });
});

describe('toServerDateTime', () => {
  it('formats local time the way the server parses it', () => {
    expect(toServerDateTime(new Date(2026, 10, 20, 9, 5, 0))).toBe('2026-11-20 09:05:00');
  });
});
