import { useCallback, useState } from 'react';
import {
  CalendarClock,
  Copy,
  ExternalLink,
  Eye,
  Loader2,
  Pause,
  Play,
  UserPlus,
} from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/contexts/AuthContext';
import { apiClient } from '@/lib/api';
import { toPlayerState } from '@/lib/playerStatus';
import { syncRefresh } from '@/lib/sync';
import { WindowManager } from '@/lib/windowManager';
import type { Ticket } from '@/types/api';

/**
 * Right-click actions for a ticket row.
 *
 * The two the board is asked for most — start the clock, take the ticket — are
 * a round trip away from the list, so making them cost a trip through the
 * detail page was the wrong default.
 *
 * Stopping the clock is deliberately absent. `stop` ends a work session and the
 * server expects the accompanying history entry; offering it here would let
 * someone end a session from a menu with no record of what was done. That stays
 * on the detail page, where the description field is.
 */
export function TicketRowMenu({
  ticket,
  onOpen,
  onSchedule,
  children,
}: {
  ticket: Ticket;
  onOpen: () => void;
  /** Asks the board to open its scheduling dialog for this ticket. */
  onSchedule: () => void;
  children: React.ReactNode;
}) {
  const { user } = useAuth();
  const [isBusy, setIsBusy] = useState(false);

  const state = toPlayerState(ticket.playStatus);

  /**
   * `/TicketTerminieren` refuses a ticket that already belongs to someone else,
   * so the item is only offered when it can actually succeed. `my_ticket_id`
   * rather than the status: a ticket can be unassigned in several statuses.
   */
  const canClaim = user ? ticket.my_ticket_id === 0 || ticket.my_ticket_id === user.id : false;

  const run = useCallback(async (action: () => Promise<void>) => {
    setIsBusy(true);
    try {
      await action();
    } finally {
      setIsBusy(false);
    }
  }, []);

  const handleTimer = () =>
    void run(async () => {
      if (!user) return;
      try {
        // `playStatus` on a list row is this user's own player state — the
        // relation is filtered by user_id server-side — so it says what the
        // next action should be without asking.
        const response =
          state === 'playing'
            ? await apiClient.pause(ticket.id, user.id, ticket.playStatus ?? 1)
            : state === 'paused'
              ? await apiClient.resume(ticket.id, user.id)
              : await apiClient.play(ticket.id, user.id);

        if (response.status === 'success') {
          toast.success(
            state === 'playing'
              ? `Zeiterfassung für #${ticket.id} pausiert`
              : `Zeiterfassung für #${ticket.id} läuft`,
          );
          await syncRefresh();
          return;
        }

        if (response.status === 'exists') {
          toast.warning('Bereits in Bearbeitung', {
            description: 'Jemand anderes arbeitet gerade an diesem Ticket.',
          });
          return;
        }

        toast.error('Zeiterfassung konnte nicht geändert werden', {
          description: response.message || 'Der Server hat die Anfrage abgelehnt.',
        });
      } catch (error) {
        console.error('Timer action failed:', error);
        toast.error('Zeiterfassung konnte nicht geändert werden', {
          description: 'Verbindung prüfen und erneut versuchen.',
        });
      }
    });

  const handleClaim = () =>
    void run(async () => {
      if (!user) return;
      try {
        const response = await apiClient.ticketTerminieren(
          ticket.id,
          user.id,
          new Date().toISOString().slice(0, 10),
        );

        if (response.result === 'success') {
          toast.success(`Ticket #${ticket.id} übernommen`);
          await syncRefresh();
        } else {
          // The controller returns an empty body when the ticket is missing or
          // the handler refuses, so an absent result is a failure, not a gap.
          toast.error('Ticket konnte nicht übernommen werden', {
            description: response.message || 'Es ist möglicherweise bereits vergeben.',
          });
        }
      } catch (error) {
        console.error('Failed to claim ticket:', error);
        toast.error('Ticket konnte nicht übernommen werden');
      }
    });

  const handleCopyNumber = async () => {
    try {
      await navigator.clipboard.writeText(String(ticket.id));
      toast.success(`#${ticket.id} kopiert`);
    } catch {
      toast.error('Ticketnummer konnte nicht kopiert werden');
    }
  };

  const handleOpenWindow = async () => {
    try {
      await WindowManager.openTicketInNewWindow(ticket);
    } catch (error) {
      console.error('Failed to open ticket in new window:', error);
      toast.error('Fenster konnte nicht geöffnet werden');
    }
  };

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuLabel className="font-mono">
          #{ticket.id} · {ticket.company?.name || 'Ohne Kunde'}
        </ContextMenuLabel>
        <ContextMenuSeparator />

        <ContextMenuItem onSelect={onOpen}>
          <Eye />
          Öffnen
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => void handleOpenWindow()}>
          <ExternalLink />
          In neuem Fenster öffnen
        </ContextMenuItem>

        <ContextMenuSeparator />

        <ContextMenuItem disabled={!user || isBusy} onSelect={handleTimer}>
          {isBusy ? <Loader2 className="animate-spin" /> : state === 'playing' ? <Pause /> : <Play />}
          {state === 'playing'
            ? 'Zeiterfassung pausieren'
            : state === 'paused'
              ? 'Zeiterfassung fortsetzen'
              : 'Zeiterfassung starten'}
        </ContextMenuItem>

        <ContextMenuItem disabled={!canClaim || isBusy} onSelect={handleClaim}>
          <UserPlus />
          Mir zuweisen
        </ContextMenuItem>

        <ContextMenuItem disabled={!user} onSelect={onSchedule}>
          <CalendarClock />
          Terminieren …
        </ContextMenuItem>

        <ContextMenuSeparator />

        <ContextMenuItem onSelect={() => void handleCopyNumber()}>
          <Copy />
          Ticketnummer kopieren
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

/** Rounds a date up to the next quarter hour — the granularity appointments use. */
function nextQuarterHour(from = new Date()): Date {
  const date = new Date(from);
  date.setSeconds(0, 0);
  date.setMinutes(Math.ceil((date.getMinutes() + 1) / 15) * 15);
  return date;
}

function pad(value: number): string {
  return value.toString().padStart(2, '0');
}

/**
 * Schedules a ticket for a date and time.
 *
 * One dialog for the whole board rather than one per row: with a hundred rows
 * on screen that is a hundred fewer mounted dialogs.
 *
 * Backed by `ticketTerminierenApi` with mode 2, the only endpoint that creates
 * a real appointment — `/TicketTerminieren` looks like it should, but its
 * controller passes `zgw = false`, which makes the handler ignore the date
 * entirely and just assign the ticket. That is why "Mir zuweisen" and
 * "Terminieren" are separate items rather than one.
 */
export function ScheduleTicketDialog({
  ticket,
  onClose,
}: {
  ticket: Ticket | null;
  onClose: () => void;
}) {
  const { user } = useAuth();
  const [isSaving, setIsSaving] = useState(false);
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');

  // Reset to the next quarter hour each time the dialog opens for a ticket.
  const key = ticket?.id ?? null;
  const [lastKey, setLastKey] = useState<number | null>(null);
  if (key !== lastKey) {
    setLastKey(key);
    const start = nextQuarterHour();
    setDate(`${start.getFullYear()}-${pad(start.getMonth() + 1)}-${pad(start.getDate())}`);
    setTime(`${pad(start.getHours())}:${pad(start.getMinutes())}`);
  }

  const handleSave = async () => {
    if (!ticket || !user || !date || !time) return;

    setIsSaving(true);
    try {
      // The controller runs this through strtotime, so a plain SQL-shaped
      // string is what it expects.
      const response = await apiClient.ticketTerminierenApi(
        ticket.id,
        user.id,
        `${date} ${time}:00`,
        2,
      );

      if (response.status === 'success') {
        toast.success(`Ticket #${ticket.id} terminiert`, {
          description: `${date} um ${time} Uhr`,
        });
        await syncRefresh();
        onClose();
      } else {
        toast.error('Ticket konnte nicht terminiert werden', {
          description: response.message || 'Der Server hat die Anfrage abgelehnt.',
        });
      }
    } catch (error) {
      console.error('Failed to schedule ticket:', error);
      toast.error('Ticket konnte nicht terminiert werden');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={ticket !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Ticket terminieren</DialogTitle>
          <DialogDescription>
            {ticket ? `#${ticket.id} — ${ticket.summary || 'Ohne Betreff'}` : ''}
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="schedule-date">Datum</Label>
            <Input
              id="schedule-date"
              type="date"
              value={date}
              onChange={(event) => setDate(event.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="schedule-time">Uhrzeit</Label>
            <Input
              id="schedule-time"
              type="time"
              step={900}
              value={time}
              onChange={(event) => setTime(event.target.value)}
            />
          </div>
        </div>

        <p className="text-xs text-muted-foreground">
          Das Ticket wird auf „Terminiert“ gesetzt und dir zugewiesen, falls es noch frei ist.
        </p>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isSaving}>
            Abbrechen
          </Button>
          <Button onClick={() => void handleSave()} disabled={isSaving || !date || !time}>
            {isSaving && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
            Terminieren
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
