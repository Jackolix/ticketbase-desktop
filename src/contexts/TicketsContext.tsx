import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Ticket } from '@/types/api';
import { parseSearch } from '@/lib/searchQuery';
import {
  getSyncStatus,
  getTicketCounts,
  onSyncChanged,
  onSyncStatus,
  queryTickets,
  syncRefresh,
  type BucketCounts,
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

interface NavigationState {
  activeTab: string;
  scrollPositions: { my: number; new: number; all: number };
}

interface TicketBuckets {
  new_tickets: Ticket[];
  my_tickets: Ticket[];
  all_tickets: Ticket[];
}

interface TicketsContextType {
  /** Filtered and sorted by the store, per bucket. */
  tickets: TicketBuckets;
  /** Unfiltered totals, for tab badges. */
  counts: BucketCounts;
  isLoading: boolean;
  /** Null until the first status arrives. */
  syncStatus: SyncStatus | null;
  /** Asks the sync engine for an immediate pull. */
  refreshTickets: () => Promise<void>;

  filterState: FilterState;
  updateFilterState: (updates: Partial<FilterState>) => void;
  clearFilters: () => void;

  navigationState: NavigationState;
  setActiveTab: (tab: string) => void;
  setScrollPosition: (tab: 'my' | 'new' | 'all', position: number) => void;
}

const TicketsContext = createContext<TicketsContextType | undefined>(undefined);

const defaultFilterState: FilterState = {
  searchTerm: '',
  sortBy: 'date-desc',
};

const defaultNavigationState: NavigationState = {
  activeTab: 'my',
  scrollPositions: { my: 0, new: 0, all: 0 },
};

const emptyBuckets: TicketBuckets = { new_tickets: [], my_tickets: [], all_tickets: [] };
const emptyCounts: BucketCounts = { new: 0, mine: 0, all: 0 };

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
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);

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
    try {
      const [newTickets, myTickets, allTickets, nextCounts] = await Promise.all([
        queryTickets({ ...baseQuery, bucket: 'new' }),
        queryTickets({ ...baseQuery, bucket: 'mine' }),
        queryTickets({ ...baseQuery, bucket: 'all' }),
        getTicketCounts(),
      ]);

      if (token !== queryToken.current) return;

      setTickets({
        new_tickets: newTickets,
        my_tickets: myTickets,
        all_tickets: allTickets,
      });
      setCounts(nextCounts);
    } catch (error) {
      console.error('Failed to read tickets from the local store:', error);
    } finally {
      if (token === queryToken.current) setIsLoading(false);
    }
  }, [baseQuery]);

  // Re-query whenever the filters change.
  useEffect(() => {
    void loadFromStore();
  }, [loadFromStore]);

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
    (tab: 'my' | 'new' | 'all', position: number) => {
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
      syncStatus,
      refreshTickets,
      filterState,
      updateFilterState,
      clearFilters,
      navigationState,
      setActiveTab,
      setScrollPosition,
    }),
    [
      tickets,
      counts,
      isLoading,
      syncStatus,
      refreshTickets,
      filterState,
      updateFilterState,
      clearFilters,
      navigationState,
      setActiveTab,
      setScrollPosition,
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
