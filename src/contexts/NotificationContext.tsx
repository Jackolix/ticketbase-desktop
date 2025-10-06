import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { sendNotification, isPermissionGranted, requestPermission } from '@tauri-apps/plugin-notification';
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
  showNotification: (title: string, message: string, options?: NotificationOptions) => void;
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

  // Request Tauri notification permission on mount
  useEffect(() => {
    const checkPermission = async () => {
      try {
        const permissionGranted = await isPermissionGranted();
        if (!permissionGranted) {
          await requestPermission();
        }
      } catch (error) {
        console.warn('Could not request notification permission:', error);
      }
    };
    
    checkPermission();
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

  const showNotification = async (title: string, message: string, options?: NotificationOptions) => {
    // Try to use Tauri native notifications first
    try {
      const permissionGranted = await isPermissionGranted();
      if (permissionGranted) {
        await sendNotification({
          title,
          body: message,
          icon: 'icon.png', // Tauri uses relative path from public folder
        });
      }
    } catch (error) {
      console.warn('Could not send Tauri notification, falling back to browser notification:', error);
      
      // Fallback to browser notification
      if ('Notification' in window && Notification.permission === 'granted') {
        const notification = new Notification(title, {
          body: message,
          icon: '/icon.png',
          badge: '/icon.png',
          ...options,
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
        
        const message = newTicketsAdded.length === 1
          ? `${newTicketsAdded[0].subject} - ${newTicketsAdded[0].summary}`
          : `${newTicketsAdded.length} new tickets are now available in your pool`;

        showNotification(title, message);
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
        
        const message = newAssignments.length === 1
          ? `${newAssignments[0].subject} has been assigned to you`
          : `${newAssignments.length} tickets have been assigned to you`;

        showNotification(title, message);
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