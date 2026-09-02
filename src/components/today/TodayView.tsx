import { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarDays, CheckCircle2, Clock, Pause, Play, Timer } from 'lucide-react';

import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { onSyncChanged, queryTickets } from '@/lib/sync';
import { compareTicketDates, parseTicketDate } from '@/lib/ticketDate';
import { isRunning, toPlayerState } from '@/lib/playerStatus';
import { TONE_BADGE, TONE_RAIL, priorityLabel, priorityTone, statusTone } from '@/lib/ticketStatus';
import { Ticket } from '@/types/api';

interface TodayViewProps {
  onTicketSelect: (ticket: Ticket) => void;
}

/**
 * Today's schedule, as a timeline of what is booked.
 *
 * Reads the local store rather than calling getTicketsToday, so it is instant
 * and shares one source of truth with the board and dashboard. The two resolve
 * to the same set in practice: getTicketsToday selects the user's tickets
 * scheduled today and not closed, which is the `mine` bucket filtered by
 * ticket_start. They differ only for a ticket still in status "Neu" that
 * already has an owner — which claiming a ticket makes impossible, since that
 * moves it to "Zugewiesen".
 */
export function TodayView({ onTicketSelect }: TodayViewProps) {
  const [mine, setMine] = useState<Ticket[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const loadFromStore = useCallback(async () => {
    try {
      setMine(await queryTickets({ bucket: 'mine' }));
    } catch (error) {
      console.error('Failed to read tickets from the local store:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadFromStore();
  }, [loadFromStore]);

  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | undefined;

    void onSyncChanged(() => void loadFromStore()).then((off) => {
      if (disposed) off();
      else unlisten = off;
    });

    return () => {
      disposed = true;
      if (unlisten) unlisten();
    };
  }, [loadFromStore]);

  const scheduled = useMemo(() => {
    const today = new Date().toDateString();
    return mine
      .filter((t) => parseTicketDate(t.ticket_start)?.toDateString() === today)
      .sort((a, b) => compareTicketDates(a.ticket_start, b.ticket_start));
  }, [mine]);

  const running = useMemo(
    () => mine.filter((t) => toPlayerState(t.playStatus) !== 'stopped'),
    [mine],
  );

  const done = useMemo(
    () => scheduled.filter((t) => statusTone(t.status) === 'success'),
    [scheduled],
  );

  const now = new Date();
  const heading = now.toLocaleDateString(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

  if (isLoading) return <TodaySkeleton />;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="flex items-center gap-2 text-lg font-semibold">
          <CalendarDays className="h-5 w-5" />
          {heading}
        </h1>
        <p className="text-sm text-muted-foreground">
          {scheduled.length === 0
            ? 'Für heute ist nichts terminiert.'
            : `${scheduled.length} ${scheduled.length === 1 ? 'Termin' : 'Termine'}, ${done.length} abgeschlossen.`}
        </p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Stat label="Terminiert" value={scheduled.length} icon={Clock} />
        <Stat
          label="Läuft"
          value={running.length}
          icon={Timer}
          tone={running.length > 0 ? 'active' : undefined}
        />
        <Stat label="Abgeschlossen" value={done.length} icon={CheckCircle2} />
      </div>

      <Card className="overflow-hidden py-0">
        <div className="border-b px-3 py-2">
          <h2 className="text-xs font-semibold uppercase tracking-wide">Tagesplan</h2>
        </div>

        {scheduled.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-3 py-12 text-center">
            <CalendarDays className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm font-medium">Keine Termine für heute</p>
            <p className="text-xs text-muted-foreground">
              Terminierte Tickets erscheinen hier automatisch.
            </p>
          </div>
        ) : (
          <ul className="divide-y">
            {scheduled.map((ticket) => {
              const start = parseTicketDate(ticket.ticket_start);
              const past = start ? start < now : false;
              const active = toPlayerState(ticket.playStatus) !== 'stopped';

              return (
                <li key={ticket.id}>
                  <button
                    type="button"
                    onClick={() => onTicketSelect(ticket)}
                    className="flex w-full items-start gap-3 px-3 py-2.5 text-left hover:bg-accent/50 focus:bg-accent/50 focus:outline-none"
                  >
                    {/* Time is the spine of this view, so it leads. */}
                    <span
                      className={[
                        'w-12 shrink-0 pt-0.5 font-mono text-sm tabular-nums',
                        past && !active ? 'text-muted-foreground' : 'font-semibold',
                      ].join(' ')}
                    >
                      {start
                        ? start.toLocaleTimeString(undefined, {
                            hour: '2-digit',
                            minute: '2-digit',
                          })
                        : '--:--'}
                    </span>

                    <span
                      className={`mt-1 h-8 w-[3px] shrink-0 rounded-full ${
                        TONE_RAIL[priorityTone(ticket.priority, ticket.index)]
                      }`}
                    />

                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5">
                        <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
                          {ticket.id}
                        </span>
                        <span className="truncate text-sm font-medium">
                          {ticket.summary || '—'}
                        </span>
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {[ticket.company?.name, ticket.subject, priorityLabel(ticket.priority)]
                          .filter(Boolean)
                          .join(' · ')}
                      </span>
                    </span>

                    <span className="flex shrink-0 items-center gap-1.5">
                      {active &&
                        (isRunning(ticket.playStatus) ? (
                          <Play className="h-3 w-3 fill-tone-success text-tone-success" />
                        ) : (
                          <Pause className="h-3 w-3 text-tone-warning" />
                        ))}
                      <Badge
                        variant="outline"
                        className={`${TONE_BADGE[statusTone(ticket.status)]} px-1.5 py-0 text-[10px]`}
                      >
                        {ticket.status || '—'}
                      </Badge>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}

function Stat({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string;
  value: number;
  icon: typeof Clock;
  tone?: 'active';
}) {
  const accent = tone === 'active' ? 'text-tone-active' : '';
  return (
    <Card className="gap-0 py-0">
      <CardContent className="flex items-start justify-between gap-2 p-3">
        <div className="min-w-0">
          <p className="truncate text-[11px] uppercase tracking-wide text-muted-foreground">
            {label}
          </p>
          <p className={`mt-0.5 text-xl font-semibold leading-none tabular-nums ${accent}`}>
            {value}
          </p>
        </div>
        <Icon className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${accent || 'text-muted-foreground'}`} />
      </CardContent>
    </Card>
  );
}

function TodaySkeleton() {
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-3 gap-3">
        {Array.from({ length: 3 }, (_, i) => (
          <Card key={i} className="animate-pulse">
            <CardContent className="space-y-2 p-3">
              <div className="h-2 w-20 rounded bg-muted" />
              <div className="h-6 w-10 rounded bg-muted" />
            </CardContent>
          </Card>
        ))}
      </div>
      <Card className="animate-pulse">
        <CardContent className="space-y-2 p-3">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="h-8 rounded bg-muted" />
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
