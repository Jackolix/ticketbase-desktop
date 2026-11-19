import { useCallback, useEffect, useState } from 'react';
import { Bell, CheckCheck, Inbox, MessageSquare, Trash2, UserCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  clearNotifications,
  listNotifications,
  markNotificationsRead,
  onNotificationsChanged,
  type HubNotification,
} from '@/lib/sync';
import { cn } from '@/lib/utils';

interface NotificationHubProps {
  /** Opens a ticket in the main window. */
  onOpenTicket: (ticketId: number) => void;
}

/**
 * The bell in the titlebar: everything the app announced, newest first.
 *
 * OS notifications vanish after a few seconds and toasts sooner, so a customer
 * reply that arrived during a call was easy to miss entirely. The entries live
 * in the local store, which the main window writes as it announces, so every
 * window shows the same list and it survives a restart.
 */
export function NotificationHub({ onOpenTicket }: NotificationHubProps) {
  const [items, setItems] = useState<HubNotification[]>([]);
  const [open, setOpen] = useState(false);
  const [, forceTick] = useState(0);

  const load = useCallback(async () => {
    try {
      setItems(await listNotifications(100));
    } catch (error) {
      console.warn('Could not load notifications:', error);
    }
  }, []);

  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | undefined;

    void load();
    void onNotificationsChanged(() => void load()).then((off) => {
      if (disposed) off();
      else unlisten = off;
    });

    return () => {
      disposed = true;
      if (unlisten) unlisten();
    };
  }, [load]);

  // Keep relative times honest while the list is open.
  useEffect(() => {
    if (!open) return;
    const interval = setInterval(() => forceTick((n) => n + 1), 30_000);
    return () => clearInterval(interval);
  }, [open]);

  const unread = items.filter((n) => !n.read).length;

  const openEntry = (n: HubNotification) => {
    if (!n.read) void markNotificationsRead({ id: n.id }).catch(console.error);
    if (n.ticketId) onOpenTicket(n.ticketId);
  };

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative h-7 w-7"
          aria-label={unread > 0 ? `Benachrichtigungen, ${unread} ungelesen` : 'Benachrichtigungen'}
          title="Benachrichtigungen"
        >
          <Bell className="h-3.5 w-3.5" />
          {unread > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-tone-danger px-1 text-[9px] font-semibold leading-none text-white tabular-nums">
              {unread > 99 ? '99+' : unread}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-[380px] max-w-[calc(100vw-16px)] p-0">
        <div className="flex items-center justify-between border-b px-3 py-2">
          <div className="text-sm font-medium">
            Benachrichtigungen
            {unread > 0 && (
              <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                {unread} ungelesen
              </span>
            )}
          </div>
          <div className="flex items-center gap-0.5">
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              disabled={unread === 0}
              onClick={() => void markNotificationsRead().catch(console.error)}
              aria-label="Alle als gelesen markieren"
              title="Alle als gelesen markieren"
            >
              <CheckCheck className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              disabled={items.length === 0}
              onClick={() => void clearNotifications().catch(console.error)}
              aria-label="Liste leeren"
              title="Liste leeren"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        {items.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-6 py-10 text-center text-sm text-muted-foreground">
            <Bell className="h-5 w-5 opacity-50" />
            <p>Keine Benachrichtigungen.</p>
            <p className="text-xs">
              Neue Nachrichten zu deinen Tickets erscheinen hier, sobald sie eintreffen.
            </p>
          </div>
        ) : (
          <div className="max-h-[420px] overflow-y-auto py-1">
            {items.map((n) => (
              <DropdownMenuItem
                key={n.id}
                onSelect={() => openEntry(n)}
                className={cn(
                  'mx-1 flex cursor-pointer items-start gap-2.5 rounded-md px-2 py-2',
                  !n.read && 'bg-tone-info-soft/60',
                )}
              >
                <KindIcon kind={n.kind} />
                <div className="min-w-0 flex-1 space-y-0.5">
                  <div className="flex items-baseline gap-2">
                    <span className={cn('truncate text-sm', !n.read && 'font-medium')}>
                      {n.title}
                    </span>
                    <span className="ml-auto shrink-0 text-[11px] text-muted-foreground tabular-nums">
                      {relativeTime(n.createdAt)}
                    </span>
                  </div>
                  {n.body && (
                    <p className="line-clamp-2 whitespace-pre-line text-xs text-muted-foreground">
                      {n.body}
                    </p>
                  )}
                </div>
                {!n.read && (
                  <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-tone-info" aria-label="ungelesen" />
                )}
              </DropdownMenuItem>
            ))}
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function KindIcon({ kind }: { kind: HubNotification['kind'] }) {
  const { Icon, tone } =
    kind === 'message'
      ? { Icon: MessageSquare, tone: 'bg-tone-info-soft text-tone-info' }
      : kind === 'assigned'
        ? { Icon: UserCheck, tone: 'bg-tone-success-soft text-tone-success' }
        : { Icon: Inbox, tone: 'bg-tone-neutral-soft text-tone-neutral' };

  return (
    <span className={cn('mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full', tone)}>
      <Icon className="h-3.5 w-3.5" />
    </span>
  );
}

function relativeTime(timestamp: number): string {
  const seconds = Math.max(0, Math.round((Date.now() - timestamp) / 1000));
  if (seconds < 60) return 'gerade eben';

  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `vor ${minutes} Min.`;

  const hours = Math.round(minutes / 60);
  if (hours < 24) return `vor ${hours} Std.`;

  const days = Math.round(hours / 24);
  if (days < 7) return days === 1 ? 'gestern' : `vor ${days} Tagen`;

  return new Date(timestamp).toLocaleDateString('de-DE');
}
