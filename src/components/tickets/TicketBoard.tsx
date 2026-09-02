import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  ExternalLink,
  MessageSquare,
  Paperclip,
  Pause,
  Play,
  Search,
  X,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useTickets } from '@/contexts/TicketsContext';
import { WindowManager } from '@/lib/windowManager';
import { parseTicketDate } from '@/lib/ticketDate';
import { isRunning, toPlayerState } from '@/lib/playerStatus';
import { TONE_BADGE, TONE_RAIL, priorityLabel, priorityTone, statusTone } from '@/lib/ticketStatus';
import { SEARCH_FIELDS, SORT_LABELS, parseSearch, removeChip } from '@/lib/searchQuery';
import type { TicketSort } from '@/lib/sync';
import type { Ticket } from '@/types/api';

interface TicketBoardProps {
  onTicketSelect: (ticket: Ticket, preserveCurrentTab?: boolean) => void;
}

const TABS = [
  { key: 'my', label: 'Meine', countKey: 'mine' },
  { key: 'new', label: 'Pool', countKey: 'new' },
  { key: 'all', label: 'Alle', countKey: 'all' },
] as const;

/**
 * The ticket queue as a dispatch board.
 *
 * Dense rows rather than cards: roughly twice as many tickets fit on screen,
 * ids and timers are monospaced so they align into scannable columns, and
 * priority reads from a rail at the left edge without parsing any text.
 *
 * Filtering is expressed in the search box (`firma:`, `status:`, `prio:`) and
 * resolved by SQLite over every synced ticket, which is why the old row of
 * dropdowns is gone.
 */
export function TicketBoard({ onTicketSelect }: TicketBoardProps) {
  const {
    tickets,
    counts,
    isLoading,
    filterState,
    updateFilterState,
    clearFilters,
    navigationState,
    setActiveTab,
    setScrollPosition,
  } = useTickets();

  const [draft, setDraft] = useState(filterState.searchTerm);
  const [showHelp, setShowHelp] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const scrollRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const activeTab = (navigationState.activeTab ?? 'my') as 'my' | 'new' | 'all';
  const rows = useMemo(() => {
    if (activeTab === 'my') return tickets.my_tickets;
    if (activeTab === 'new') return tickets.new_tickets;
    return tickets.all_tickets;
  }, [activeTab, tickets]);

  const parsed = useMemo(() => parseSearch(filterState.searchTerm), [filterState.searchTerm]);

  // Debounce so each keystroke does not re-query the store.
  useEffect(() => {
    if (draft === filterState.searchTerm) return;
    const timer = setTimeout(() => updateFilterState({ searchTerm: draft }), 180);
    return () => clearTimeout(timer);
  }, [draft, filterState.searchTerm, updateFilterState]);

  // Keep the box in step when the query is changed from elsewhere, such as the
  // command palette.
  useEffect(() => {
    setDraft((current) => (current === filterState.searchTerm ? current : filterState.searchTerm));
  }, [filterState.searchTerm]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'f') {
        event.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  // Restore the scroll offset for whichever tab just became active.
  useEffect(() => {
    const container = scrollRefs.current[activeTab];
    if (container) container.scrollTop = navigationState.scrollPositions[activeTab] ?? 0;
    // Only on tab change: re-running on every scroll would fight the user.
  }, [activeTab, navigationState.scrollPositions]);

  const handleScroll = useCallback(
    (event: React.UIEvent<HTMLDivElement>) => {
      setScrollPosition(activeTab, event.currentTarget.scrollTop);
    },
    [activeTab, setScrollPosition],
  );

  const openInWindow = useCallback(async (ticket: Ticket, event: React.MouseEvent) => {
    event.stopPropagation();
    try {
      await WindowManager.openTicketInNewWindow(ticket);
    } catch (error) {
      console.error('Failed to open ticket in new window:', error);
    }
  }, []);

  const hasQuery = filterState.searchTerm.trim().length > 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      {/* Search + sort */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[260px] flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            ref={searchRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onFocus={() => setShowHelp(true)}
            onBlur={() => window.setTimeout(() => setShowHelp(false), 120)}
            placeholder="Suchen — 4812, firma:müller, status:warten, prio:hoch"
            className="h-9 pl-8 pr-8 font-mono text-xs"
            aria-label="Tickets durchsuchen"
          />
          {hasQuery && (
            <button
              type="button"
              onClick={() => {
                setDraft('');
                clearFilters();
                searchRef.current?.focus();
              }}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              aria-label="Suche zurücksetzen"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}

          {showHelp && !hasQuery && (
            <div className="absolute z-20 mt-1 w-full rounded-md border bg-popover p-2 shadow-md">
              <p className="px-1 pb-1.5 text-[11px] text-muted-foreground">Filter direkt eintippen</p>
              <div className="grid gap-0.5">
                {SEARCH_FIELDS.map(({ field, hint }) => (
                  <button
                    key={field}
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      setDraft((d) => `${d ? `${d} ` : ''}${field}:`);
                      searchRef.current?.focus();
                    }}
                    className="flex items-center justify-between rounded px-1.5 py-1 text-left text-xs hover:bg-accent"
                  >
                    <span className="font-mono">{field}:</span>
                    <span className="text-[11px] text-muted-foreground">{hint}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <Select
          value={filterState.sortBy}
          onValueChange={(value) => updateFilterState({ sortBy: value as TicketSort })}
        >
          <SelectTrigger className="h-9 w-[168px] text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(SORT_LABELS) as TicketSort[]).map((key) => (
              <SelectItem key={key} value={key} className="text-xs">
                {SORT_LABELS[key]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Active field terms, removable */}
      {parsed.chips.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          {parsed.chips.map((chip) => (
            <button
              key={chip.raw}
              type="button"
              onClick={() => {
                const next = removeChip(filterState.searchTerm, chip);
                setDraft(next);
                updateFilterState({ searchTerm: next });
              }}
              className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 font-mono text-[11px] hover:bg-accent"
            >
              <span className="text-muted-foreground">{chip.field}:</span>
              <span>{chip.value}</span>
              <X className="h-3 w-3 opacity-60" />
            </button>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div className="flex items-center gap-4 border-b">
        {TABS.map((tab) => {
          const active = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              aria-current={active ? 'page' : undefined}
              className={[
                'relative -mb-px flex items-center gap-1.5 pb-2 text-sm transition-colors',
                active
                  ? 'font-semibold text-foreground after:absolute after:inset-x-0 after:-bottom-px after:h-0.5 after:bg-foreground'
                  : 'text-muted-foreground hover:text-foreground',
              ].join(' ')}
            >
              {tab.label}
              <span className="font-mono text-[11px] tabular-nums opacity-70">
                {counts[tab.countKey]}
              </span>
            </button>
          );
        })}
      </div>

      {/* Board */}
      <div
        ref={(el) => {
          scrollRefs.current[activeTab] = el;
        }}
        onScroll={handleScroll}
        className="min-h-0 flex-1 overflow-auto rounded-md border"
      >
        {isLoading ? (
          <SkeletonRows />
        ) : rows.length === 0 ? (
          <EmptyState
            hasQuery={hasQuery}
            onClear={() => {
              setDraft('');
              clearFilters();
            }}
          />
        ) : (
          <table className="w-full border-collapse text-xs">
            <thead className="sticky top-0 z-10 bg-background">
              <tr className="border-b text-[10px] uppercase tracking-wider text-muted-foreground">
                <th className="w-[3px] p-0" />
                <th className="w-px whitespace-nowrap py-2 pl-3 pr-3 text-left font-medium">Nr.</th>
                <th className="py-2 pr-3 text-left font-medium">Vorgang</th>
                <th className="hidden w-px whitespace-nowrap py-2 pr-3 text-left font-medium md:table-cell">
                  Kunde
                </th>
                <th className="hidden w-px whitespace-nowrap py-2 pr-3 text-left font-medium lg:table-cell">
                  Erstellt
                </th>
                <th className="w-px whitespace-nowrap py-2 pr-3 text-left font-medium">Status</th>
                <th className="w-px py-2 pr-2" />
              </tr>
            </thead>
            <tbody>
              {rows.map((ticket) => (
                <TicketRow
                  key={ticket.id}
                  ticket={ticket}
                  onSelect={() => onTicketSelect(ticket, true)}
                  onOpenWindow={(e) => void openInWindow(ticket, e)}
                />
              ))}
            </tbody>
          </table>
        )}
      </div>

      <p className="text-[11px] text-muted-foreground">
        {rows.length} {rows.length === 1 ? 'Ticket' : 'Tickets'}
        {hasQuery ? ' gefunden' : ''}
      </p>
    </div>
  );
}

function TicketRow({
  ticket,
  onSelect,
  onOpenWindow,
}: {
  ticket: Ticket;
  onSelect: () => void;
  onOpenWindow: (event: React.MouseEvent) => void;
}) {
  const running = isRunning(ticket.playStatus);
  const playing = toPlayerState(ticket.playStatus) !== 'stopped';
  const created = parseTicketDate(ticket.created_at);

  return (
    <tr
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect();
        }
      }}
      tabIndex={0}
      className="group cursor-pointer border-b transition-colors last:border-0 hover:bg-accent/50 focus:bg-accent/50 focus:outline-none"
    >
      {/* Priority rail: severity readable without parsing text. */}
      <td className="p-0">
        <div
          className={`h-8 w-[3px] ${TONE_RAIL[priorityTone(ticket.priority, ticket.index)]}`}
          title={priorityLabel(ticket.priority)}
        />
      </td>

      <td className="whitespace-nowrap py-1.5 pl-3 pr-3 font-mono text-[11px] tabular-nums text-muted-foreground">
        {ticket.id}
      </td>

      <td className="py-1.5 pr-3">
        <div className="flex items-center gap-1.5">
          <span className="truncate font-medium">{ticket.summary || '—'}</span>
          {ticket.attachments.length > 0 && (
            <Paperclip className="h-3 w-3 shrink-0 text-muted-foreground" />
          )}
          {ticket.ticketMessagesCount > 0 && (
            <span className="inline-flex shrink-0 items-center gap-0.5 text-[10px] text-muted-foreground">
              <MessageSquare className="h-3 w-3" />
              {ticket.ticketMessagesCount}
            </span>
          )}
        </div>
        <div className="truncate text-[10px] text-muted-foreground">
          {[ticket.subject, ticket.pool_name, priorityLabel(ticket.priority)]
            .filter(Boolean)
            .join(' · ')}
        </div>
      </td>

      <td className="hidden max-w-[180px] truncate whitespace-nowrap py-1.5 pr-3 text-muted-foreground md:table-cell">
        {ticket.company?.name}
      </td>

      <td className="hidden whitespace-nowrap py-1.5 pr-3 font-mono text-[11px] tabular-nums text-muted-foreground lg:table-cell">
        {created
          ? created.toLocaleDateString(undefined, { day: '2-digit', month: '2-digit' })
          : '—'}
      </td>

      <td className="whitespace-nowrap py-1.5 pr-3">
        <div className="flex items-center gap-1.5">
          {playing &&
            (running ? (
              <Play className="h-3 w-3 fill-tone-success text-tone-success" />
            ) : (
              <Pause className="h-3 w-3 text-tone-warning" />
            ))}
          <Badge
            variant="outline"
            className={`${TONE_BADGE[statusTone(ticket.status)]} px-1.5 py-0 text-[10px] font-medium`}
          >
            {ticket.status || '—'}
          </Badge>
        </div>
      </td>

      <td className="py-1.5 pr-2">
        <Button
          variant="ghost"
          size="icon"
          onClick={onOpenWindow}
          aria-label={`Ticket ${ticket.id} in neuem Fenster öffnen`}
          className="h-6 w-6 opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100"
        >
          <ExternalLink className="h-3 w-3" />
        </Button>
      </td>
    </tr>
  );
}

function SkeletonRows() {
  return (
    <div className="divide-y">
      {Array.from({ length: 12 }, (_, i) => (
        <div key={i} className="flex animate-pulse items-center gap-3 px-3 py-2.5">
          <div className="h-3 w-10 rounded bg-muted" />
          <div className="h-3 flex-1 rounded bg-muted" />
          <div className="h-3 w-24 rounded bg-muted" />
          <div className="h-4 w-16 rounded-full bg-muted" />
        </div>
      ))}
    </div>
  );
}

function EmptyState({ hasQuery, onClear }: { hasQuery: boolean; onClear: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 p-12 text-center">
      <AlertCircle className="h-8 w-8 text-muted-foreground" />
      <div className="space-y-1">
        <p className="text-sm font-medium">
          {hasQuery ? 'Keine Tickets für diese Suche' : 'Keine Tickets in dieser Liste'}
        </p>
        <p className="text-xs text-muted-foreground">
          {hasQuery
            ? 'Die Suche läuft über alle synchronisierten Tickets, nicht nur die sichtbaren.'
            : 'Sobald Tickets zugewiesen werden, erscheinen sie hier.'}
        </p>
      </div>
      {hasQuery && (
        <Button variant="outline" size="sm" onClick={onClear}>
          Suche zurücksetzen
        </Button>
      )}
    </div>
  );
}
