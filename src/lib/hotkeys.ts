/**
 * Keyboard shortcuts.
 *
 * Two rules make the difference between a shortcut that helps and one that
 * eats your work:
 *
 *   1. A plain key never fires while you are typing. `Escape` is the exception
 *      — leaving a field is exactly what it is for.
 *   2. A shortcut never fires while a dialog or menu is open. Those handle
 *      their own Escape, and a second handler would close two things at once.
 */

/** `mod` is Ctrl on Windows and Linux, Command on macOS. */
export type Hotkey = string;

/**
 * Whether the event landed in something the user is typing into.
 *
 * Includes `contenteditable`, which the rich-text areas use and which is not an
 * input element at all.
 */
export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;

  const tag = target.tagName.toLowerCase();
  if (tag === 'input' || tag === 'textarea' || tag === 'select') return true;

  return target.isContentEditable;
}

/**
 * Whether a modal layer is open.
 *
 * Radix marks the rest of the page `aria-hidden` while a modal is up, and sets
 * `data-state="open"` on the layer itself. Checking the DOM rather than
 * threading "is a dialog open" through every component keeps this correct for
 * dialogs nobody remembered to register.
 */
export function isOverlayOpen(doc: Document = document): boolean {
  return doc.querySelector('[role="dialog"], [role="alertdialog"], [role="menu"]') !== null;
}

interface ParsedHotkey {
  key: string;
  mod: boolean;
  shift: boolean;
  alt: boolean;
}

function parse(hotkey: Hotkey): ParsedHotkey {
  const parts = hotkey.split('+').map((part) => part.trim().toLowerCase());
  return {
    key: parts[parts.length - 1],
    mod: parts.includes('mod'),
    shift: parts.includes('shift'),
    alt: parts.includes('alt'),
  };
}

/**
 * Whether a keyboard event matches a shortcut such as `mod+k` or `Escape`.
 *
 * Compares `event.key` case-insensitively, so `mod+k` matches whether or not
 * Shift or Caps Lock is involved in producing the character.
 */
export function matchesHotkey(event: KeyboardEvent, hotkey: Hotkey): boolean {
  const wanted = parse(hotkey);

  if (event.key.toLowerCase() !== wanted.key) return false;
  if (wanted.mod !== (event.ctrlKey || event.metaKey)) return false;
  if (wanted.alt !== event.altKey) return false;
  // Shift is only checked when the shortcut asks for it. Shortcuts on
  // punctuation are written as the character they produce — `?`, not `shift+/`
  // — because which physical key and modifier yields it differs by layout,
  // while `event.key` is the character itself everywhere.
  if (wanted.shift && !event.shiftKey) return false;

  return true;
}

/** True for shortcuts that are safe to fire while a field has focus. */
export function allowedWhileTyping(hotkey: Hotkey): boolean {
  const { key, mod } = parse(hotkey);
  // Escape leaves the field; anything with a modifier cannot be typed by
  // accident.
  return key === 'escape' || mod;
}

/** Renders a shortcut for display, using the platform's own symbols. */
export function formatHotkey(hotkey: Hotkey, isMac = navigator.platform.startsWith('Mac')): string {
  return hotkey
    .split('+')
    .map((part) => {
      const token = part.trim().toLowerCase();
      if (token === 'mod') return isMac ? '⌘' : 'Strg';
      if (token === 'shift') return isMac ? '⇧' : 'Umschalt';
      if (token === 'alt') return isMac ? '⌥' : 'Alt';
      if (token === 'escape') return 'Esc';
      if (token === 'enter') return '⏎';
      return token.length === 1 ? token.toUpperCase() : part;
    })
    .join(isMac ? '' : ' + ');
}

/** The shortcuts the app offers, for the help overlay. */
export const SHORTCUT_HELP: Array<{ group: string; items: Array<[Hotkey, string]> }> = [
  {
    group: 'Überall',
    items: [
      ['mod+k', 'Befehlspalette öffnen'],
      ['?', 'Diese Übersicht'],
    ],
  },
  {
    group: 'Ticketliste',
    items: [
      ['mod+f', 'Suche fokussieren'],
      ['escape', 'Suche leeren'],
    ],
  },
  {
    group: 'Ticket',
    items: [
      ['escape', 'Zurück zur Liste bzw. Fenster schließen'],
      ['mod+enter', 'Eintrag speichern'],
    ],
  },
];
