import { useEffect, useRef } from 'react';

import {
  allowedWhileTyping,
  isEditableTarget,
  isOverlayOpen,
  matchesHotkey,
  type Hotkey,
} from '@/lib/hotkeys';

interface HotkeyOptions {
  /** Set false to suspend the shortcut without unmounting its owner. */
  enabled?: boolean;
  /**
   * Fire even while a dialog or menu is open. Off by default: those layers
   * handle their own Escape, and a second handler would close two at once.
   */
  whenOverlayOpen?: boolean;
}

/**
 * Binds a keyboard shortcut for as long as the component is mounted.
 *
 * The handler is held in a ref so that passing an inline arrow function does
 * not tear down and rebind the listener on every render — which would also
 * drop the keypress that happened in between.
 */
export function useHotkey(
  hotkey: Hotkey,
  handler: (event: KeyboardEvent) => void,
  { enabled = true, whenOverlayOpen = false }: HotkeyOptions = {},
) {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    if (!enabled) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (!matchesHotkey(event, hotkey)) return;
      if (!allowedWhileTyping(hotkey) && isEditableTarget(event.target)) return;
      if (!whenOverlayOpen && isOverlayOpen()) return;

      handlerRef.current(event);
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [hotkey, enabled, whenOverlayOpen]);
}
