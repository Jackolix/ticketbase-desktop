import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BarChart3,
  BookOpen,
  CalendarDays,
  CornerDownLeft,
  LayoutDashboard,
  Loader2,
  Plus,
  Search,
  Settings as SettingsIcon,
  Ticket as TicketIcon,
} from 'lucide-react';

import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { queryTickets } from '@/lib/sync';
import { parseSearch } from '@/lib/searchQuery';
import { TONE_RAIL, priorityTone } from '@/lib/ticketStatus';
import type { Ticket } from '@/types/api';

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onNavigate: (view: string) => void;
  onSelectTicket: (ticket: Ticket) => void;
}

interface ViewAction {
  id: string;
  label: string;
  icon: typeof LayoutDashboard;
}

const VIEWS: ViewAction[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'tickets', label: 'Tickets', icon: TicketIcon },
  { id: 'today', label: 'Heutige Termine', icon: CalendarDays },
  { id: 'new-ticket', label: 'Neues Ticket', icon: Plus },
  { id: 'wiki', label: 'Wissensdatenbank', icon: BookOpen },
  { id: 'reports', label: 'Berichte', icon: BarChart3 },
  { id: 'settings', label: 'Einstellungen', icon: SettingsIcon },
];

const RESULT_LIMIT = 8;

/**
 * Command palette (Ctrl/Cmd+K).
 *
 * Ticket search runs against the local store, so results appear as fast as the
 * user types — this only became worth building once the data was local. It
 * accepts the same structured terms as the board's search box.
 */
export function CommandPalette({
  open,
  onOpenChange,
  onNavigate,
  onSelectTicket,
}: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Ticket[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const requestToken = useRef(0);

  const trimmed = query.trim();

  const views = useMemo(() => {
    if (!trimmed) return VIEWS;
    const needle = trimmed.toLowerCase();
    return VIEWS.filter((v) => v.label.toLowerCase().includes(needle));
  }, [trimmed]);

  // Reset per opening so the palette never reopens mid-search.
  useEffect(() => {
    if (!open) return;
    setQuery('');
    setResults([]);
    setActiveIndex(0);
  }, [open]);

  useEffect(() => {
    if (!open || !trimmed) {
      setResults([]);
      setIsSearching(false);
      return;
    }

    const token = ++requestToken.current;
    setIsSearching(true);

    const timer = setTimeout(async () => {
      try {
        const found = await queryTickets({
          ...parseSearch(trimmed).filters,
          sort: 'date-desc',
          limit: RESULT_LIMIT,
        });
        if (token === requestToken.current) setResults(found);
      } catch (error) {
        console.error('Palette search failed:', error);
        if (token === requestToken.current) setResults([]);
      } finally {
        if (token === requestToken.current) setIsSearching(false);
      }
    }, 120);

    return () => clearTimeout(timer);
  }, [open, trimmed]);

  const items = useMemo(
    () => [
      ...views.map((v) => ({ kind: 'view' as const, view: v })),
      ...results.map((t) => ({ kind: 'ticket' as const, ticket: t })),
    ],
    [views, results],
  );

  useEffect(() => {
    setActiveIndex((i) => Math.min(i, Math.max(0, items.length - 1)));
  }, [items.length]);

  const run = useCallback(
    (index: number) => {
      const item = items[index];
      if (!item) return;

      onOpenChange(false);
      if (item.kind === 'view') onNavigate(item.view.id);
      else onSelectTicket(item.ticket);
    },
    [items, onNavigate, onSelectTicket, onOpenChange],
  );

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((i) => (items.length ? (i + 1) % items.length : 0));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((i) => (items.length ? (i - 1 + items.length) % items.length : 0));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      run(activeIndex);
    }
  };

  // Keep the highlighted row in view when arrowing past the fold.
  useEffect(() => {
    listRef.current
      ?.querySelector<HTMLElement>(`[data-index="${activeIndex}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="top-[20%] max-w-xl translate-y-0 gap-0 overflow-hidden p-0">
        <DialogTitle className="sr-only">Befehle und Tickets suchen</DialogTitle>

        <div className="flex items-center gap-2 border-b px-3">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Ticketnummer, Suchbegriff oder Ansicht…"
            className="h-11 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          {isSearching && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
        </div>

        <div ref={listRef} className="max-h-[320px] overflow-y-auto p-1.5">
          {items.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">
              {trimmed ? 'Nichts gefunden' : 'Tippen, um zu suchen'}
            </p>
          ) : (
            <>
              {views.length > 0 && <SectionLabel>Ansichten</SectionLabel>}
              {views.map((view, i) => (
                <Row
                  key={view.id}
                  index={i}
                  active={activeIndex === i}
                  onHover={setActiveIndex}
                  onClick={() => run(i)}
                >
                  <view.icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="truncate">{view.label}</span>
                </Row>
              ))}

              {results.length > 0 && <SectionLabel>Tickets</SectionLabel>}
              {results.map((ticket, i) => {
                const index = views.length + i;
                return (
                  <Row
                    key={ticket.id}
                    index={index}
                    active={activeIndex === index}
                    onHover={setActiveIndex}
                    onClick={() => run(index)}
                  >
                    <span
                      className={`h-4 w-[3px] shrink-0 rounded-full ${
                        TONE_RAIL[priorityTone(ticket.priority, ticket.index)]
                      }`}
                    />
                    <span className="w-12 shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground">
                      {ticket.id}
                    </span>
                    <span className="truncate">{ticket.summary || '—'}</span>
                    <span className="ml-auto hidden shrink-0 truncate text-[11px] text-muted-foreground sm:block">
                      {ticket.company?.name}
                    </span>
                  </Row>
                );
              })}
            </>
          )}
        </div>

        <div className="flex items-center gap-3 border-t px-3 py-2 text-[11px] text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <CornerDownLeft className="h-3 w-3" /> öffnen
          </span>
          <span>↑↓ navigieren</span>
          <span>Esc schließen</span>
          <span className="ml-auto font-mono">firma: status: prio:</span>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="px-2 pb-1 pt-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
      {children}
    </p>
  );
}

function Row({
  index,
  active,
  onHover,
  onClick,
  children,
}: {
  index: number;
  active: boolean;
  onHover: (index: number) => void;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      data-index={index}
      role="option"
      aria-selected={active}
      onMouseMove={() => onHover(index)}
      onClick={onClick}
      className={[
        'flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm',
        active ? 'bg-accent text-accent-foreground' : '',
      ].join(' ')}
    >
      {children}
    </div>
  );
}
