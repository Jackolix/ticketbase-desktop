import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { sendNotification, isPermissionGranted, requestPermission, onAction, registerActionTypes } from '@tauri-apps/plugin-notification';
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { getTicket, onSyncChanged, syncSetInterval } from '@/lib/sync';

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

/**
 * Only one window may announce a ticket. Every window mounts this provider, so
 * without this guard each open ticket popup would fire its own toast and sound
 * for the same ticket.
 */
function isMainWindow(): boolean {
  try {
    return getCurrentWindow().label === 'main';
  } catch {
    return true;
  }
}

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  
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

  const audioRef = useRef<HTMLAudioElement | null>(null);

  // The sync subscription is bound once for the window's lifetime, so it reads
  // the current settings through a ref rather than re-subscribing on each edit.
  const settingsRef = useRef(settings);
  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    // Dispatch custom event for same-window updates
    window.dispatchEvent(new Event('notification-settings-changed'));
  }, [settings]);

  // The refresh interval now drives the Rust sync engine rather than a timer in
  // each window. The engine enforces its own floor, because one pull is
  // expensive server-side.
  useEffect(() => {
    if (!isMainWindow()) return;
    void syncSetInterval(settings.ticketRefreshInterval).catch((error) => {
      console.error('Failed to set sync interval:', error);
    });
  }, [settings.ticketRefreshInterval]);

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

        // Clicking a notification brings the app forward and shows the ticket.
        //
        // This used to spawn a new ticket window, which left the user with a
        // window to close and did nothing to raise the app if it was minimised
        // or behind something. show_ticket raises an already-open window for
        // that ticket if there is one, and otherwise raises the main window and
        // navigates it.
        unlistenAction = await onAction((action: any) => {
          const raw = action.notification?.extra?.ticketId;
          const ticketId = typeof raw === 'string' ? parseInt(raw, 10) : Number(raw);
          if (Number.isFinite(ticketId) && ticketId > 0) {
            invoke('show_ticket', { ticketId }).catch(console.error);
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

  // Announce genuinely new tickets.
  //
  // Change detection lives in the Rust sync engine, which sees each pull once,
  // so a ticket is announced once no matter how many windows are open. This
  // used to diff the ticket lists inside every window's provider — five open
  // ticket windows meant five toasts and five sounds for the same ticket.
  //
  // The engine also suppresses the first sync after sign-in, so signing in does
  // not announce the entire existing backlog.
  useEffect(() => {
    if (!isMainWindow()) return;

    let disposed = false;
    let unlisten: (() => void) | undefined;

    const describe = async (ids: number[], assigned: boolean) => {
      if (ids.length === 0) return;

      const title = ids.length === 1
        ? (assigned ? 'New Ticket Assigned' : 'New Ticket Available')
        : `${ids.length} ${assigned ? 'New Tickets Assigned' : 'New Tickets Available'}`;

      let message: string;
      let ticketId: number | undefined;

      if (ids.length === 1) {
        ticketId = ids[0];
        const t = await getTicket(ticketId).catch(() => null);
        message = t
          ? [
              `#${t.id}`,
              t.subject && `[${t.subject}]`,
              t.priority && `Priority: ${t.priority}`,
              t.company?.name && `Customer: ${t.company.name}`,
              assigned ? 'has been assigned to you' : t.summary,
            ].filter(Boolean).join(' · ')
          : `Ticket #${ticketId}`;
      } else {
        message = assigned
          ? `${ids.length} tickets have been assigned to you`
          : `${ids.length} new tickets are now available in your pool`;
      }

      showNotification(title, message, ticketId);
      playSound();
    };

    const subscribe = async () => {
      const off = await onSyncChanged(async (change) => {
        if (settingsRef.current.enableNewTicketNotifications) {
          await describe(change.newlyInPool, false);
        }
        if (settingsRef.current.enableAssignedTicketNotifications) {
          await describe(change.newlyAssigned, true);
        }
      });

      if (disposed) {
        off();
        return;
      }
      unlisten = off;
    };

    void subscribe();

    return () => {
      disposed = true;
      if (unlisten) unlisten();
    };
    // showNotification and playSound read the latest settings through a ref, so
    // this subscribes once for the window's lifetime rather than re-binding on
    // every settings change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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