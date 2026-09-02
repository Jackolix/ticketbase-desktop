import { describe, expect, it } from 'vitest';
import { isRunning, PAUSE, PLAY, RESUME, STOP, toPlayerState } from './playerStatus';

describe('toPlayerState', () => {
  it('treats both PLAY and RESUME as running', () => {
    expect(toPlayerState(PLAY)).toBe('playing');
    expect(toPlayerState(RESUME)).toBe('playing');
  });

  it('treats PAUSE as paused', () => {
    expect(toPlayerState(PAUSE)).toBe('paused');
  });

  it('treats STOP and unknown values as stopped', () => {
    expect(toPlayerState(STOP)).toBe('stopped');
    expect(toPlayerState(99)).toBe('stopped');
  });

  it('handles null and undefined', () => {
    expect(toPlayerState(null)).toBe('stopped');
    expect(toPlayerState(undefined)).toBe('stopped');
  });

  it('does not treat a stopped ticket as running', () => {
    // The list used to render a pause icon for every non-null status, because
    // it compared a number against the string 'playing'.
    expect(isRunning(PLAY)).toBe(true);
    expect(isRunning(RESUME)).toBe(true);
    expect(isRunning(PAUSE)).toBe(false);
    expect(isRunning(STOP)).toBe(false);
    expect(isRunning(null)).toBe(false);
  });
});
