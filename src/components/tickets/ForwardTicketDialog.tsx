import { useCallback, useEffect, useMemo, useState } from 'react';
import { Forward, Loader2, Search } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
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
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/contexts/AuthContext';
import { apiClient } from '@/lib/api';
import { forwardStatus, useSaveStatuses } from '@/lib/saveStatuses';
import { syncRefresh } from '@/lib/sync';
import { saveWorkEntry, WorkEntryError } from '@/lib/workEntry';
import type { Ticket, User } from '@/types/api';

interface ForwardTicketDialogProps {
  ticket: Ticket;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called after a successful forward, so the detail view can refresh. */
  onForwarded?: () => void;
}

/**
 * Forwards a ticket to a colleague.
 *
 * There is no dedicated forward endpoint: forwarding is a work entry saved
 * with the "assigned" status from the server's catalog plus retermUserId. That
 * reassigns my_ticket_id, creates the appointment record (dated now) and sends
 * the colleague the "Weitergeleitet" mail. Like every work entry it goes
 * through the timer and books time (see workEntry.ts), so the dialog asks for
 * the minutes; without them the server would round up to a full block.
 * Only the ticket's owner can forward: for anyone else the server saves a
 * help entry and leaves the ticket alone.
 *
 * The colleague list comes from getLocationUsers on the current user's own
 * location — the people at your location are your team. That is the only user
 * listing the API exposes, so a technician at a different location will not
 * appear here.
 */
export function ForwardTicketDialog({
  ticket,
  open,
  onOpenChange,
  onForwarded,
}: ForwardTicketDialogProps) {
  const { user } = useAuth();

  const [colleagues, setColleagues] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [note, setNote] = useState('');
  const [minutes, setMinutes] = useState('');
  const [isSending, setIsSending] = useState(false);
  const status = forwardStatus(useSaveStatuses());
  const minutesValue = parseInt(minutes, 10) || 0;

  const loadColleagues = useCallback(async () => {
    if (!user) return;
    setIsLoading(true);
    setLoadError(null);
    try {
      const response = await apiClient.getLocationUsers(user.location_id);
      const users = (response.users ?? response.data?.users ?? []) as User[];
      // Forwarding to yourself is not forwarding.
      setColleagues(users.filter((u) => u.id !== user.id));
    } catch (error) {
      console.error('Failed to load colleagues:', error);
      setLoadError('Die Kollegenliste konnte nicht geladen werden.');
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (!open) return;
    setSearch('');
    setSelectedId(null);
    setNote('');
    setMinutes('');
    void loadColleagues();
  }, [open, loadColleagues]);

  const results = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return colleagues;
    return colleagues.filter((c) =>
      [c.name, c.email].filter(Boolean).some((field) => field.toLowerCase().includes(needle)),
    );
  }, [colleagues, search]);

  const handleForward = async () => {
    if (!user || selectedId == null) return;

    const target = colleagues.find((c) => c.id === selectedId);
    if (!status || minutesValue <= 0) return;

    setIsSending(true);
    try {
      await saveWorkEntry({
        ticketId: ticket.id,
        userId: user.id,
        text: note.trim() || `Ticket weitergeleitet an ${target?.name ?? 'Kollegen'}.`,
        statusId: status.id,
        minutes: minutesValue,
        assigneeId: selectedId,
      });

      toast.success(`Ticket #${ticket.id} an ${target?.name ?? 'Kollegen'} weitergeleitet`);
      onOpenChange(false);
      await syncRefresh();
      onForwarded?.();
    } catch (error) {
      console.error('Failed to forward ticket:', error);
      toast.error('Ticket konnte nicht weitergeleitet werden', {
        description:
          error instanceof WorkEntryError ? error.message : 'Verbindung prüfen und erneut versuchen.',
      });
    } finally {
      setIsSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Ticket #{ticket.id} weiterleiten</DialogTitle>
          <DialogDescription>
            Der Kollege wird zugewiesen, das Ticket auf „{status?.name ?? 'Zugewiesen'}“ gesetzt
            und per E-Mail informiert. Dabei wird ein Arbeitseintrag mit deiner Zeit gespeichert.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Kollegen suchen…"
              className="h-8 pl-8 text-xs"
            />
          </div>

          <div className="max-h-56 overflow-y-auto rounded-md border">
            {isLoading ? (
              <div className="divide-y">
                {Array.from({ length: 4 }, (_, i) => (
                  <div key={i} className="animate-pulse px-3 py-2">
                    <div className="h-3 w-32 rounded bg-muted" />
                  </div>
                ))}
              </div>
            ) : loadError ? (
              <div className="space-y-2 p-4 text-center">
                <p className="text-xs text-muted-foreground">{loadError}</p>
                <Button variant="outline" size="sm" onClick={() => void loadColleagues()}>
                  Erneut versuchen
                </Button>
              </div>
            ) : results.length === 0 ? (
              <p className="p-4 text-center text-xs text-muted-foreground">
                {search ? 'Niemand gefunden' : 'Keine Kollegen an deinem Standort'}
              </p>
            ) : (
              <ul className="divide-y">
                {results.map((colleague) => (
                  <li key={colleague.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(colleague.id)}
                      aria-pressed={selectedId === colleague.id}
                      className={[
                        'flex w-full items-center gap-2 px-3 py-2 text-left text-xs transition-colors',
                        selectedId === colleague.id
                          ? 'bg-accent text-accent-foreground'
                          : 'hover:bg-accent/50',
                      ].join(' ')}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{colleague.name}</span>
                        {colleague.email && (
                          <span className="block truncate text-[10px] text-muted-foreground">
                            {colleague.email}
                          </span>
                        )}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="space-y-1">
            <Label htmlFor="forward-note" className="text-xs">
              Notiz für den Verlauf
            </Label>
            <Textarea
              id="forward-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Optional — warum wird weitergeleitet?"
              rows={2}
              className="text-xs"
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="forward-minutes" className="text-xs">
              Gebuchte Zeit (Min.)
            </Label>
            <Input
              id="forward-minutes"
              type="number"
              min="1"
              required
              value={minutes}
              onChange={(e) => setMinutes(e.target.value)}
              placeholder="z. B. 5"
              className="h-8 w-[120px] text-xs"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} disabled={isSending}>
            Abbrechen
          </Button>
          <Button
            size="sm"
            onClick={handleForward}
            disabled={isSending || selectedId == null || minutesValue <= 0 || !status}
            className="gap-1.5"
          >
            {isSending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Forward className="h-3.5 w-3.5" />
            )}
            Weiterleiten
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
