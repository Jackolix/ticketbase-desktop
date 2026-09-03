import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Building2,
  CalendarClock,
  Clock,
  MessageSquare,
  Paperclip,
  Phone,
  User,
  Wrench,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { formatTicketAge } from '@/lib/ticketDate';
import { normalizeTicketText } from '@/lib/richText';
import { parseTemplateData } from '@/lib/templateData';
import { TONE_BADGE, priorityLabel, priorityTone, statusTone } from '@/lib/ticketStatus';
import type { Ticket } from '@/types/api';

/**
 * Template fields beyond this many are summarised rather than listed.
 *
 * Higher than it was, because the two-column layout spends width instead of
 * height — and height is the scarce dimension on a landscape screen.
 */
const MAX_FIELDS = 6;

/**
 * Everything about a ticket that fits without opening it.
 *
 * The board row is deliberately terse — one line of summary and a status — so
 * deciding whether a ticket is worth opening meant opening it. This is the
 * answer to "what actually is this", and it costs nothing: every field comes
 * from the ticket already in the local store, so there is no request behind
 * hovering a row.
 */
export function TicketPreviewCard({ ticket }: { ticket: Ticket }) {
  const description = useMemo(
    () => normalizeTicketText(ticket.description),
    [ticket.description],
  );

  const fields = useMemo(
    () => parseTemplateData(ticket.template_data, { omitValues: [ticket.description] })
      .filter((field) => !field.isEmpty),
    [ticket.template_data, ticket.description],
  );

  const age = formatTicketAge(ticket.created_at);
  const scheduled = ticket.ticket_start?.trim();

  return (
    // Wide and short rather than narrow and tall: a window is far wider than it
    // is high, so a tall card is the one that runs out of room and has to flip
    // above the row.
    <div className="w-[46rem] max-w-[calc(100vw-2rem)] space-y-3 rounded-lg border bg-popover p-4 text-popover-foreground shadow-lg">
      <div className="space-y-1.5">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="font-mono text-xs tabular-nums text-muted-foreground">
            #{ticket.id}
          </span>
          <Badge
            variant="outline"
            className={`${TONE_BADGE[statusTone(ticket.status)]} px-2 py-0 text-[11px] font-medium`}
          >
            {ticket.status || '—'}
          </Badge>
          <Badge
            variant="outline"
            className={`${TONE_BADGE[priorityTone(ticket.priority, ticket.index)]} px-2 py-0 text-[11px] font-medium`}
          >
            {priorityLabel(ticket.priority)}
          </Badge>
          {ticket.pool_name && (
            <span className="text-[11px] text-muted-foreground">{ticket.pool_name}</span>
          )}
        </div>
        <h4 className="text-sm leading-snug font-semibold">{ticket.summary || '—'}</h4>
        {ticket.subject && (
          <p className="text-[11px] text-muted-foreground">{ticket.subject}</p>
        )}
      </div>

      <div className="grid grid-cols-[minmax(0,3fr)_minmax(0,2fr)] gap-x-5 border-t pt-2.5">
        <div className="min-w-0 space-y-2.5">
          {description && (
            <p className="line-clamp-6 text-xs leading-relaxed whitespace-pre-wrap text-muted-foreground">
              {description}
            </p>
          )}

          {fields.length > 0 && (
            <dl className="space-y-1.5">
              {fields.slice(0, MAX_FIELDS).map((field) => (
                <div key={field.label}>
                  {/* Stacked rather than two columns: these labels are whole
                      German questions, and a label column narrow enough to
                      leave room for the answer cuts off the part that says
                      which field it is. */}
                  <dt className="truncate text-[10px] uppercase tracking-wide text-muted-foreground">
                    {field.label}
                  </dt>
                  <dd className="truncate text-xs">{field.value.split('\n')[0]}</dd>
                </div>
              ))}
              {fields.length > MAX_FIELDS && (
                <p className="text-[11px] text-muted-foreground">
                  +{fields.length - MAX_FIELDS} weitere Felder
                </p>
              )}
            </dl>
          )}
        </div>

        <div className="min-w-0 space-y-1.5 border-l pl-5 text-xs">
          <Line icon={Building2} value={ticket.company?.name} />
          <Line icon={Phone} value={ticket.company?.companyPhone} />
          <Line icon={User} value={ticket.ticketUser || ticket.ticketCreator} />
          <Line icon={Wrench} value={ticket.ticketTerminatedUser} />
          <Line
            icon={Clock}
            value={age ? `${ticket.created_at} · ${age}` : ticket.created_at}
          />
          {scheduled && <Line icon={CalendarClock} value={`Termin ${scheduled}`} />}
          {ticket.ticketMessagesCount > 0 && (
            <Line
              icon={MessageSquare}
              value={`${ticket.ticketMessagesCount} ${ticket.ticketMessagesCount === 1 ? 'Nachricht' : 'Nachrichten'}`}
            />
          )}
          {ticket.attachments.length > 0 && (
            <Line
              icon={Paperclip}
              value={`${ticket.attachments.length} ${ticket.attachments.length === 1 ? 'Anhang' : 'Anhänge'}`}
            />
          )}
        </div>
      </div>
    </div>
  );
}

/** One icon-and-value row; renders nothing when there is no value. */
function Line({
  icon: Icon,
  value,
  className = '',
}: {
  icon: typeof Building2;
  value?: string | null;
  className?: string;
}) {
  if (!value || !value.trim()) return null;

  return (
    <div className={`flex min-w-0 items-center gap-1.5 text-muted-foreground ${className}`}>
      <Icon className="h-3 w-3 shrink-0" />
      <span className="truncate" title={value}>
        {value}
      </span>
    </div>
  );
}

/** Where the preview should appear: the pointer's x, and the row's edges. */
export interface PreviewAnchor {
  x: number;
  top: number;
  bottom: number;
}

/** Distance kept from the row and from the edges of the window. */
const GAP = 8;
const MARGIN = 12;

/**
 * Places the preview near the row without letting it leave the window.
 *
 * Measured after mount rather than estimated: the card's height depends on how
 * much the ticket actually has — a template with four fields is far taller than
 * a bare one — so the flip to above the row cannot be decided in advance. The
 * card is rendered hidden for that one frame, which is why it never appears in
 * the wrong place first.
 */
export function TicketHoverPreview({
  ticket,
  anchor,
}: {
  ticket: Ticket;
  anchor: PreviewAnchor;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;

    const { width, height } = element.getBoundingClientRect();

    let left = anchor.x + 16;
    if (left + width + MARGIN > window.innerWidth) left = window.innerWidth - width - MARGIN;
    if (left < MARGIN) left = MARGIN;

    // Below the row by preference; above it when that would overflow.
    let top = anchor.bottom + GAP;
    if (top + height + MARGIN > window.innerHeight) top = anchor.top - height - GAP;
    if (top < MARGIN) top = MARGIN;

    setPosition({ left, top });
  }, [anchor, ticket.id]);

  return createPortal(
    <div
      ref={ref}
      // Never interactive: the pointer belongs to the row underneath, and a
      // card that can be hovered would fight the list it is describing.
      className="pointer-events-none fixed z-50"
      style={{
        left: position?.left ?? 0,
        top: position?.top ?? 0,
        visibility: position ? 'visible' : 'hidden',
      }}
    >
      <TicketPreviewCard ticket={ticket} />
    </div>,
    document.body,
  );
}
