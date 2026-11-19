import { forwardRef, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  Archive,
  Building2,
  ExternalLink,
  Loader2,
  MessageSquare,
  Paperclip,
  Pause,
  Play,
  Search,
  Type,
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
import { useTickets, type BoardTab } from '@/contexts/TicketsContext';
import { WindowManager } from '@/lib/windowManager';
import { parseTicketDate } from '@/lib/ticketDate';
import { isRunning, toPlayerState } from '@/lib/playerStatus';
import { TONE_BADGE, TONE_RAIL, priorityLabel, priorityTone, statusTone } from '@/lib/ticketStatus';
import { TICKET_STATUS_OPTIONS } from '@/lib/ticketStatusOptions';
import {
  DENSITY,
  DENSITY_LABELS,
  readDensity,
  writeDensity,
  type Density,
  type DensityTokens,
} from '@/lib/density';
import {
  PRIORITY_SUGGESTIONS,
  SEARCH_FIELDS,
  SORT_LABELS,
  activeTermAt,
  fieldsMatching,
  parseSearch,
  removeChip,
  replaceWord,
  setTermValue,
  wordAt,
} from '@/lib/searchQuery';
import { containsAll, excerpt, fold, highlight, searchWords } from '@/lib/searchHighlight';
import { normalizeTicketText } from '@/lib/richText';
import { searchCustomers, type Customer, type TicketSort } from '@/lib/sync';
import { useHotkey } from '@/hooks/useHotkey';
import { ScheduleTicketDialog, TicketRowMenu } from './TicketRowMenu';
import { TicketHoverPreview } from './TicketPreviewCard';
import { useTicketPreview } from '@/hooks/useTicketPreview';
import { shouldVirtualize, virtualWindow } from '@/lib/virtualWindow';
import type { Ticket } from '@/types/api';

interface TicketBoardProps {
  onTicketSelect: (ticket: Ticket, preserveCurrentTab?: boolean) => void;
}

const TABS = [
  { key: 'my', label: 'Meine', countKey: 'mine' },
  { key: 'new', label: 'Pool', countKey: 'new' },
  { key: 'all', label: 'Alle', countKey: 'all' },
  { key: 'archive', label: 'Archiv', countKey: 'archive' },
] as const;

const DENSITIES: Density[] = ['compact', 'comfortable', 'large'];

/**
 * The ticket queue as a dispatch board.
 *
 * Rows rather than cards: ids and timers are monospaced so they align into
 * scannable columns, and priority reads from a rail at the left edge without
 * parsing any text. How large those rows are is a preference — see `density` —
 * because "as many tickets as possible" and "readable without leaning in" are
 * not the same requirement and this list has to serve both.
 *
 * Filtering is expressed in the search box (`firma:`, `status:`, `prio:`) and
 * resolved by SQLite, which is why the old row of dropdowns is gone. The box
 * completes those terms as they are typed, so `firma:` does not require anyone
 * to know how a company is spelled in the database.
 *
 * The Archiv tab is not a fourth server-side list. `getTicketsQuery` filters
 * `status_id != 4`, so closed tickets are unreachable by syncing and have to be
 * fetched deliberately — by number, or one customer at a time.
 *
 * A row is terse by design, so two things reach past it without opening the
 * ticket: hovering shows the full preview, and right-clicking offers the
 * actions — starting the clock, taking the ticket, scheduling it — that
 * otherwise cost a round trip through the detail page.
 */
export function TicketBoard({ onTicketSelect }: TicketBoardProps) {
  const {
    tickets,
    counts,
    isLoading,
    isRefreshing,
    filterState,
    updateFilterState,
    clearFilters,
    navigationState,
    setActiveTab,
    setScrollPosition,
    archiveState,
    loadCompanyArchive,
    isLookingUpNumber,
  } = useTickets();

  const [draft, setDraft] = useState(filterState.searchTerm);
  const [caret, setCaret] = useState(filterState.searchTerm.length);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [highlighted, setHighlighted] = useState(0);
  const [customerHits, setCustomerHits] = useState<Customer[]>([]);
  const [density, setDensity] = useState<Density>(readDensity);
  /** The ticket whose scheduling dialog is open, if any. */
  const [scheduleTarget, setScheduleTarget] = useState<Ticket | null>(null);
  const { preview, show: showPreview, hide: hidePreview } = useTicketPreview();

  const searchRef = useRef<HTMLInputElement>(null);
  const scrollRefs = useRef<Record<string, HTMLDivElement | null>>({});
  /** Where to put the caret after a suggestion rewrote the query. */
  const pendingCaret = useRef<number | null>(null);
  /**
   * Scroll position and viewport height of the active list, for windowing.
   *
   * Kept in state rather than read during render so the window recomputes when
   * the list is scrolled, and only then.
   */
  const [viewport, setViewport] = useState({ scrollTop: 0, height: 0 });
  /** Measured height of one row; 0 until the first row has been laid out. */
  const [rowHeight, setRowHeight] = useState(0);

  const tokens = DENSITY[density];
  const activeTab = (navigationState.activeTab ?? 'my') as BoardTab;

  const rows = useMemo(() => {
    if (activeTab === 'my') return tickets.my_tickets;
    if (activeTab === 'new') return tickets.new_tickets;
    if (activeTab === 'archive') return tickets.archive_tickets;
    return tickets.all_tickets;
  }, [activeTab, tickets]);

  const parsed = useMemo(() => parseSearch(filterState.searchTerm), [filterState.searchTerm]);
  const activeTerm = useMemo(() => activeTermAt(draft, caret), [draft, caret]);
  /** The plain word being typed, when the caret is not in a `field:` term. */
  const activeWord = useMemo(
    () => (activeTerm ? null : wordAt(draft, caret)),
    [activeTerm, draft, caret],
  );

  /** What the rows highlight: the free-text words, and the company term. */
  const words = useMemo(() => searchWords(parsed.filters.search), [parsed.filters.search]);
  const companyWords = useMemo(
    () => (parsed.filters.companyName ? [...words, parsed.filters.companyName] : words),
    [words, parsed.filters.companyName],
  );

  // Debounce so each keystroke does not re-query the store.
  useEffect(() => {
    if (draft === filterState.searchTerm) return;
    const timer = setTimeout(() => updateFilterState({ searchTerm: draft }), 150);
    return () => clearTimeout(timer);
  }, [draft, filterState.searchTerm, updateFilterState]);

  // Keep the box in step when the query is changed from elsewhere, such as the
  // command palette.
  useEffect(() => {
    setDraft((current) => (current === filterState.searchTerm ? current : filterState.searchTerm));
  }, [filterState.searchTerm]);

  // Restoring the caret has to happen after React has written the new value,
  // or the browser puts it back at the end of the input.
  useEffect(() => {
    if (pendingCaret.current === null) return;
    const position = pendingCaret.current;
    pendingCaret.current = null;
    searchRef.current?.setSelectionRange(position, position);
    setCaret(position);
  }, [draft]);

  useHotkey('mod+f', (event) => {
    event.preventDefault();
    searchRef.current?.focus();
    searchRef.current?.select();
  });

  // Restore the scroll offset for whichever tab just became active.
  useEffect(() => {
    const container = scrollRefs.current[activeTab];
    if (container) container.scrollTop = navigationState.scrollPositions[activeTab] ?? 0;
    // Only on tab change: re-running on every scroll would fight the user.
  }, [activeTab, navigationState.scrollPositions]);

  /**
   * Company suggestions for the term being typed.
   *
   * Answered from the cached customer list in SQLite, so the short debounce is
   * about not thrashing React rather than about sparing the backend.
   */
  // A plain word of three letters or more is checked against the customer
  // list too, so typing "müller" can offer to filter by that customer.
  const customerNeedle =
    activeTerm?.filter === 'companyName'
      ? activeTerm.value
      : activeWord && activeWord.text.length >= 3 && !/^\d+$/.test(activeWord.text)
        ? activeWord.text
        : null;
  const customerLimit = activeTerm ? 8 : 4;

  useEffect(() => {
    if (customerNeedle === null) {
      setCustomerHits([]);
      return;
    }

    let cancelled = false;
    const needle = customerNeedle;
    const timer = setTimeout(() => {
      void searchCustomers(needle, customerLimit)
        .then((hits) => {
          if (!cancelled) setCustomerHits(hits);
        })
        .catch(() => {
          // No suggestions is a fine outcome; the term still works typed out.
          if (!cancelled) setCustomerHits([]);
        });
    }, 80);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [customerNeedle, customerLimit]);

  const applyTerm = useCallback(
    (value: string) => {
      if (!activeTerm) return;
      const { text, caret: next } = setTermValue(draft, activeTerm, value);
      pendingCaret.current = next;
      setDraft(text);
      setShowSuggestions(false);
      searchRef.current?.focus();
    },
    [activeTerm, draft],
  );

  const insertField = useCallback((field: string) => {
    setDraft((current) => {
      const next = `${current ? `${current.trimEnd()} ` : ''}${field}:`;
      pendingCaret.current = next.length;
      return next;
    });
    searchRef.current?.focus();
  }, []);

  /** Turns the plain word under the caret into a field term. */
  const applyWord = useCallback(
    (field: string, value: string) => {
      if (!activeWord) return;
      const { text, caret: next } = replaceWord(draft, activeWord, field, value);
      pendingCaret.current = next;
      setDraft(text);
      setShowSuggestions(false);
      searchRef.current?.focus();
    },
    [activeWord, draft],
  );

  /**
   * What the dropdown offers, depending on where the caret is.
   *
   *   * In a `field:` term — values for it, the first one preselected, since
   *     finishing the term is plainly what is going on.
   *   * In a plain word — filters it might have meant ("müller" → the customer
   *     Müller Logistik), with nothing preselected: Enter must still just
   *     search, not swap the word for something the user did not pick.
   *   * In an empty box — the available fields, as a reminder.
   */
  const { suggestions, preselect } = useMemo<{ suggestions: Suggestion[]; preselect: boolean }>(() => {
    const customerSuggestion = (customer: Customer, apply: () => void, group?: string) => ({
      key: `c-${customer.id}`,
      group,
      primary: customer.name,
      secondary: [customer.number, [customer.zip, customer.location].filter(Boolean).join(' ')]
        .filter(Boolean)
        .join(' · '),
      muted: customer.passive !== 0,
      apply,
    });

    if (activeTerm?.filter === 'companyName') {
      return {
        preselect: true,
        suggestions: customerHits.map((customer) =>
          customerSuggestion(customer, () => applyTerm(customer.name), 'Kunden — Name oder Kundennummer'),
        ),
      };
    }

    if (activeTerm?.filter === 'status') {
      const needle = fold(activeTerm.value);
      return {
        preselect: true,
        suggestions: TICKET_STATUS_OPTIONS.filter((option) => fold(option.label).includes(needle)).map(
          (option) => ({
            key: `s-${option.id}`,
            primary: option.label,
            apply: () => applyTerm(option.label),
          }),
        ),
      };
    }

    if (activeTerm?.filter === 'priority') {
      const needle = fold(activeTerm.value);
      return {
        preselect: true,
        suggestions: PRIORITY_SUGGESTIONS.filter((option) => fold(option.value).includes(needle)).map(
          (option) => ({
            key: `p-${option.value}`,
            primary: option.label,
            apply: () => applyTerm(option.value),
          }),
        ),
      };
    }

    if (activeTerm?.filter === 'dateFrom' || activeTerm?.filter === 'dateTo') {
      return {
        preselect: true,
        suggestions: dateSuggestions(activeTerm.filter).map((option) => ({
          key: `d-${option.label}`,
          primary: option.label,
          secondary: option.value,
          apply: () => applyTerm(option.value),
        })),
      };
    }

    if (activeWord) {
      const fields = fieldsMatching(activeWord.text).map((field) => ({
        key: `f-${field.field}`,
        group: 'Filter',
        primary: `${field.field}:`,
        secondary: field.hint,
        mono: true,
        apply: () => {
          const { text, caret: next } = replaceWord(draft, activeWord, field.field, '');
          // replaceWord leaves `field:` followed by a separator; the caret
          // belongs right after the colon so the value can be typed.
          pendingCaret.current = activeWord.start + field.field.length + 1;
          setDraft(text.slice(0, pendingCaret.current) + text.slice(next));
          searchRef.current?.focus();
        },
      }));

      const customers = customerHits.map((customer) =>
        customerSuggestion(customer, () => applyWord('firma', customer.name), 'Nur Tickets von Kunde'),
      );

      const needle = fold(activeWord.text);
      const statuses =
        needle.length >= 3
          ? TICKET_STATUS_OPTIONS.filter((option) => fold(option.label).includes(needle)).map(
              (option) => ({
                key: `s-${option.id}`,
                group: 'Nur Tickets mit Status',
                primary: option.label,
                apply: () => applyWord('status', option.label),
              }),
            )
          : [];

      return { preselect: false, suggestions: [...fields, ...customers, ...statuses] };
    }

    if (!activeTerm && draft.trim() === '') {
      return {
        preselect: false,
        suggestions: SEARCH_FIELDS.map((field) => ({
          key: `f-${field.field}`,
          group: 'Filter — oder einfach Stichworte, Nummer, Kunde tippen',
          primary: `${field.field}:`,
          secondary: field.hint,
          mono: true,
          apply: () => insertField(field.field),
        })),
      };
    }

    return { preselect: false, suggestions: [] };
  }, [activeTerm, activeWord, customerHits, applyTerm, applyWord, insertField, draft]);

  // A changed suggestion list must not leave the highlight pointing past its end.
  useEffect(() => {
    setHighlighted(preselect ? 0 : -1);
  }, [suggestions.length, activeTerm?.field, preselect]);

  const suggestionsOpen = showSuggestions && suggestions.length > 0;

  /** Moves focus from the search box into the list. */
  const focusFirstRow = useCallback(() => {
    const row = scrollRefs.current[activeTab]?.querySelector<HTMLElement>('tr[data-ticket-row]');
    row?.focus();
    return Boolean(row);
  }, [activeTab]);

  const onSearchKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (event.key === 'Escape') {
        // Close the suggestions first, and only those: the board-level Escape
        // clears the whole query, which is not what someone dismissing a
        // dropdown meant.
        if (suggestionsOpen) event.stopPropagation();
        setShowSuggestions(false);
        return;
      }

      if (suggestionsOpen && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
        event.preventDefault();
        const step = event.key === 'ArrowDown' ? 1 : -1;
        setHighlighted((index) => {
          const from = index < 0 ? (step > 0 ? -1 : 0) : index;
          return (from + step + suggestions.length) % suggestions.length;
        });
        return;
      }

      if (suggestionsOpen && highlighted >= 0 && (event.key === 'Enter' || event.key === 'Tab')) {
        event.preventDefault();
        suggestions[highlighted]?.apply();
        return;
      }

      if (event.key === 'ArrowDown') {
        // Into the results, so the keyboard never has to leave the board.
        if (focusFirstRow()) event.preventDefault();
        else setShowSuggestions(true);
        return;
      }

      if (event.key === 'Enter') {
        event.preventDefault();
        setShowSuggestions(false);
        // Search now rather than after the debounce.
        if (draft !== filterState.searchTerm) {
          updateFilterState({ searchTerm: draft });
          return;
        }
        // When the answer is unambiguous, Enter opens it: the ticket whose
        // number was typed, or the only result there is.
        const number = parsed.filters.id ?? parsed.number;
        const target =
          (number !== undefined && rows.find((ticket) => ticket.id === number)) ||
          (rows.length === 1 ? rows[0] : undefined);
        if (target) onTicketSelect(target, true);
      }
    },
    [
      suggestionsOpen,
      suggestions,
      highlighted,
      focusFirstRow,
      draft,
      filterState.searchTerm,
      updateFilterState,
      parsed,
      rows,
      onTicketSelect,
    ],
  );

  const syncCaret = useCallback((event: React.SyntheticEvent<HTMLInputElement>) => {
    setCaret(event.currentTarget.selectionStart ?? event.currentTarget.value.length);
  }, []);

  // Switching tabs must not strand a card on screen with no row under it.
  useEffect(() => hidePreview, [activeTab, rows, hidePreview]);

  /**
   * Measures one row so the spacers can stand in for the rest.
   *
   * Re-measured whenever the density changes, since that is what row height
   * depends on. Rows are uniform within a density — two lines of text, always
   * — so one measurement describes them all.
   */
  const measureRow = useCallback((el: HTMLTableRowElement | null) => {
    if (!el) return;
    const height = el.getBoundingClientRect().height;
    if (height > 0) setRowHeight((current) => (current === height ? current : height));
  }, []);

  useEffect(() => setRowHeight(0), [density]);

  // Track the viewport of whichever list is showing.
  useEffect(() => {
    const container = scrollRefs.current[activeTab];
    if (!container) return;

    setViewport({ scrollTop: container.scrollTop, height: container.clientHeight });

    const observer = new ResizeObserver(() => {
      setViewport((current) => ({ ...current, height: container.clientHeight }));
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, [activeTab, isLoading]);

  const windowed = useMemo(
    () =>
      virtualWindow({
        count: rows.length,
        rowHeight,
        scrollTop: viewport.scrollTop,
        viewportHeight: viewport.height,
      }),
    [rows.length, rowHeight, viewport.scrollTop, viewport.height],
  );

  const handleScroll = useCallback(
    (event: React.UIEvent<HTMLDivElement>) => {
      hidePreview();
      const { scrollTop, clientHeight } = event.currentTarget;
      setViewport({ scrollTop, height: clientHeight });
      setScrollPosition(activeTab, scrollTop);
    },
    [activeTab, setScrollPosition, hidePreview],
  );

  const openInWindow = useCallback(async (ticket: Ticket, event: React.MouseEvent) => {
    event.stopPropagation();
    try {
      await WindowManager.openTicketInNewWindow(ticket);
    } catch (error) {
      console.error('Failed to open ticket in new window:', error);
    }
  }, []);

  const changeDensity = useCallback((value: Density) => {
    setDensity(value);
    writeDensity(value);
  }, []);

  const hasQuery = filterState.searchTerm.trim().length > 0;

  const matchCounts: Record<BoardTab, number> = {
    my: tickets.my_tickets.length,
    new: tickets.new_tickets.length,
    all: tickets.all_tickets.length,
    archive: tickets.archive_tickets.length,
  };

  /** Where the search did find something, when this tab came up empty. */
  const elsewhereTab =
    hasQuery && rows.length === 0
      ? TABS.filter((tab) => tab.key !== activeTab && matchCounts[tab.key] > 0).sort(
          (a, b) => matchCounts[b.key] - matchCounts[a.key],
        )[0]
      : undefined;
  const elsewhere = elsewhereTab
    ? { key: elsewhereTab.key, label: elsewhereTab.label, count: matchCounts[elsewhereTab.key] }
    : null;

  const resetSearch = useCallback(() => {
    setDraft('');
    setCaret(0);
    clearFilters();
  }, [clearFilters]);

  // Escape empties the search. Only when there is one — otherwise the key
  // would appear to do nothing, which is worse than not binding it.
  useHotkey('escape', () => resetSearch(), { enabled: hasQuery || draft.length > 0 });

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      {/* Search, sort and text size */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[280px] flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            ref={searchRef}
            value={draft}
            onChange={(event) => {
              setDraft(event.target.value);
              syncCaret(event);
              setShowSuggestions(true);
            }}
            onSelect={syncCaret}
            onClick={syncCaret}
            onKeyUp={syncCaret}
            onKeyDown={onSearchKeyDown}
            onFocus={() => setShowSuggestions(true)}
            onBlur={() => window.setTimeout(() => setShowSuggestions(false), 120)}
            placeholder="Suchen nach Nummer, Stichwort, Kunde, Kontakt …"
            className="h-10 pl-9 pr-9 text-sm"
            aria-label="Tickets durchsuchen"
            aria-expanded={suggestionsOpen}
            aria-autocomplete="list"
            role="combobox"
            aria-controls="ticket-search-suggestions"
          />
          {hasQuery && (
            <button
              type="button"
              onClick={() => {
                resetSearch();
                searchRef.current?.focus();
              }}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              aria-label="Suche zurücksetzen"
            >
              <X className="h-4 w-4" />
            </button>
          )}

          {suggestionsOpen && (
            <ul
              id="ticket-search-suggestions"
              role="listbox"
              className="absolute z-20 mt-1 max-h-72 w-full overflow-auto rounded-md border bg-popover p-1 shadow-md"
            >
              {suggestions.map((suggestion, index) => (
                <li key={suggestion.key}>
                  {suggestion.group && suggestion.group !== suggestions[index - 1]?.group && (
                    <div
                      className={`px-2 pb-1 text-xs text-muted-foreground ${index > 0 ? 'mt-1 border-t pt-2' : 'pt-0.5'}`}
                    >
                      {suggestion.group}
                    </div>
                  )}
                  <button
                    type="button"
                    role="option"
                    aria-selected={index === highlighted}
                    onMouseDown={(event) => event.preventDefault()}
                    onMouseEnter={() => setHighlighted(index)}
                    onClick={suggestion.apply}
                    className={[
                      'flex w-full items-baseline justify-between gap-3 rounded px-2 py-1.5 text-left text-sm',
                      index === highlighted ? 'bg-accent' : '',
                      suggestion.muted ? 'opacity-60' : '',
                    ].join(' ')}
                  >
                    <span className={`truncate ${suggestion.mono ? 'font-mono' : ''}`}>
                      {suggestion.primary}
                    </span>
                    {suggestion.secondary && (
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {suggestion.secondary}
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <Select
          value={filterState.sortBy}
          onValueChange={(value) => updateFilterState({ sortBy: value as TicketSort })}
        >
          <SelectTrigger className="h-10 w-[176px] text-sm" aria-label="Sortierung">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(SORT_LABELS) as TicketSort[]).map((key) => (
              <SelectItem key={key} value={key} className="text-sm">
                {SORT_LABELS[key]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={density} onValueChange={(value) => changeDensity(value as Density)}>
          <SelectTrigger className="h-10 w-[132px] text-sm" aria-label="Schriftgröße der Liste">
            <Type className="h-4 w-4 shrink-0 text-muted-foreground" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {DENSITIES.map((key) => (
              <SelectItem key={key} value={key} className="text-sm">
                {DENSITY_LABELS[key]}
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
              title={chip.invalid ? 'Datum nicht erkannt — z. B. 1.9.2026 oder 2026-09-01' : 'Filter entfernen'}
              className={[
                'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs hover:bg-accent',
                chip.invalid ? 'bg-tone-danger-soft text-tone-danger line-through' : 'bg-secondary',
              ].join(' ')}
            >
              <span className="text-muted-foreground">{CHIP_LABELS[chip.field] ?? chip.field}</span>
              <span className="font-medium">{chip.value}</span>
              <X className="h-3.5 w-3.5 opacity-60" />
            </button>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div className="flex items-center gap-5 border-b">
        {TABS.map((tab) => {
          const active = activeTab === tab.key;
          // While searching, each tab says how many of its tickets match, so a
          // hit in another list is visible without clicking through them all.
          const matches = matchCounts[tab.key];
          const empty = hasQuery && matches === 0;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              aria-current={active ? 'page' : undefined}
              title={hasQuery ? `${matches} von ${counts[tab.countKey]} passen zur Suche` : undefined}
              className={[
                'relative -mb-px flex items-center gap-1.5 pb-2 text-sm transition-colors',
                active
                  ? 'font-semibold text-foreground after:absolute after:inset-x-0 after:-bottom-px after:h-0.5 after:bg-foreground'
                  : 'text-muted-foreground hover:text-foreground',
                empty && !active ? 'opacity-50' : '',
              ].join(' ')}
            >
              {tab.key === 'archive' && <Archive className="h-3.5 w-3.5" />}
              {tab.label}
              {hasQuery ? (
                <span
                  className={[
                    'rounded px-1 font-mono text-xs tabular-nums',
                    matches > 0 ? 'bg-tone-info-soft text-tone-info' : 'opacity-70',
                  ].join(' ')}
                >
                  {matches}
                </span>
              ) : (
                <span className="font-mono text-xs tabular-nums opacity-70">
                  {counts[tab.countKey]}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {activeTab === 'archive' && (
        <ArchiveBar
          companyName={parsed.filters.companyName}
          state={archiveState}
          onLoad={loadCompanyArchive}
          onPickCustomer={() => insertField('firma')}
        />
      )}

      {/* Board */}
      <div
        ref={(el) => {
          scrollRefs.current[activeTab] = el;
        }}
        onScroll={handleScroll}
        className="min-h-0 flex-1 overflow-auto rounded-md border"
      >
        {isLoading ? (
          <SkeletonRows tokens={tokens} />
        ) : rows.length === 0 ? (
          <EmptyState
            tab={activeTab}
            hasQuery={hasQuery}
            isLookingUpNumber={isLookingUpNumber}
            elsewhere={elsewhere}
            onShowTab={setActiveTab}
            onClear={resetSearch}
          />
        ) : (
          <table className="w-full border-collapse">
            <thead className="sticky top-0 z-10 bg-background">
              <tr
                className={`border-b uppercase tracking-wider text-muted-foreground ${tokens.head}`}
              >
                <th className="w-[3px] p-0" />
                <th className="w-px whitespace-nowrap py-2 pl-3 pr-3 text-left font-medium">Nr.</th>
                {/* The only column that gives: everything else is sized to its
                    content, so this one absorbs whatever is left. */}
                <th className="w-full py-2 pr-3 text-left font-medium">Vorgang</th>
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
              {/* Spacers stand in for the rows outside the window, so the
                  scrollbar reflects the whole list. */}
              {windowed.padTop > 0 && (
                <tr aria-hidden style={{ height: windowed.padTop }}>
                  <td colSpan={7} className="p-0" />
                </tr>
              )}

              {rows.slice(windowed.start, windowed.end).map((ticket, index) => (
                <TicketRowMenu
                  key={ticket.id}
                  ticket={ticket}
                  onOpen={() => onTicketSelect(ticket, true)}
                  onSchedule={() => setScheduleTarget(ticket)}
                >
                  <TicketRow
                    ref={index === 0 ? measureRow : undefined}
                    ticket={ticket}
                    tokens={tokens}
                    words={words}
                    companyWords={companyWords}
                    onExitTop={() => searchRef.current?.focus()}
                    onSelect={() => onTicketSelect(ticket, true)}
                    onOpenWindow={(e) => void openInWindow(ticket, e)}
                    onHoverStart={(event) => showPreview(ticket, event)}
                    onHoverEnd={hidePreview}
                  />
                </TicketRowMenu>
              ))}

              {windowed.padBottom > 0 && (
                <tr aria-hidden style={{ height: windowed.padBottom }}>
                  <td colSpan={7} className="p-0" />
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        {rows.length} {rows.length === 1 ? 'Ticket' : 'Tickets'}
        {hasQuery ? ' gefunden' : ''}
        {shouldVirtualize(rows.length) && ' · nur sichtbare werden gezeichnet'}
        {isLookingUpNumber && ' · Ticketnummer wird beim Server angefragt …'}
        {/* The list stays on screen while this runs; the hint is here so a slow
            query is visible without the rows flashing away. */}
        {isRefreshing && !isLoading && (
          <span className="ml-1 inline-flex items-center gap-1">
            <Loader2 className="h-3 w-3 animate-spin" />
            wird aktualisiert …
          </span>
        )}
      </p>

      {preview && <TicketHoverPreview ticket={preview.ticket} anchor={preview.anchor} />}

      {/* One dialog for the whole board rather than one per row. */}
      <ScheduleTicketDialog ticket={scheduleTarget} onClose={() => setScheduleTarget(null)} />
    </div>
  );
}

/** How a chip names its field: the words, not the syntax. */
const CHIP_LABELS: Record<string, string> = {
  id: 'Nr.',
  nr: 'Nr.',
  firma: 'Kunde',
  kunde: 'Kunde',
  company: 'Kunde',
  status: 'Status',
  prio: 'Priorität',
  priority: 'Priorität',
  von: 'ab',
  from: 'ab',
  bis: 'bis',
  to: 'bis',
};

/** Ready-made values for `von:` and `bis:`, written as people write dates. */
function dateSuggestions(field: 'dateFrom' | 'dateTo'): Array<{ label: string; value: string }> {
  const today = new Date();
  const format = (date: Date) =>
    `${date.getDate()}.${date.getMonth() + 1}.${date.getFullYear()}`;
  const daysAgo = (days: number) => {
    const date = new Date(today);
    date.setDate(date.getDate() - days);
    return date;
  };

  if (field === 'dateTo') {
    return [
      { label: 'Heute', value: format(today) },
      { label: 'Gestern', value: format(daysAgo(1)) },
      { label: 'Vor einer Woche', value: format(daysAgo(7)) },
      { label: 'Vor einem Monat', value: format(daysAgo(30)) },
    ];
  }

  return [
    { label: 'Heute', value: format(today) },
    { label: 'Letzte 7 Tage', value: format(daysAgo(7)) },
    { label: 'Letzte 30 Tage', value: format(daysAgo(30)) },
    { label: 'Seit Monatsanfang', value: format(new Date(today.getFullYear(), today.getMonth(), 1)) },
    { label: 'Seit Jahresanfang', value: format(new Date(today.getFullYear(), 0, 1)) },
  ];
}

/** Text with the search words marked. */
function Highlighted({ text, words }: { text: string; words: string[] }) {
  if (words.length === 0 || !text) return <>{text}</>;
  return (
    <>
      {highlight(text, words).map((part, index) =>
        part.match ? (
          <mark key={index} className="rounded-[2px] bg-tone-warning-soft text-inherit">
            {part.text}
          </mark>
        ) : (
          <span key={index}>{part.text}</span>
        ),
      )}
    </>
  );
}

/**
 * Why a row matched, when the row itself does not show it.
 *
 * A search for a contact's name, or for something only the description
 * mentions, otherwise lists tickets with nothing visibly in common with the
 * query — which reads as the search being broken.
 */
function matchContext(ticket: Ticket, words: string[]): { label: string; text: string } | null {
  if (words.length === 0) return null;
  const visible = [ticket.summary, ticket.company?.name, ticket.subject, ticket.pool_name, String(ticket.id)]
    .filter(Boolean)
    .join(' ');
  if (containsAll(visible, words)) return null;

  for (const [label, value] of [
    ['Kontakt', ticket.ticketUser],
    ['Erstellt von', ticket.ticketCreator],
  ] as const) {
    if (value && containsAll(value, words.filter((word) => !containsAll(visible, [word])))) {
      return { label, text: value };
    }
  }

  const description = excerpt(normalizeTicketText(ticket.description), words);
  if (description) return { label: 'Beschreibung', text: description };

  const form = excerpt(ticket.template_data ?? '', words);
  if (form) return { label: 'Formular', text: form };

  return null;
}

interface Suggestion {
  key: string;
  /** A heading shown above the first suggestion of each group. */
  group?: string;
  primary: string;
  secondary?: string;
  /** Field names read better monospaced; company names do not. */
  mono?: boolean;
  /** Dimmed, for customers the backend marks inactive. */
  muted?: boolean;
  apply: () => void;
}

/**
 * The archive's own controls.
 *
 * The archive cannot be browsed, only asked for, so this states the two ways in
 * rather than leaving an empty list to be interpreted. `getCompanyById` is the
 * only endpoint that returns closed tickets in bulk and it takes exactly one
 * company id, so a customer has to be named before anything can be loaded.
 */
function ArchiveBar({
  companyName,
  state,
  onLoad,
  onPickCustomer,
}: {
  companyName?: string;
  state: ReturnType<typeof useTickets>['archiveState'];
  onLoad: (customer: Customer) => Promise<void>;
  onPickCustomer: () => void;
}) {
  const [candidates, setCandidates] = useState<Customer[]>([]);
  /**
   * Whether the customer cache holds anything at all.
   *
   * Without this, the minute between signing in and the first sync completing
   * would report "no customer matches that" — which is not true, and is the
   * kind of wrong empty state that makes a working feature look broken.
   */
  const [cacheReady, setCacheReady] = useState(true);

  useEffect(() => {
    if (!companyName) {
      setCandidates([]);
      return;
    }

    let cancelled = false;
    void searchCustomers(companyName, 4)
      .then(async (hits) => {
        if (cancelled) return;
        setCandidates(hits);
        // Nothing matched — is the list empty, or is the name simply not in it?
        setCacheReady(hits.length > 0 || (await searchCustomers('', 1)).length > 0);
      })
      .catch(() => {
        if (!cancelled) setCandidates([]);
      });

    return () => {
      cancelled = true;
    };
  }, [companyName]);

  const loading = state.status === 'loading';

  return (
    <div className="rounded-md border border-dashed bg-muted/30 p-3">
      {!companyName ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <Archive className="h-4 w-4 shrink-0 text-muted-foreground" />
          <p className="text-sm">
            Abgeschlossene Tickets liefert der Server nur einzeln oder pro Kunde.
          </p>
          <Button variant="outline" size="sm" onClick={onPickCustomer}>
            <Building2 className="mr-1.5 h-3.5 w-3.5" />
            Kunde wählen
          </Button>
          <p className="w-full text-xs text-muted-foreground">
            Eine Ticketnummer in der Suche wird automatisch nachgeladen, auch wenn das Ticket
            geschlossen ist.
          </p>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" />
          {candidates.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {cacheReady
                ? `Kein Kunde gefunden, der auf „${companyName}“ passt.`
                : 'Die Kundenliste wird noch geladen …'}
            </p>
          ) : (
            <>
              <p className="text-sm">Archiv laden für</p>
              {candidates.map((customer) => (
                <Button
                  key={customer.id}
                  variant="outline"
                  size="sm"
                  disabled={loading}
                  onClick={() => void onLoad(customer)}
                >
                  {loading && state.company === customer.name && (
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  )}
                  {customer.name}
                </Button>
              ))}
            </>
          )}
        </div>
      )}

      {state.status === 'error' && (
        <p className="mt-2 text-xs text-tone-danger">
          Archiv konnte nicht geladen werden: {state.error}
        </p>
      )}
      {state.status === 'idle' && state.result && (
        <p className="mt-2 text-xs text-muted-foreground">
          {state.company}: {state.result.returned} Tickets vom Server, davon{' '}
          {state.result.closed} abgeschlossen — {state.result.cached} ins Archiv übernommen.
        </p>
      )}
    </div>
  );
}

/**
 * Formats a ticket date, adding the year only when it is not the current one.
 *
 * The archive routinely holds tickets several years old, and "14.03." with no
 * year is actively misleading there.
 */
function formatCreated(value: string): string {
  const date = parseTicketDate(value);
  if (!date) return '—';

  const sameYear = date.getFullYear() === new Date().getFullYear();
  return date.toLocaleDateString(
    undefined,
    sameYear
      ? { day: '2-digit', month: '2-digit' }
      : { day: '2-digit', month: '2-digit', year: '2-digit' },
  );
}

interface TicketRowProps extends React.HTMLAttributes<HTMLTableRowElement> {
  ticket: Ticket;
  tokens: DensityTokens;
  onSelect: () => void;
  onOpenWindow: (event: React.MouseEvent) => void;
  onHoverStart: (event: React.MouseEvent<HTMLTableRowElement>) => void;
  onHoverEnd: () => void;
  /** Free-text search words, marked wherever they appear in the row. */
  words: string[];
  /** The same, plus the `firma:` value, for the company column. */
  companyWords: string[];
  /** Arrow-up past the first row hands focus back to the search box. */
  onExitTop: () => void;
}

/** The next or previous ticket row, skipping the virtualization spacers. */
function siblingRow(row: HTMLElement, direction: 1 | -1): HTMLElement | null {
  let node = direction > 0 ? row.nextElementSibling : row.previousElementSibling;
  while (node && !(node as HTMLElement).dataset.ticketRow) {
    node = direction > 0 ? node.nextElementSibling : node.previousElementSibling;
  }
  return node as HTMLElement | null;
}

/**
 * Forwards its ref and spreads the rest of its props onto the `tr`.
 *
 * Both are what let the context menu wrap the row: Radix hands its trigger
 * props to this component, and they have to reach the actual element.
 */
const TicketRow = forwardRef<HTMLTableRowElement, TicketRowProps>(function TicketRow(
  {
    ticket,
    tokens,
    onSelect,
    onOpenWindow,
    onHoverStart,
    onHoverEnd,
    words,
    companyWords,
    onExitTop,
    ...rest
  },
  ref,
) {
  const running = isRunning(ticket.playStatus);
  const playing = toPlayerState(ticket.playStatus) !== 'stopped';
  const context = useMemo(() => matchContext(ticket, words), [ticket, words]);

  return (
    <tr
      ref={ref}
      {...rest}
      onClick={(event) => {
        rest.onClick?.(event);
        onSelect();
      }}
      onMouseEnter={onHoverStart}
      onMouseLeave={onHoverEnd}
      onKeyDown={(e) => {
        rest.onKeyDown?.(e);
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect();
        } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
          e.preventDefault();
          const next = siblingRow(e.currentTarget, e.key === 'ArrowDown' ? 1 : -1);
          if (next) next.focus();
          else if (e.key === 'ArrowUp') onExitTop();
        }
      }}
      data-ticket-row="true"
      tabIndex={0}
      className="group cursor-pointer border-b transition-colors last:border-0 hover:bg-accent/50 focus:bg-accent/50 focus:outline-none data-[state=open]:bg-accent/50"
    >
      {/* Priority rail: severity readable without parsing text.
          The cell is stretched to the row so the rail is continuous — a fixed
          height leaves a gap at every density but the one it was tuned for. */}
      <td className="h-full p-0">
        <div
          className={`h-full min-h-[1.5rem] w-[3px] ${TONE_RAIL[priorityTone(ticket.priority, ticket.index)]}`}
          title={priorityLabel(ticket.priority)}
        />
      </td>

      <td
        className={`whitespace-nowrap pl-3 pr-3 font-mono tabular-nums text-muted-foreground ${tokens.row} ${tokens.mono}`}
      >
        <Highlighted text={String(ticket.id)} words={words.filter((word) => /^\d+$/.test(word))} />
      </td>

      {/* `max-w-0` with `w-full` is what makes truncation work in a table: a
          cell is otherwise sized to its content, so a long summary widens the
          whole table instead of being cut off — which is where the horizontal
          scrollbar came from. */}
      <td className={`w-full max-w-0 pr-3 ${tokens.row}`}>
        <div className="flex min-w-0 items-center gap-1.5">
          <span className={`truncate font-medium ${tokens.title}`}>
            {ticket.summary ? <Highlighted text={ticket.summary} words={words} /> : '—'}
          </span>
          {ticket.attachments.length > 0 && (
            <Paperclip className={`shrink-0 text-muted-foreground ${tokens.icon}`} />
          )}
          {ticket.ticketMessagesCount > 0 && (
            <span
              className={`inline-flex shrink-0 items-center gap-0.5 text-muted-foreground ${tokens.meta}`}
            >
              <MessageSquare className={tokens.icon} />
              {ticket.ticketMessagesCount}
            </span>
          )}
        </div>
        <div className={`truncate text-muted-foreground ${tokens.meta}`}>
          {context ? (
            // The match is somewhere the row does not otherwise show, so show
            // it here instead of the subject line.
            <>
              <span className="font-medium">{context.label}: </span>
              <Highlighted text={context.text} words={words} />
            </>
          ) : (
            <Highlighted
              text={[ticket.subject, ticket.pool_name, priorityLabel(ticket.priority)]
                .filter(Boolean)
                .join(' · ')}
              words={words}
            />
          )}
        </div>
      </td>

      <td
        className={`hidden truncate whitespace-nowrap pr-3 text-muted-foreground md:table-cell ${tokens.company} ${tokens.row} ${tokens.meta}`}
      >
        <Highlighted text={ticket.company?.name ?? ''} words={companyWords} />
      </td>

      <td
        className={`hidden whitespace-nowrap pr-3 font-mono tabular-nums text-muted-foreground lg:table-cell ${tokens.row} ${tokens.mono}`}
      >
        {formatCreated(ticket.created_at)}
      </td>

      <td className={`whitespace-nowrap pr-3 ${tokens.row}`}>
        <div className="flex items-center gap-1.5">
          {playing &&
            (running ? (
              <Play className={`fill-tone-success text-tone-success ${tokens.icon}`} />
            ) : (
              <Pause className={`text-tone-warning ${tokens.icon}`} />
            ))}
          <Badge
            variant="outline"
            className={`${TONE_BADGE[statusTone(ticket.status)]} font-medium ${tokens.badge}`}
          >
            {ticket.status || '—'}
          </Badge>
        </div>
      </td>

      <td className={`pr-2 ${tokens.row}`}>
        <Button
          variant="ghost"
          size="icon"
          onClick={onOpenWindow}
          aria-label={`Ticket ${ticket.id} in neuem Fenster öffnen`}
          className={`opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100 ${tokens.action}`}
        >
          <ExternalLink className={tokens.icon} />
        </Button>
      </td>
    </tr>
  );
});

function SkeletonRows({ tokens }: { tokens: DensityTokens }) {
  return (
    <div className="divide-y">
      {Array.from({ length: 12 }, (_, i) => (
        <div key={i} className={`flex animate-pulse items-center gap-3 px-3 ${tokens.row}`}>
          <div className="h-3 w-10 rounded bg-muted" />
          <div className="h-3 flex-1 rounded bg-muted" />
          <div className="h-3 w-24 rounded bg-muted" />
          <div className="h-4 w-16 rounded-full bg-muted" />
        </div>
      ))}
    </div>
  );
}

function EmptyState({
  tab,
  hasQuery,
  isLookingUpNumber,
  elsewhere,
  onShowTab,
  onClear,
}: {
  tab: BoardTab;
  hasQuery: boolean;
  isLookingUpNumber: boolean;
  /** Another tab where the same search did find tickets. */
  elsewhere: { key: BoardTab; label: string; count: number } | null;
  onShowTab: (tab: BoardTab) => void;
  onClear: () => void;
}) {
  if (isLookingUpNumber) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 p-12 text-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        <p className="text-sm">Ticketnummer wird beim Server angefragt …</p>
      </div>
    );
  }

  const archive = tab === 'archive';

  // The search found nothing here but did elsewhere — often a closed ticket
  // number that was just looked up and landed in the archive, or a pool ticket
  // searched for under "Meine". Saying so without offering the jump would be a
  // riddle, not a hint.
  if (elsewhere) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 p-12 text-center">
        <Search className="h-8 w-8 text-muted-foreground" />
        <div className="space-y-1">
          <p className="text-sm font-medium">
            Hier nichts — aber {elsewhere.count} in „{elsewhere.label}“
          </p>
          {elsewhere.key === 'archive' && (
            <p className="max-w-md text-sm text-muted-foreground">
              Abgeschlossene Tickets stehen nicht in den laufenden Listen.
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={() => onShowTab(elsewhere.key)}>
            {elsewhere.key === 'archive' && <Archive className="mr-1.5 h-3.5 w-3.5" />}
            In „{elsewhere.label}“ ansehen
          </Button>
          <Button variant="outline" size="sm" onClick={onClear}>
            Suche zurücksetzen
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center gap-3 p-12 text-center">
      {archive ? (
        <Archive className="h-8 w-8 text-muted-foreground" />
      ) : (
        <AlertCircle className="h-8 w-8 text-muted-foreground" />
      )}
      <div className="space-y-1">
        <p className="text-sm font-medium">
          {hasQuery
            ? 'Keine Tickets für diese Suche'
            : archive
              ? 'Noch nichts im Archiv'
              : 'Keine Tickets in dieser Liste'}
        </p>
        <p className="max-w-md text-sm text-muted-foreground">
          {archive
            ? 'Abgeschlossene Tickets kommen nicht über die Synchronisierung — sie werden pro Kunde oder über die Ticketnummer geladen.'
            : hasQuery
              ? 'Gesucht wird in Titel, Beschreibung, Kunde, Kontakt und Formular aller synchronisierten Tickets — jedes Wort muss irgendwo vorkommen.'
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
