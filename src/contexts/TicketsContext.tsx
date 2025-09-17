import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useAuth } from './AuthContext';
import { apiClient } from '@/lib/api';
import { Ticket, Company } from '@/types/api';
import { performanceMonitor } from '@/utils/performanceMonitor';

interface FilterState {
  searchTerm: string;
  statusFilter: string;
  priorityFilter: string;
  customerFilter: string;
  customerSearchTerm: string;
  dateFromFilter: string;
  dateToFilter: string;
  showAdvancedFilters: boolean;
  sortBy: string;
}

interface TicketsContextType {
  tickets: {
    new_tickets: Ticket[];
    my_tickets: Ticket[];
    all_tickets: Ticket[];
  };
  isLoading: boolean;
  isRefreshing: boolean;
  lastUpdated: Date | null;
  refreshTickets: () => Promise<void>;
  loadAllTicketsForSearch: () => Promise<{
    new_tickets: Ticket[];
    my_tickets: Ticket[];
    all_tickets: Ticket[];
  }>;
  updateTicket: (updatedTicket: Ticket) => void;
  addTicket: (newTicket: Ticket) => void;
  // Filter state management
  filterState: FilterState;
  updateFilterState: (updates: Partial<FilterState>) => void;
  clearFilters: () => void;
  // Additional ticket data for filtering
  allTicketsForSearch: {
    new_tickets: Ticket[];
    my_tickets: Ticket[];
    all_tickets: Ticket[];
  } | null;
  setAllTicketsForSearch: (tickets: {
    new_tickets: Ticket[];
    my_tickets: Ticket[];
    all_tickets: Ticket[];
  } | null) => void;
  customers: Company[];
  setCustomers: (customers: Company[]) => void;
}

const TicketsContext = createContext<TicketsContextType | undefined>(undefined);

const defaultFilterState: FilterState = {
  searchTerm: '',
  statusFilter: 'all',
  priorityFilter: 'all',
  customerFilter: '',
  customerSearchTerm: '',
  dateFromFilter: '',
  dateToFilter: '',
  showAdvancedFilters: false,
  sortBy: 'date-desc'
};

export function TicketsProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [tickets, setTickets] = useState<{
    new_tickets: Ticket[];
    my_tickets: Ticket[];
    all_tickets: Ticket[];
  }>({ new_tickets: [], my_tickets: [], all_tickets: [] });
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  // Filter state management
  const [filterState, setFilterState] = useState<FilterState>(defaultFilterState);
  const [allTicketsForSearch, setAllTicketsForSearch] = useState<{
    new_tickets: Ticket[];
    my_tickets: Ticket[];
    all_tickets: Ticket[];
  } | null>(null);
  const [customers, setCustomers] = useState<Company[]>([]);

  const fetchTickets = useCallback(async (isBackground = false) => {
    if (!user) return;

    const timerLabel = isBackground ? 'fetchTickets.background' : 'fetchTickets.initial';
    performanceMonitor.startTimer(timerLabel);

    if (!isBackground) setIsLoading(true);
    setIsRefreshing(true);

    try {
      // Use normal filtered endpoint for dashboard performance
      const response = await apiClient.getTickets(
        user.id,
        user.user_group_id,
        user.company_id,
        user.location_id,
        user.id,
        user.sub_user_group_id
      );
      setTickets(response);
      setLastUpdated(new Date());

      // Record cache stats
      const ticketCount = response.new_tickets.length + response.my_tickets.length + response.all_tickets.length;
      const dataSize = new Blob([JSON.stringify(response)]).size;
      performanceMonitor.recordCacheSize('tickets', dataSize, ticketCount);

    } catch (error) {
      console.error('Failed to fetch tickets:', error);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
      performanceMonitor.endTimer(timerLabel);
    }
  }, [user]);

  const refreshTickets = useCallback(async () => {
    await fetchTickets(true); // Background refresh
  }, [fetchTickets]);

  const updateTicket = useCallback((updatedTicket: Ticket) => {
    setTickets(prevTickets => {
      const updateTicketInArray = (ticketArray: Ticket[]) =>
        ticketArray.map(ticket => 
          ticket.id === updatedTicket.id ? updatedTicket : ticket
        );

      return {
        new_tickets: updateTicketInArray(prevTickets.new_tickets),
        my_tickets: updateTicketInArray(prevTickets.my_tickets),
        all_tickets: updateTicketInArray(prevTickets.all_tickets),
      };
    });
  }, []);

  const addTicket = useCallback((newTicket: Ticket) => {
    setTickets(prevTickets => ({
      ...prevTickets,
      new_tickets: [newTicket, ...prevTickets.new_tickets],
      all_tickets: [newTicket, ...prevTickets.all_tickets],
    }));
  }, []);

  // Filter state management functions
  const updateFilterState = useCallback((updates: Partial<FilterState>) => {
    setFilterState(prev => {
      const newState = { ...prev, ...updates };
      // Save to sessionStorage
      try {
        sessionStorage.setItem('ticketFilterState', JSON.stringify(newState));
      } catch (error) {
        console.warn('Failed to save filter state:', error);
      }
      return newState;
    });
  }, []);

  const clearFilters = useCallback(() => {
    setFilterState(defaultFilterState);
    setAllTicketsForSearch(null);
    try {
      sessionStorage.removeItem('ticketFilterState');
    } catch (error) {
      console.warn('Failed to clear filter state:', error);
    }
  }, []);

  const loadAllTicketsForSearch = useCallback(async () => {
    if (!user) return { new_tickets: [], my_tickets: [], all_tickets: [] };

    performanceMonitor.startTimer('loadAllTicketsForSearch');

    try {
      // Use unfiltered endpoint for search to get all accessible tickets
      const response = await apiClient.getTicketsUnfiltered(
        user.id,
        1, // Force user_group_id to 1 to bypass pool filtering
        undefined, // Don't filter by company_id
        undefined, // Don't filter by location_id
        undefined, // Don't restrict to specific user
        undefined  // Don't restrict by sub_user_group_id
      );

      // Record cache stats for advanced search
      const ticketCount = response.new_tickets.length + response.my_tickets.length + response.all_tickets.length;
      const dataSize = new Blob([JSON.stringify(response)]).size;
      performanceMonitor.recordCacheSize('allTicketsForSearch', dataSize, ticketCount);

      performanceMonitor.endTimer('loadAllTicketsForSearch');
      return response;
    } catch (error) {
      console.error('Failed to fetch all tickets for search:', error);
      performanceMonitor.endTimer('loadAllTicketsForSearch');
      return { new_tickets: [], my_tickets: [], all_tickets: [] };
    }
  }, [user]);

  // Restore filter state from sessionStorage on mount
  useEffect(() => {
    try {
      const savedState = sessionStorage.getItem('ticketFilterState');
      if (savedState) {
        const parsed = JSON.parse(savedState);
        setFilterState(parsed);
      }
    } catch (error) {
      console.warn('Failed to restore filter state:', error);
    }
  }, []);

  // Initial fetch when user changes
  useEffect(() => {
    if (user) {
      fetchTickets(false);
    }
  }, [user, fetchTickets]);

  // Background refresh every 30 seconds
  useEffect(() => {
    if (!user) return;

    const interval = setInterval(() => {
      refreshTickets();
    }, 30000); // 30 seconds

    return () => clearInterval(interval);
  }, [user, refreshTickets]);

  // Refresh when window comes back into focus
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden && user && lastUpdated) {
        const timeSinceLastUpdate = Date.now() - lastUpdated.getTime();
        // Refresh if it's been more than 1 minute since last update
        if (timeSinceLastUpdate > 60000) {
          refreshTickets();
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [user, lastUpdated, refreshTickets]);

  const value = {
    tickets,
    isLoading,
    isRefreshing,
    lastUpdated,
    refreshTickets,
    loadAllTicketsForSearch,
    updateTicket,
    addTicket,
    // Filter state management
    filterState,
    updateFilterState,
    clearFilters,
    // Additional data for filtering
    allTicketsForSearch,
    setAllTicketsForSearch,
    customers,
    setCustomers,
  };

  return (
    <TicketsContext.Provider value={value}>
      {children}
    </TicketsContext.Provider>
  );
}

export function useTickets() {
  const context = useContext(TicketsContext);
  if (context === undefined) {
    throw new Error('useTickets must be used within a TicketsProvider');
  }
  return context;
}