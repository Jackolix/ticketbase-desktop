import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { sendNotification, isPermissionGranted, requestPermission, onAction, registerActionTypes } from '@tauri-apps/plugin-notification';
import { invoke } from '@tauri-apps/api/core';
import { useAuth } from './AuthContext';
import { useTickets } from './TicketsContext';
import { Ticket } from '@/types/api';

interface NotificationSettings {
  enableNewTicketNotifications: boolean;
  enableAssignedTicketNotifications: boolean;
  enableSound: boolean;
  soundVolume: number;
  ticketRefreshInterval: number; // in seconds
}

interface NotificationContextType {
  settings: NotificationSettings;
  updateSettings: (settings: Partial<NotificationSettings>) => void;
  showNotification: (title: string, message: string, ticketId?: number) => void;
  playSound: () => void;
  requestNotificationPermission: () => Promise<boolean>;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

const STORAGE_KEY = 'notification-settings';

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const { tickets, lastUpdated } = useTickets();
  
  const [settings, setSettings] = useState<NotificationSettings>(() => {
    const defaults = {
      enableNewTicketNotifications: true,
      enableAssignedTicketNotifications: true,
      enableSound: true,
      soundVolume: 0.5,
      ticketRefreshInterval: 30, // Default 30 seconds
    };

    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        // Merge with defaults to handle missing properties from old versions
        return { ...defaults, ...parsed };
      } catch {
        // Fallback to defaults if parsing fails
      }
    }
    return defaults;
  });

  const previousTicketsRef = useRef<{
    new_tickets: Ticket[];
    my_tickets: Ticket[];
  }>({ new_tickets: [], my_tickets: [] });
  
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const isInitialLoad = useRef(true);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    // Dispatch custom event for same-window updates
    window.dispatchEvent(new Event('notification-settings-changed'));
  }, [settings]);

  useEffect(() => {
    // Create audio element for notifications using the MP3 file
    audioRef.current = new Audio('/notification.mp3');
    audioRef.current.volume = settings.soundVolume;
    
    // Preload the audio file
    audioRef.current.preload = 'auto';
    
    // Handle loading errors gracefully
    audioRef.current.addEventListener('error', (e) => {
      console.warn('Could not load notification sound:', e);
    });
  }, [settings.soundVolume]);

  // Request Tauri notification permission and set up action handlers on mount
  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let unlistenAction: any;

    const setup = async () => {
      try {
        const permissionGranted = await isPermissionGranted();
        if (!permissionGranted) {
          await requestPermission();
        }
      } catch (error) {
        console.warn('Could not request notification permission:', error);
      }

      try {
        // Register action type so clicking the notification can open the ticket
        await registerActionTypes([{
          id: 'ticket-notification',
          actions: [{
            id: 'open',
            title: 'Open Ticket',
            foreground: true,
          }],
        }]);

        // Listen for notification clicks — open the related ticket window
        unlistenAction = await onAction((action: any) => {
          const ticketId = action.notification?.extra?.ticketId;
          if (ticketId) {
            invoke('open_ticket_window', { ticketId: parseInt(ticketId) }).catch(console.error);
          }
        });
      } catch (error) {
        console.warn('Could not set up notification action handlers:', error);
      }
    };

    setup();

    return () => {
      if (unlistenAction) unlistenAction.unregister();
    };
  }, []);

  const updateSettings = (newSettings: Partial<NotificationSettings>) => {
    setSettings(prev => ({ ...prev, ...newSettings }));
  };

  const playSound = () => {
    if (settings.enableSound && audioRef.current) {
      audioRef.current.currentTime = 0;
      audioRef.current.play().catch(console.error);
    }
  };

  const showNotification = async (title: string, message: string, ticketId?: number) => {
    // Try to use Tauri native notifications first
    try {
      const permissionGranted = await isPermissionGranted();
      if (permissionGranted) {
        await sendNotification({
          title,
          body: message,
          icon: 'icon.png',
          // When a ticketId is provided, attach the action type and extra data
          // so clicking the notification opens that ticket
          ...(ticketId ? {
            actionTypeId: 'ticket-notification',
            extra: { ticketId: String(ticketId) },
          } : {}),
        });
      }
    } catch (error) {
      console.warn('Could not send Tauri notification, falling back to browser notification:', error);

      // Fallback to browser notification
      if ('Notification' in window && Notification.permission === 'granted') {
        const notification = new Notification(title, {
          body: message,
          icon: '/icon.png',
        });

        // Auto close after 5 seconds
        setTimeout(() => notification.close(), 5000);
      }
    }

    // Always show toast notification as well
    if (title.toLowerCase().includes('assigned')) {
      toast.success(title, { description: message });
    } else {
      toast.info(title, { description: message });
    }
  };

  // Monitor for new tickets and assignments
  useEffect(() => {
    if (isInitialLoad.current || !lastUpdated) {
      isInitialLoad.current = false;
      previousTicketsRef.current = {
        new_tickets: tickets.new_tickets,
        my_tickets: tickets.my_tickets,
      };
      return;
    }

    const previousTickets = previousTicketsRef.current;
    const currentNewTickets = tickets.new_tickets;
    const currentMyTickets = tickets.my_tickets;

    // Check for new tickets in pool
    if (settings.enableNewTicketNotifications) {
      const newTicketsAdded = currentNewTickets.filter(ticket =>
        !previousTickets.new_tickets.some(prev => prev.id === ticket.id)
      );

      if (newTicketsAdded.length > 0) {
        const title = newTicketsAdded.length === 1
          ? 'New Ticket Available'
          : `${newTicketsAdded.length} New Tickets Available`;

        let message: string;
        let ticketId: number | undefined;

        if (newTicketsAdded.length === 1) {
          const t = newTicketsAdded[0];
          const parts = [
            `#${t.id}`,
            t.subject && `[${t.subject}]`,
            t.priority && `Priority: ${t.priority}`,
            t.company?.name && `Customer: ${t.company.name}`,
            t.summary,
          ].filter(Boolean);
          message = parts.join(' · ');
          ticketId = t.id;
        } else {
          message = `${newTicketsAdded.length} new tickets are now available in your pool`;
        }

        showNotification(title, message, ticketId);
        playSound();
      }
    }

    // Check for newly assigned tickets
    if (settings.enableAssignedTicketNotifications && user) {
      const newAssignments = currentMyTickets.filter(ticket =>
        !previousTickets.my_tickets.some(prev => prev.id === ticket.id) &&
        ticket.my_ticket_id === user.id
      );

      if (newAssignments.length > 0) {
        const title = newAssignments.length === 1
          ? 'New Ticket Assigned'
          : `${newAssignments.length} New Tickets Assigned`;

        let message: string;
        let ticketId: number | undefined;

        if (newAssignments.length === 1) {
          const t = newAssignments[0];
          const parts = [
            `#${t.id}`,
            t.subject && `[${t.subject}]`,
            t.priority && `Priority: ${t.priority}`,
            t.company?.name && `Customer: ${t.company.name}`,
            'has been assigned to you',
          ].filter(Boolean);
          message = parts.join(' · ');
          ticketId = t.id;
        } else {
          message = `${newAssignments.length} tickets have been assigned to you`;
        }

        showNotification(title, message, ticketId);
        playSound();
      }
    }

    // Update previous tickets reference
    previousTicketsRef.current = {
      new_tickets: currentNewTickets,
      my_tickets: currentMyTickets,
    };
  }, [tickets, lastUpdated, settings, user]);

  const requestNotificationPermission = async (): Promise<boolean> => {
    try {
      const permission = await requestPermission();
      return permission === 'granted';
    } catch (error) {
      console.error('Could not request notification permission:', error);
      return false;
    }
  };

  const value = {
    settings,
    updateSettings,
    showNotification,
    playSound,
    requestNotificationPermission,
  };

  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotifications() {
  const context = useContext(NotificationContext);
  if (context === undefined) {
    throw new Error('useNotifications must be used within a NotificationProvider');
  }
  return context;
}