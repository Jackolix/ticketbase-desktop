import { useCallback, useEffect, useRef, useState } from 'react';

import type { PreviewAnchor } from '@/components/tickets/TicketPreviewCard';
import type { Ticket } from '@/types/api';

/** How long the pointer has to rest before a preview opens. */
const HOVER_DELAY_MS = 450;

export interface TicketPreviewState {
  ticket: Ticket;
  anchor: PreviewAnchor;
}

/**
 * Hover-to-preview, for any list of tickets.
 *
 * Extracted from the board so the related-tickets list behaves the same way —
 * the question "what actually is this ticket" is the same whether the row is on
 * the board or under "Ähnliche Vorgänge".
 *
 * The delay is what makes it usable: without it, dragging the pointer down a
 * list flashes a card per row. The anchor is taken once, on entry, rather than
 * tracking the mouse — a card that follows the cursor is harder to read than
 * one that stays put.
 */
export function useTicketPreview(delayMs: number = HOVER_DELAY_MS) {
  const [preview, setPreview] = useState<TicketPreviewState | null>(null);
  const timer = useRef<number | null>(null);

  const hide = useCallback(() => {
    if (timer.current !== null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
    setPreview((current) => (current === null ? current : null));
  }, []);

  const show = useCallback(
    (ticket: Ticket, event: React.MouseEvent<HTMLElement>) => {
      if (timer.current !== null) window.clearTimeout(timer.current);

      const rect = event.currentTarget.getBoundingClientRect();
      const anchor: PreviewAnchor = { x: event.clientX, top: rect.top, bottom: rect.bottom };

      timer.current = window.setTimeout(() => {
        timer.current = null;
        setPreview({ ticket, anchor });
      }, delayMs);
    },
    [delayMs],
  );

  // The anchor is a viewport position, so it goes stale the moment anything
  // moves underneath it.
  useEffect(() => {
    if (!preview) return;
    window.addEventListener('wheel', hide, { passive: true });
    window.addEventListener('resize', hide);
    return () => {
      window.removeEventListener('wheel', hide);
      window.removeEventListener('resize', hide);
    };
  }, [preview, hide]);

  // Nothing should outlive the list that produced it.
  useEffect(() => hide, [hide]);

  return { preview, show, hide };
}
