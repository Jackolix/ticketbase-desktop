import { describe, expect, it } from 'vitest';
import {
  allowedWhileTyping,
  formatHotkey,
  matchesHotkey,
  SHORTCUT_HELP,
} from './hotkeys';

/** A KeyboardEvent stand-in; the suite runs without a DOM. */
function keyEvent(init: {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
}): KeyboardEvent {
  return {
    key: init.key,
    ctrlKey: init.ctrlKey ?? false,
    metaKey: init.metaKey ?? false,
    shiftKey: init.shiftKey ?? false,
    altKey: init.altKey ?? false,
  } as KeyboardEvent;
}

describe('matchesHotkey', () => {
  it('matches a bare key', () => {
    expect(matchesHotkey(keyEvent({ key: 'Escape' }), 'escape')).toBe(true);
    expect(matchesHotkey(keyEvent({ key: 'k' }), 'escape')).toBe(false);
  });

  it('treats Ctrl and Command as the same modifier', () => {
    expect(matchesHotkey(keyEvent({ key: 'k', ctrlKey: true }), 'mod+k')).toBe(true);
    expect(matchesHotkey(keyEvent({ key: 'k', metaKey: true }), 'mod+k')).toBe(true);
  });

  it('does not fire a modified shortcut on the bare key', () => {
    // Otherwise typing "k" into the search box would open the palette.
    expect(matchesHotkey(keyEvent({ key: 'k' }), 'mod+k')).toBe(false);
  });

  it('does not fire a bare shortcut when a modifier is held', () => {
    expect(matchesHotkey(keyEvent({ key: 'Escape', ctrlKey: true }), 'escape')).toBe(false);
  });

  it('ignores case, so Caps Lock does not break it', () => {
    expect(matchesHotkey(keyEvent({ key: 'K', ctrlKey: true }), 'mod+k')).toBe(true);
  });

  it('requires Shift only when the shortcut asks for it', () => {
    expect(matchesHotkey(keyEvent({ key: 'K', shiftKey: true }), 'shift+k')).toBe(true);
    expect(matchesHotkey(keyEvent({ key: 'k', shiftKey: false }), 'shift+k')).toBe(false);
    // A shortcut that does not mention Shift tolerates it.
    expect(matchesHotkey(keyEvent({ key: 'k', ctrlKey: true, shiftKey: true }), 'mod+k')).toBe(
      true,
    );
  });

  it('matches punctuation by the character, not by the key that produced it', () => {
    // "?" is Shift+/ on a US layout and Shift+ß on a German one. Matching the
    // character is the only thing that works on both.
    expect(matchesHotkey(keyEvent({ key: '?', shiftKey: true }), '?')).toBe(true);
    expect(matchesHotkey(keyEvent({ key: '/', shiftKey: true }), '?')).toBe(false);
  });

  it('distinguishes Alt', () => {
    expect(matchesHotkey(keyEvent({ key: 'k', ctrlKey: true, altKey: true }), 'mod+k')).toBe(
      false,
    );
    expect(matchesHotkey(keyEvent({ key: 'k', ctrlKey: true, altKey: true }), 'mod+alt+k')).toBe(
      true,
    );
  });
});

describe('allowedWhileTyping', () => {
  it('lets Escape through, because leaving a field is what it is for', () => {
    expect(allowedWhileTyping('escape')).toBe(true);
  });

  it('lets modified shortcuts through', () => {
    expect(allowedWhileTyping('mod+k')).toBe(true);
    expect(allowedWhileTyping('mod+enter')).toBe(true);
  });

  it('blocks bare keys, which would otherwise eat what you type', () => {
    expect(allowedWhileTyping('?')).toBe(false);
    expect(allowedWhileTyping('n')).toBe(false);
  });
});

describe('formatHotkey', () => {
  it('uses the platform symbols on macOS', () => {
    expect(formatHotkey('mod+k', true)).toBe('⌘K');
    expect(formatHotkey('escape', true)).toBe('Esc');
  });

  it('spells the modifiers out elsewhere', () => {
    expect(formatHotkey('mod+k', false)).toBe('Strg + K');
    expect(formatHotkey('mod+enter', false)).toBe('Strg + ⏎');
  });
});

describe('SHORTCUT_HELP', () => {
  it('lists only shortcuts the matcher can parse', () => {
    for (const { group, items } of SHORTCUT_HELP) {
      expect(group).toBeTruthy();
      for (const [hotkey, label] of items) {
        expect(label).toBeTruthy();
        expect(formatHotkey(hotkey, false)).toBeTruthy();
      }
    }
  });
});
