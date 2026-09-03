import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Ticket } from '@/types/api';
import { parseSearch } from '@/lib/searchQuery';
import {
  fetchCompanyArchive,
  fetchTicketByNumber,
  getSyncStatus,
  getTicketCounts,
  onSyncChanged,
  onSyncStatus,
  queryTickets,
  syncRefresh,
  type ArchiveFetch,
  type BucketCounts,
  type Customer,
  type SyncStatus,
  type TicketQuery,
  type TicketSort,
} from '@/lib/sync';

/**
 * Ticket state for the UI.
 *
 * This provider does no fetching and runs no timers. The Rust sync core owns
 * both, once for the whole application; this subscribes to its events and reads
 * the local store. Previously every window mounted its own copy of this and ran
 * its own 30-second poll, so N windows meant N full pulls of every open ticket.
 *
 * Filtering and sorting happen in SQLite over every synced ticket, which
 * replaces the old client-side filter over whatever happened to be loaded — and
 * with it the `/testGetTickets` call and the `user_group_id = 1` pool bypass
 * that the customer filter used to depend on.
 *
 * Closed tickets are the one thing syncing cannot reach. `getTicketsQuery`
 * filters `status_id != 4`, so searching for a closed ticket — or for
 * everything a customer ever had — used to come back empty however long the app
 * had been running. Two fetches fill that gap, and they are deliberately not
 * symmetrical:
 *
 *   * A ticket number resolves itself. `getTicketById` is one cheap row, so
 *     when a search names a number the store does not have, it is fetched.
 *   * A customer's history does not. `getCompanyById` returns every ticket the
 *     customer ever had — and, because four further relations are declared
 *     identically to the first, returns them five times over. That one waits
 *     for the user to ask.
 */

/**
 * Every filter now lives in the search string — `firma:`, `status:`, `prio:`,
 * `von:`, `bis:` — parsed into a store query. The separate dropdown fields this
 * used to carry are gone with the dropdowns.
 */
interface FilterState {
  searchTerm: string;
  sortBy: TicketSort;
}

/** The archive is a fourth list, but not a fourth server-side bucket. */
export type BoardTab = 'my' | 'new' | 'all' | 'archive';

interface NavigationState {
  activeTab: string;
  scrollPositions: Record<BoardTab, number>;
}

interface TicketBuckets {
  new_tickets: Ticket[];
  my_tickets: Ticket[];
  all_tickets: Ticket[];
  /** Closed tickets pulled in on demand. */
  archive_tickets: Ticket[];
}

/** Progress of the last on-demand archive fetch. */
export interface ArchiveState {
  status: 'idle' | 'loading' | 'error';
  /** The customer the last fetch covered, for the empty state to name. */
  company: string | null;
  result: ArchiveFetch | null;
  error: string | null;
}

interface TicketsContextType {
  /** Filtered and sorted by the store, per bucket. */
  tickets: TicketBuckets;
  /** Unfiltered totals, for tab badges. */
  counts: BucketCounts;
  isLoading: boolean;
  /**
   * A query is in flight over rows that are already on screen — a sync
   * landing, or the search changing. Distinct from `isLoading`, which means
   * there is nothing to show yet: replacing a good list with a skeleton on
   * every refresh would flash once every thirty seconds.
   */
  isRefreshing: boolean;
  /** Null until the first status arrives. */
  syncStatus: SyncStatus | null;
  /** Asks the sync engine for an immediate pull. */
  refreshTickets: () => Promise<void>;

  filterState: FilterState;
  updateFilterState: (updates: Partial<FilterState>) => void;
  clearFilters: () => void;

  navigationState: NavigationState;
  setActiveTab: (tab: string) => void;
  setScrollPosition: (tab: BoardTab, position: number) => void;

  archiveState: ArchiveState;
  /**
   * Pulls a customer's whole ticket history into the archive. Expensive by
   * nature of the endpoint, so it is only ever called from a button.
   */
  loadCompanyArchive: (company: Customer) => Promise<void>;
  /**
   * True while a ticket number typed into the search box is being looked up
   * against the backend because the store had no such ticket.
   */
  isLookingUpNumber: boolean;
}

const TicketsContext = createContext<TicketsContextType | undefined>(undefined);

const defaultFilterState: FilterState = {
  searchTerm: '',
  sortBy: 'date-desc',
};

const defaultNavigationState: NavigationState = {
  activeTab: 'my',
  scrollPositions: { my: 0, new: 0, all: 0, archive: 0 },
};

const emptyBuckets: TicketBuckets = {
  new_tickets: [],
  my_tickets: [],
  all_tickets: [],
  archive_tickets: [],
};
const emptyCounts: BucketCounts = { new: 0, mine: 0, all: 0, archive: 0 };
const idleArchive: ArchiveState = {
  status: 'idle',
  company: null,
  result: null,
  error: null,
};

function readStored<T>(key: string, fallback: T): T {
  try {
    const raw = sessionStorage.getItem(key);
    return raw ? { ...fallback, ...JSON.parse(raw) } : fallback;
  } catch {
    return fallback;
  }
}

function writeStored(key: string, value: unknown) {
  try {
    sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Session storage being unavailable is not worth failing a render over.
  }
}

export function TicketsProvider({ children }: { children: React.ReactNode }) {
  const [tickets, setTickets] = useState<TicketBuckets>(emptyBuckets);
  const [counts, setCounts] = useState<BucketCounts>(emptyCounts);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);
  const [archiveState, setArchiveState] = useState<ArchiveState>(idleArchive);
  const [isLookingUpNumber, setIsLookingUpNumber] = useState(false);

  const [filterState, setFilterState] = useState<FilterState>(() =>
    readStored('ticketFilterState', defaultFilterState),
  );
  const [navigationState, setNavigationState] = useState<NavigationState>(() =>
    readStored('ticketNavigationState', defaultNavigationState),
  );

  // Guards against an in-flight query from stale filters overwriting a newer
  // result. Local queries are fast but not instantaneous.
  const queryToken = useRef(0);

  // The board expresses every filter through the search box, so the store
  // query is derived by parsing it rather than read from a row of dropdowns.
  const baseQuery: Omit<TicketQuery, 'bucket'> = useMemo(
    () => ({
      ...parseSearch(filterState.searchTerm).filters,
      sort: filterState.sortBy,
    }),
    [filterState.searchTerm, filterState.sortBy],
  );

  const loadFromStore = useCallback(async () => {
    const token = ++queryToken.current;
    setIsRefreshing(true);
    try {
      const [newTickets, myTickets, allTickets, archiveTickets, nextCounts] = await Promise.all([
        queryTickets({ ...baseQuery, bucket: 'new' }),
        queryTickets({ ...baseQuery, bucket: 'mine' }),
        queryTickets({ ...baseQuery, bucket: 'all' }),
        // No bucket: archived tickets have no bucket rows, by construction.
        queryTickets({ ...baseQuery, archived: true }),
        getTicketCounts(),
      ]);

      if (token !== queryToken.current) return;

      setTickets({
        new_tickets: newTickets,
        my_tickets: myTickets,
        all_tickets: allTickets,
        archive_tickets: archiveTickets,
      });
      setCounts(nextCounts);
    } catch (error) {
      console.error('Failed to read tickets from the local store:', error);
    } finally {
      if (token === queryToken.current) {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    }
  }, [baseQuery]);

  // Re-query whenever the filters change.
  useEffect(() => {
    void loadFromStore();
  }, [loadFromStore]);

  /**
   * Resolves a ticket number the store does not know.
   *
   * The case this exists for: someone pastes the number of a ticket that was
   * closed last month. It is not in the store, it cannot ever get there through
   * syncing, and the board would otherwise just say "no results" — which is
   * indistinguishable from the ticket not existing.
   *
   * Numbers already tried are remembered so a miss is not retried on every
   * keystroke, and so a genuinely unknown number costs exactly one request.
   */
  const attemptedNumbers = useRef(new Set<number>());

  useEffect(() => {
    const wanted = baseQuery.id;
    if (wanted === undefined || attemptedNumbers.current.has(wanted)) return;

    // Only when nothing local matched; a ticket already on screen needs no
    // request, and this must not fire while the first query is still running.
    if (isLoading) return;
    const found =
      tickets.my_tickets.length +
      tickets.new_tickets.length +
      tickets.all_tickets.length +
      tickets.archive_tickets.length;
    if (found > 0) return;

    let cancelled = false;
    attemptedNumbers.current.add(wanted);
    setIsLookingUpNumber(true);

    void (async () => {
      try {
        const ticket = await fetchTicketByNumber(wanted);
        if (!cancelled && ticket) await loadFromStore();
      } catch (error) {
        // A failed lookup leaves the empty state in place, which already says
        // the right thing. Nothing here is worth interrupting a search over.
        console.error(`Failed to look up ticket ${wanted}:`, error);
      } finally {
        if (!cancelled) setIsLookingUpNumber(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [baseQuery.id, isLoading, tickets, loadFromStore]);

  const loadCompanyArchive = useCallback(
    async (company: Customer) => {
      setArchiveState({ status: 'loading', company: company.name, result: null, error: null });
      try {
        const result = await fetchCompanyArchive(company.id);
        setArchiveState({
          status: 'idle',
          company: company.name,
          result,
          error: null,
        });
        await loadFromStore();
      } catch (error) {
        setArchiveState({
          status: 'error',
          company: company.name,
          result: null,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    },
    [loadFromStore],
  );

  // Re-query when the sync engine reports the data changed. One subscription
  // per window, but only one engine doing the actual work.
  useEffect(() => {
    let disposed = false;
    const unlisteners: Array<() => void> = [];

    const subscribe = async () => {
      const [offChanged, offStatus] = await Promise.all([
        onSyncChanged(() => {
          void loadFromStore();
        }),
        onSyncStatus((status) => {
          setSyncStatus(status);
        }),
      ]);

      if (disposed) {
        offChanged();
        offStatus();
        return;
      }
      unlisteners.push(offChanged, offStatus);

      // A window opened after a sync missed the event, so catch up once.
      try {
        setSyncStatus(await getSyncStatus());
      } catch (error) {
        console.error('Failed to read sync status:', error);
      }
    };

    void subscribe();

    return () => {
      disposed = true;
      unlisteners.forEach((off) => off());
    };
  }, [loadFromStore]);

  const refreshTickets = useCallback(async () => {
    await syncRefresh();
  }, []);

  const updateFilterState = useCallback((updates: Partial<FilterState>) => {
    setFilterState((prev) => {
      const changed = (Object.keys(updates) as Array<keyof FilterState>).some(
        (key) => prev[key] !== updates[key],
      );
      if (!changed) return prev;

      const next = { ...prev, ...updates };
      writeStored('ticketFilterState', next);
      return next;
    });
  }, []);

  const clearFilters = useCallback(() => {
    setFilterState(defaultFilterState);
    try {
      sessionStorage.removeItem('ticketFilterState');
    } catch {
      // Non-fatal.
    }
  }, []);

  const updateNavigationState = useCallback((updates: Partial<NavigationState>) => {
    setNavigationState((prev) => {
      const next = { ...prev, ...updates };
      writeStored('ticketNavigationState', next);
      return next;
    });
  }, []);

  const setActiveTab = useCallback(
    (tab: string) => updateNavigationState({ activeTab: tab }),
    [updateNavigationState],
  );

  const setScrollPosition = useCallback(
    (tab: BoardTab, position: number) => {
      setNavigationState((prev) => {
        const next = {
          ...prev,
          scrollPositions: { ...prev.scrollPositions, [tab]: position },
        };
        writeStored('ticketNavigationState', next);
        return next;
      });
    },
    [],
  );

  const value = useMemo<TicketsContextType>(
    () => ({
      tickets,
      counts,
      isLoading,
      isRefreshing,
      syncStatus,
      refreshTickets,
      filterState,
      updateFilterState,
      clearFilters,
      navigationState,
      setActiveTab,
      setScrollPosition,
      archiveState,
      loadCompanyArchive,
      isLookingUpNumber,
    }),
    [
      tickets,
      counts,
      isLoading,
      isRefreshing,
      syncStatus,
      refreshTickets,
      filterState,
      updateFilterState,
      clearFilters,
      navigationState,
      setActiveTab,
      setScrollPosition,
      archiveState,
      loadCompanyArchive,
      isLookingUpNumber,
    ],
  );

  return <TicketsContext.Provider value={value}>{children}</TicketsContext.Provider>;
}

export function useTickets() {
  const context = useContext(TicketsContext);
  if (context === undefined) {
    throw new Error('useTickets must be used within a TicketsProvider');
  }
  return context;
}
