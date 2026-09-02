/**
 * Ticket player state.
 *
 * The backend stores this as an integer (see APITicketPlayerController). The
 * ticket list previously compared it against the string 'playing', which is
 * never true for a number — so the running indicator never appeared and every
 * active ticket rendered as paused.
 */

export const PLAY = 1;
export const PAUSE = 2;
export const RESUME = 3;
export const STOP = 4;

export type PlayerState = 'playing' | 'paused' | 'stopped';

/**
 * Maps the backend's numeric player state onto something renderable.
 *
 * PLAY and RESUME both mean the clock is running; only PAUSE is paused.
 * Anything unrecognised — including null — is treated as stopped.
 */
export function toPlayerState(status: number | null | undefined): PlayerState {
  switch (status) {
    case PLAY:
    case RESUME:
      return 'playing';
    case PAUSE:
      return 'paused';
    default:
      return 'stopped';
  }
}

/** Whether the clock is actively running for this ticket. */
export function isRunning(status: number | null | undefined): boolean {
  return toPlayerState(status) === 'playing';
}
