import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Inbox, Play, TicketCheck, TrendingUp } from 'lucide-react';

import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/contexts/AuthContext';
import { onSyncChanged, queryTickets } from '@/lib/sync';
import { compareTicketDates, parseTicketDate } from '@/lib/ticketDate';
import { isRunning, toPlayerState } from '@/lib/playerStatus';
import { TONE_BADGE, TONE_RAIL, priorityLabel, priorityTone, statusTone } from '@/lib/ticketStatus';
import { Ticket } from '@/types/api';

interface DashboardProps {
  onTicketSelect: (ticket: Ticket, preserveCurrentTab?: boolean) => void;
}

/**
 * Start-of-shift overview.
 *
 * Organised around what a technician needs to decide next — what is running,
 * what is unclaimed and urgent, what is scheduled — rather than a row of
 * totals. Everything reads from the local store, so it costs no network call.
 */
export function Dashboard({ onTicketSelect }: DashboardProps) {
  const { user } = useAuth();
  const [mine, setMine] = useState<Ticket[]>([]);
  const [pool, setPool] = useState<Ticket[]>([]);
  const [all, setAll] = useState<Ticket[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const loadFromStore = useCallback(async () => {
    try {
      const [myTickets, poolTickets, allTickets] = await Promise.all([
        queryTickets({ bucket: 'mine' }),
        queryTickets({ bucket: 'new' }),
        queryTickets({ bucket: 'all' }),
      ]);
      setMine(myTickets);
      setPool(poolTickets);
      setAll(allTickets);
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

  const everything = useMemo(() => {
    // A ticket can sit in more than one bucket; count it once.
    const seen = new Map<number, Ticket>();
    for (const t of [...mine, ...pool, ...all]) seen.set(t.id, t);
    return [...seen.values()];
  }, [mine, pool, all]);

  const running = useMemo(
    () => mine.filter((t) => toPlayerState(t.playStatus) !== 'stopped'),
    [mine],
  );

  const urgentPool = useMemo(
    () =>
      pool
        .filter((t) => priorityTone(t.priority, t.index) === 'danger')
        .sort((a, b) => b.index - a.index),
    [pool],
  );

  const scheduledToday = useMemo(() => {
    const today = new Date().toDateString();
    return mine
      .filter((t) => parseTicketDate(t.ticket_start)?.toDateString() === today)
      .sort((a, b) => compareTicketDates(a.ticket_start, b.ticket_start));
  }, [mine]);

  const recent = useMemo(
    () => [...everything].sort((a, b) => compareTicketDates(b.created_at, a.created_at)).slice(0, 8),
    [everything],
  );

  if (isLoading) return <DashboardSkeleton />;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-lg font-semibold">Willkommen zurück, {user?.name}</h1>
        <p className="text-sm text-muted-foreground">
          {running.length > 0
            ? `${running.length} ${running.length === 1 ? 'Ticket läuft' : 'Tickets laufen'} gerade.`
            : 'Aktuell läuft kein Timer.'}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Meine Tickets" value={mine.length} icon={TicketCheck} />
        <Stat label="Im Pool" value={pool.length} icon={Inbox} />
        <Stat
          label="Dringend im Pool"
          value={urgentPool.length}
          icon={AlertTriangle}
          tone={urgentPool.length > 0 ? 'danger' : undefined}
        />
        <Stat
          label="Läuft gerade"
          value={running.length}
          icon={Play}
          tone={running.length > 0 ? 'active' : undefined}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel
          title="Läuft gerade"
          empty="Kein Timer aktiv."
          tickets={running}
          onSelect={onTicketSelect}
          renderMeta={(t) => (
            <span className={isRunning(t.playStatus) ? 'text-tone-success' : 'text-tone-warning'}>
              {isRunning(t.playStatus) ? 'läuft' : 'pausiert'}
            </span>
          )}
        />

        <Panel
          title="Dringend im Pool"
          empty="Nichts Dringendes offen."
          tickets={urgentPool.slice(0, 8)}
          onSelect={onTicketSelect}
          renderMeta={(t) => <span>{priorityLabel(t.priority)}</span>}
        />

        <Panel
          title="Heute terminiert"
          empty="Für heute ist nichts terminiert."
          tickets={scheduledToday}
          onSelect={onTicketSelect}
          renderMeta={(t) => (
            <span className="font-mono tabular-nums">
              {parseTicketDate(t.ticket_start)?.toLocaleTimeString(undefined, {
                hour: '2-digit',
                minute: '2-digit',
              }) ?? '—'}
            </span>
          )}
        />

        <Panel
          title="Zuletzt erstellt"
          empty="Keine Tickets."
          tickets={recent}
          onSelect={onTicketSelect}
          renderMeta={(t) => (
            <span className="font-mono tabular-nums">
              {parseTicketDate(t.created_at)?.toLocaleDateString(undefined, {
                day: '2-digit',
                month: '2-digit',
              }) ?? '—'}
            </span>
          )}
        />
      </div>
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
  icon: typeof TrendingUp;
  tone?: 'danger' | 'active';
}) {
  const accent =
    tone === 'danger' ? 'text-tone-danger' : tone === 'active' ? 'text-tone-active' : '';

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

function Panel({
  title,
  empty,
  tickets,
  onSelect,
  renderMeta,
}: {
  title: string;
  empty: string;
  tickets: Ticket[];
  onSelect: (ticket: Ticket, preserveCurrentTab?: boolean) => void;
  renderMeta: (ticket: Ticket) => React.ReactNode;
}) {
  return (
    <Card className="overflow-hidden py-0">
      <div className="flex items-center justify-between border-b px-3 py-2">
        <h2 className="text-xs font-semibold uppercase tracking-wide">{title}</h2>
        <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
          {tickets.length}
        </span>
      </div>

      {tickets.length === 0 ? (
        <p className="px-3 py-6 text-center text-xs text-muted-foreground">{empty}</p>
      ) : (
        <ul className="divide-y">
          {tickets.map((ticket) => (
            <li key={ticket.id}>
              <button
                type="button"
                onClick={() => onSelect(ticket)}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs hover:bg-accent/50 focus:bg-accent/50 focus:outline-none"
              >
                <span
                  className={`h-6 w-[3px] shrink-0 rounded-full ${
                    TONE_RAIL[priorityTone(ticket.priority, ticket.index)]
                  }`}
                />
                <span className="w-11 shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground">
                  {ticket.id}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{ticket.summary || '—'}</span>
                  <span className="block truncate text-[10px] text-muted-foreground">
                    {ticket.company?.name}
                  </span>
                </span>
                <span className="shrink-0 text-[10px] text-muted-foreground">
                  {renderMeta(ticket)}
                </span>
                <Badge
                  variant="outline"
                  className={`${TONE_BADGE[statusTone(ticket.status)]} hidden shrink-0 px-1.5 py-0 text-[10px] sm:inline-flex`}
                >
                  {ticket.status || '—'}
                </Badge>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Card key={i} className="animate-pulse">
            <CardContent className="space-y-2 p-3">
              <div className="h-2 w-20 rounded bg-muted" />
              <div className="h-6 w-10 rounded bg-muted" />
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {Array.from({ length: 4 }, (_, i) => (
          <Card key={i} className="animate-pulse">
            <CardContent className="space-y-2 p-3">
              {Array.from({ length: 4 }, (_, r) => (
                <div key={r} className="h-6 rounded bg-muted" />
              ))}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
