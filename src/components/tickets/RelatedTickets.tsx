import { useCallback, useEffect, useMemo, useState } from 'react';
import { Archive, Building, History, Loader2, Sparkles } from 'lucide-react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { fetchCompanyArchive, queryTickets } from '@/lib/sync';
import { formatTicketAge } from '@/lib/ticketDate';
import type { Ticket } from '@/types/api';
import { TONE_BADGE, statusTone } from '@/lib/ticketStatus';
import { CLOSED_STATUS_ID } from '@/lib/ticketStatusOptions';
import { findSimilarTickets, topKeywords, type SimilarTicket } from '@/lib/ticketSimilarity';
import { TicketHoverPreview } from './TicketPreviewCard';
import { useTicketPreview } from '@/hooks/useTicketPreview';

/** How many of the customer's other tickets to list. */
const HISTORY_LIMIT = 8;
/** How many similar tickets to suggest. */
const SIMILAR_LIMIT = 5;

/**
 * Candidate pool size.
 *
 * Everything happens in SQLite against tickets already on disk, so this is
 * bounded by taste rather than by cost — a few hundred rows scored in the
 * renderer is imperceptible.
 */
const POOL_LIMIT = 200;

interface RelatedTicketsProps {
  ticket: Ticket;
  /** Omitted where navigation is not possible; rows are then not clickable. */
  onSelect?: (ticket: Ticket) => void;
}

/**
 * The customer's other tickets, and tickets that look like this one.
 *
 * Both answer the same question — "have we seen this before?" — and both are
 * limited in the same way: the local store holds every open ticket but only
 * those closed ones whose customer archive has been pulled in. The panel says
 * so and offers to fetch the rest, rather than letting an empty list imply
 * that nothing similar ever happened.
 *
 * `getCompanyById` is the only endpoint that returns closed tickets in bulk,
 * and it repeats the same rows five times over, so that fetch stays behind a
 * button.
 */
export function RelatedTickets({ ticket, onSelect }: RelatedTicketsProps) {
  const [history, setHistory] = useState<Ticket[]>([]);
  const [similar, setSimilar] = useState<SimilarTicket[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isFetchingArchive, setIsFetchingArchive] = useState(false);
  const [archiveLoaded, setArchiveLoaded] = useState(false);
  // Same hover preview as the board: deciding whether a past ticket is the one
  // you remember should not require opening it either.
  const { preview, show: showPreview, hide: hidePreview } = useTicketPreview();

  const companyId = ticket.company?.id ?? 0;

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const keywords = topKeywords(ticket, 2);

      // Two overlapping pools: everything this customer has, plus anything
      // anywhere that shares this ticket's most distinctive word. The second is
      // what surfaces "another site had exactly this".
      const [byCompany, ...byKeyword] = await Promise.all([
        companyId
          ? queryTickets({ companyId, sort: 'date-desc', limit: POOL_LIMIT })
          : Promise.resolve([]),
        ...keywords.map((keyword) =>
          queryTickets({ search: keyword, sort: 'date-desc', limit: POOL_LIMIT }),
        ),
      ]);

      setHistory(byCompany.filter((candidate) => candidate.id !== ticket.id));
      setSimilar(
        findSimilarTickets(ticket, [...byCompany, ...byKeyword.flat()], SIMILAR_LIMIT),
      );
    } catch (error) {
      console.error('Failed to load related tickets:', error);
    } finally {
      setIsLoading(false);
    }
  }, [ticket, companyId]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleLoadArchive = async () => {
    if (!companyId) return;

    setIsFetchingArchive(true);
    try {
      const result = await fetchCompanyArchive(companyId);
      setArchiveLoaded(true);
      toast.success(`${result.cached} archivierte Tickets geladen`, {
        description: `${ticket.company?.name}: ${result.closed} abgeschlossen von ${result.returned}.`,
      });
      await load();
    } catch (error) {
      console.error('Failed to load the customer archive:', error);
      toast.error('Archiv konnte nicht geladen werden');
    } finally {
      setIsFetchingArchive(false);
    }
  };

  const closedCount = useMemo(
    () => history.filter((candidate) => candidate.status_id === CLOSED_STATUS_ID).length,
    [history],
  );

  return (
    <Card className="py-0">
      <div className="flex items-center gap-1.5 border-b px-3 py-2">
        <History className="h-3.5 w-3.5 text-muted-foreground" />
        <h2 className="text-xs font-semibold uppercase tracking-wide">Verwandte Tickets</h2>
      </div>

      <CardContent className="space-y-3 p-3">
        {isLoading ? (
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" />
            Wird gesucht …
          </p>
        ) : (
          <>
            {similar.length > 0 && (
              <Section
                icon={Sparkles}
                title="Ähnliche Vorgänge"
                hint="Nach gemeinsamen Stichwörtern"
              >
                {similar.map((match) => (
                  <Row
                    key={match.ticket.id}
                    ticket={match.ticket}
                    onSelect={onSelect}
                    onHoverStart={showPreview}
                    onHoverEnd={hidePreview}
                    footnote={match.shared.slice(0, 3).join(' · ')}
                  />
                ))}
              </Section>
            )}

            <Section
              icon={Building}
              title={`Weitere Tickets · ${ticket.company?.name || 'Kunde'}`}
              hint={
                history.length > 0
                  ? `${history.length} bekannt, davon ${closedCount} abgeschlossen`
                  : undefined
              }
            >
              {history.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  Keine weiteren Tickets dieses Kunden im lokalen Bestand.
                </p>
              ) : (
                history
                  .slice(0, HISTORY_LIMIT)
                  .map((candidate) => (
                    <Row
                      key={candidate.id}
                      ticket={candidate}
                      onSelect={onSelect}
                      onHoverStart={showPreview}
                      onHoverEnd={hidePreview}
                    />
                  ))
              )}
            </Section>

            {companyId > 0 && !archiveLoaded && (
              <div className="space-y-1.5 border-t pt-2.5">
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full"
                  disabled={isFetchingArchive}
                  onClick={() => void handleLoadArchive()}
                >
                  {isFetchingArchive ? (
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Archive className="mr-1.5 h-3.5 w-3.5" />
                  )}
                  Ganze Historie laden
                </Button>
                <p className="text-[10px] leading-relaxed text-muted-foreground">
                  Abgeschlossene Tickets kommen nicht über die Synchronisierung. Einmal laden,
                  dann sucht auch die Ähnlichkeitssuche darin.
                </p>
              </div>
            )}
          </>
        )}
      </CardContent>

      {preview && <TicketHoverPreview ticket={preview.ticket} anchor={preview.anchor} />}
    </Card>
  );
}

function Section({
  icon: Icon,
  title,
  hint,
  children,
}: {
  icon: typeof Building;
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5">
        <Icon className="h-3 w-3 shrink-0 text-muted-foreground" />
        <h3 className="truncate text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          {title}
        </h3>
      </div>
      {hint && <p className="text-[10px] text-muted-foreground">{hint}</p>}
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

function Row({
  ticket,
  onSelect,
  onHoverStart,
  onHoverEnd,
  footnote,
}: {
  ticket: Ticket;
  onSelect?: (ticket: Ticket) => void;
  onHoverStart: (ticket: Ticket, event: React.MouseEvent<HTMLElement>) => void;
  onHoverEnd: () => void;
  footnote?: string;
}) {
  const age = formatTicketAge(ticket.created_at);

  return (
    <button
      type="button"
      disabled={!onSelect}
      onClick={() => onSelect?.(ticket)}
      onMouseEnter={(event) => onHoverStart(ticket, event)}
      onMouseLeave={onHoverEnd}
      className="w-full rounded px-1.5 py-1 text-left transition-colors enabled:hover:bg-accent disabled:cursor-default"
    >
      <div className="flex items-baseline gap-1.5">
        <span className="shrink-0 font-mono text-[10px] tabular-nums text-muted-foreground">
          {ticket.id}
        </span>
        <span className="min-w-0 flex-1 truncate text-xs">{ticket.summary || '—'}</span>
      </div>
      <div className="mt-0.5 flex items-center gap-1.5">
        <Badge
          variant="outline"
          className={`${TONE_BADGE[statusTone(ticket.status)]} px-1 py-0 text-[9px] font-medium`}
        >
          {ticket.status || '—'}
        </Badge>
        {age && <span className="text-[10px] text-muted-foreground">{age}</span>}
        {footnote && (
          <span className="truncate text-[10px] text-muted-foreground" title={footnote}>
            {footnote}
          </span>
        )}
      </div>
    </button>
  );
}
