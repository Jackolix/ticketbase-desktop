import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useAuth } from './AuthContext';
import { apiClient } from '@/lib/api';
import { Ticket } from '@/types/api';

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
  updateTicket: (updatedTicket: Ticket) => void;
  addTicket: (newTicket: Ticket) => void;
}

const TicketsContext = createContext<TicketsContextType | undefined>(undefined);

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

  const fetchTickets = useCallback(async (isBackground = false) => {
    if (!user) return;

    if (!isBackground) setIsLoading(true);
    setIsRefreshing(true);
    
    try {
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
    } catch (error) {
      console.error('Failed to fetch tickets:', error);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
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
    updateTicket,
    addTicket,
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