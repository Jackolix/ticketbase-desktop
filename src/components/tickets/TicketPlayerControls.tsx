import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/contexts/AuthContext';
import { apiClient } from '@/lib/api';
import { parseTicketDate } from '@/lib/ticketDate';
import { STOP, toPlayerState, type PlayerState } from '@/lib/playerStatus';
import { isSaveStatusComplete, useSaveStatuses } from '@/lib/saveStatuses';
import { timerRecord, timerStatus, type Timer } from '@/lib/sync';
import { saveWorkEntry, toServerDateTime, WorkEntryError } from '@/lib/workEntry';
import { SaveStatusFields } from './SaveStatusFields';
import { Ticket } from '@/types/api';
import {
  Play,
  Pause,
  Square,
  RotateCcw,
  Clock,
  Loader2
} from 'lucide-react';

interface TicketPlayerControlsProps {
  ticket: Ticket;
  onStatusChange?: () => void;
}

/** How often to reconcile with the server, to catch changes made elsewhere. */
const STATUS_POLL_MS = 30_000;

/**
 * Ticket timer.
 *
 * The server owns *whether* the clock is running; this client owns *how long*
 * it has been running, because the backend cannot say.
 * `APITicketPlayerController::getPlayerStatus` computes the elapsed seconds
 * into `$total_raw_time` and then assigns `$total_raw_time = 0` on the next
 * line, so that field is always "0"; and `total_time` is a billing figure
 * rounded up to the customer's block, which `calculateTotalTime` returns as 0
 * until the first pause. Reading either one on mount is what made a reopened
 * window start counting from zero.
 *
 * So elapsed time comes from the local record in SQLite, which both windows
 * share and which survives a restart. The two are reconciled on every poll:
 * if the server says the clock is running and we have no record of it — it was
 * started from the web UI, say — the record is seeded from the server's
 * rounded total and the display says so, rather than quietly inventing a
 * number.
 *
 * The tick interval depends only on whether the clock is running. An earlier
 * version listed the running total in that effect's dependencies, so the
 * reconcile timer was destroyed and recreated once per second and refetched
 * status on every tick, which is what tripped the backend's rate limit.
 */
export function TicketPlayerControls({ ticket, onStatusChange }: TicketPlayerControlsProps) {
  const { user } = useAuth();
  const userId = user?.id;

  const [playerState, setPlayerState] = useState<PlayerState>('stopped');
  const [timer, setTimer] = useState<Timer | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  /**
   * True when the elapsed time was seeded from the server's rounded total
   * rather than measured here — the clock was started somewhere this app never
   * saw. The number is then a lower bound, and the UI says so.
   */
  const [isApproximate, setIsApproximate] = useState(false);

  const [isBusy, setIsBusy] = useState(false);
  const [isStopDialogOpen, setIsStopDialogOpen] = useState(false);
  const [stopMessage, setStopMessage] = useState('');
  // Empty until the status list loads; SaveStatusFields then picks its default.
  const [stopStatus, setStopStatus] = useState('');
  const [stopAppointment, setStopAppointment] = useState('');
  const [customTime, setCustomTime] = useState('');
  const saveStatuses = useSaveStatuses();
  /**
   * The server timer is stopped but no entry was saved — a save attempt failed
   * after the stop. The server only accepts an entry in this state, so the
   * finish dialog must stay reachable instead of offering "Starten".
   */
  const [stoppedUnsaved, setStoppedUnsaved] = useState(false);

  // Mirrors the computation in the Rust store, so a tick between polls shows
  // the same number a fresh read would.
  const elapsedMs = useMemo(() => {
    if (!timer) return 0;
    const current =
      timer.running && timer.startedAt !== null ? Math.max(0, nowMs - timer.startedAt) : 0;
    return Math.max(0, timer.accumulatedMs) + current;
  }, [timer, nowMs]);

  /**
   * Reconciles the server's idea of the state with our record of the elapsed
   * time.
   *
   * The server is authoritative about running/paused/stopped — it is where
   * another device or the web UI would have changed it. It is not authoritative
   * about duration, for the reasons in the component docs.
   */
  const refreshStatus = useCallback(async () => {
    if (!userId) return;

    let serverState: PlayerState = 'stopped';
    let serverMinutes = 0;
    let unsaved = false;

    try {
      const response = await apiClient.getPlayerStatus(ticket.id, userId);
      if (response.status !== 'success') return;

      const data = response.playerStatus;
      if (data) {
        serverState = toPlayerState(data.play_status);
        serverMinutes = data.total_time || 0;
        unsaved = data.play_status === STOP;
      }
    } catch (error) {
      // A failed poll must not reset a running timer — that would look like
      // lost work. Keep what we have and try again next tick.
      console.error('Failed to fetch player status:', error);
      return;
    }

    setPlayerState(serverState);
    setStoppedUnsaved(unsaved);
    setNowMs(Date.now());

    try {
      if (unsaved) {
        // Keep the measured time on screen for the retry, but frozen.
        const local = await timerStatus(ticket.id);
        if (local === null) {
          setIsApproximate(true);
          await timerRecord(ticket.id, 'resume', serverMinutes * 60_000);
          setTimer(await timerRecord(ticket.id, 'pause'));
        } else {
          setTimer(local.running ? await timerRecord(ticket.id, 'pause') : local);
        }
        return;
      }

      if (serverState === 'stopped') {
        await timerRecord(ticket.id, 'clear');
        setTimer(null);
        setIsApproximate(false);
        return;
      }

      const local = await timerStatus(ticket.id);

      if (serverState === 'playing') {
        // Already running locally: leave it alone. Two windows both reconcile,
        // and the second must not restart the first.
        if (local?.running) {
          setTimer(local);
          return;
        }
        if (local === null) setIsApproximate(true);
        setTimer(await timerRecord(ticket.id, 'resume', serverMinutes * 60_000));
        return;
      }

      // Paused server-side.
      if (local === null) {
        setIsApproximate(true);
        await timerRecord(ticket.id, 'resume', serverMinutes * 60_000);
        setTimer(await timerRecord(ticket.id, 'pause'));
        return;
      }
      setTimer(local.running ? await timerRecord(ticket.id, 'pause') : local);
    } catch (error) {
      console.error('Failed to reconcile the local timer:', error);
    }
  }, [ticket.id, userId]);

  // Reconcile with the server on mount and periodically, to pick up changes
  // made from the web UI or another device.
  useEffect(() => {
    void refreshStatus();
    const interval = setInterval(() => {
      void refreshStatus();
    }, STATUS_POLL_MS);
    return () => clearInterval(interval);
  }, [refreshStatus]);

  // Tick the display once a second, only while the clock is actually running.
  // The dependency is a boolean, so this interval is created once per run
  // rather than once per second.
  const isTicking = timer?.running ?? false;
  useEffect(() => {
    if (!isTicking) return;
    const interval = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [isTicking]);

  const run = useCallback(
    async (action: () => Promise<void>) => {
      setIsBusy(true);
      try {
        await action();
      } finally {
        setIsBusy(false);
      }
    },
    [],
  );

  const handlePlay = () =>
    run(async () => {
      if (!userId) return;
      try {
        const response = await apiClient.play(ticket.id, userId);

        if (response.status === 'success') {
          setPlayerState('playing');
          setIsApproximate(false);
          setNowMs(Date.now());
          setTimer(await timerRecord(ticket.id, 'start'));
          onStatusChange?.();
          return;
        }

        if (response.status === 'exists') {
          toast.warning('Bereits in Bearbeitung', {
            description: 'Jemand anderes arbeitet gerade an diesem Ticket.',
          });
          await refreshStatus();
          return;
        }

        toast.error('Zeiterfassung konnte nicht gestartet werden', {
          description: response.message || 'Der Server hat die Anfrage abgelehnt.',
        });
      } catch (error) {
        console.error('Failed to start ticket:', error);
        toast.error('Zeiterfassung konnte nicht gestartet werden', {
          description: 'Verbindung prüfen und erneut versuchen.',
        });
      }
    });

  const handlePause = () =>
    run(async () => {
      if (!userId) return;
      try {
        // current_state 1 = PLAY
        const response = await apiClient.pause(ticket.id, userId, 1);
        if (response.status === 'success') {
          setPlayerState('paused');
          setTimer(await timerRecord(ticket.id, 'pause'));
          onStatusChange?.();
        } else {
          toast.error('Zeiterfassung konnte nicht pausiert werden');
        }
      } catch (error) {
        console.error('Failed to pause ticket:', error);
        toast.error('Zeiterfassung konnte nicht pausiert werden');
      }
    });

  const handleResume = () =>
    run(async () => {
      if (!userId) return;
      try {
        // current_state 2 = PAUSE
        const response = await apiClient.resume(ticket.id, userId, 2);
        if (response.status === 'success') {
          setNowMs(Date.now());
          setPlayerState('playing');
          setTimer(await timerRecord(ticket.id, 'resume'));
          onStatusChange?.();
        } else {
          toast.error('Zeiterfassung konnte nicht fortgesetzt werden');
        }
      } catch (error) {
        console.error('Failed to resume ticket:', error);
        toast.error('Zeiterfassung konnte nicht fortgesetzt werden');
      }
    });

  const handleStop = () =>
    run(async () => {
      if (!userId || !stopMessage.trim()) return;

      const status = saveStatuses.find((s) => String(s.id) === stopStatus);
      if (!status) return;

      try {
        const trackedMinutes = Math.ceil(elapsedMs / 60_000);
        const submittedMinutes = parseInt(customTime, 10) || 0;

        await saveWorkEntry({
          ticketId: ticket.id,
          userId,
          text: stopMessage,
          statusId: status.id,
          // A correction only when the technician actually changed the number;
          // otherwise the server books its own measurement.
          ...(submittedMinutes > 0 &&
            submittedMinutes !== trackedMinutes && {
              minutes: submittedMinutes,
              measuredMinutes: trackedMinutes,
            }),
          ...(status.requires_date && {
            assigneeId: userId,
            appointment: toServerDateTime(new Date(stopAppointment)),
          }),
        });

        setPlayerState('stopped');
        setStoppedUnsaved(false);
        await timerRecord(ticket.id, 'clear');
        setTimer(null);
        setIsApproximate(false);
        setIsStopDialogOpen(false);
        setStopMessage('');
        setStopAppointment('');
        setCustomTime('');
        toast.success(`${submittedMinutes || trackedMinutes} Min. auf Ticket #${ticket.id} gebucht`);
        onStatusChange?.();
      } catch (error) {
        console.error('Failed to stop ticket and save work:', error);
        toast.error('Arbeit konnte nicht gespeichert werden', {
          description:
            error instanceof WorkEntryError
              ? error.message
              : 'Es wurde nichts gebucht. Verbindung prüfen und erneut versuchen.',
        });
        // The timer may now be stopped server-side; show that state.
        await refreshStatus();
      }
    });

  const handleStopClick = () => {
    setCustomTime(Math.ceil(elapsedMs / 60_000).toString());
    setIsStopDialogOpen(true);
  };

  const scheduledFor = ticket.ticket_start
    ? parseTicketDate(ticket.ticket_start)?.toLocaleString() ?? ticket.ticket_start
    : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Zeiterfassung
          </div>
          <Badge variant={STATUS_BADGE[playerState]}>
            <div className="flex items-center gap-1">
              {STATUS_ICON[playerState]}
              {STATUS_LABEL[playerState]}
            </div>
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="text-center">
          <div className="text-3xl font-mono font-bold tabular-nums">
            {formatDuration(elapsedMs)}
          </div>
          <p className="text-sm text-muted-foreground">
            {stoppedUnsaved ? 'Gestoppt — Arbeit noch nicht gespeichert' : STATUS_HINT[playerState]}
          </p>
          {isApproximate && (playerState !== 'stopped' || stoppedUnsaved) && (
            <p className="mt-1 text-xs text-muted-foreground">
              Vor dieser Sitzung gestartet — die Zeit ist ein Mindestwert.
            </p>
          )}
        </div>

        <div className="flex justify-center gap-2">
          {playerState === 'stopped' && !stoppedUnsaved && (
            <Button onClick={handlePlay} disabled={isBusy} className="flex items-center gap-2">
              {isBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
              Starten
            </Button>
          )}

          {playerState === 'playing' && (
            <Button
              onClick={handlePause}
              disabled={isBusy}
              variant="secondary"
              className="flex items-center gap-2"
            >
              {isBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Pause className="h-4 w-4" />}
              Pausieren
            </Button>
          )}

          {playerState === 'paused' && (
            <Button onClick={handleResume} disabled={isBusy} className="flex items-center gap-2">
              {isBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
              Fortsetzen
            </Button>
          )}

          {(playerState !== 'stopped' || stoppedUnsaved) && (
            <Dialog open={isStopDialogOpen} onOpenChange={setIsStopDialogOpen}>
              <DialogTrigger asChild>
                <Button
                  onClick={handleStopClick}
                  disabled={isBusy}
                  variant="destructive"
                  className="flex items-center gap-2"
                >
                  <Square className="h-4 w-4" />
                  Abschließen
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                  <DialogTitle>Arbeit an Ticket #{ticket.id} abschließen</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="work-description">Was wurde gemacht?</Label>
                    <Textarea
                      id="work-description"
                      placeholder="Durchgeführte Arbeiten beschreiben…"
                      value={stopMessage}
                      onChange={(e) => setStopMessage(e.target.value)}
                      rows={4}
                    />
                  </div>
                  <SaveStatusFields
                    statusId={stopStatus}
                    onStatusChange={setStopStatus}
                    appointment={stopAppointment}
                    onAppointmentChange={setStopAppointment}
                  />
                  <div className="space-y-2">
                    <Label htmlFor="custom-time">Zu buchende Zeit (Minuten)</Label>
                    <Input
                      id="custom-time"
                      type="number"
                      min="0"
                      placeholder="Minuten"
                      value={customTime}
                      onChange={(e) => setCustomTime(e.target.value)}
                    />
                    <p className="text-xs text-muted-foreground">
                      Erfasst: {formatDuration(elapsedMs)} ({Math.ceil(elapsedMs / 60_000)} Min.)
                    </p>
                  </div>
                </div>
                <DialogFooter>
                  <Button
                    variant="outline"
                    onClick={() => setIsStopDialogOpen(false)}
                    disabled={isBusy}
                  >
                    Abbrechen
                  </Button>
                  <Button
                    onClick={handleStop}
                    disabled={
                      isBusy ||
                      !stopMessage.trim() ||
                      !isSaveStatusComplete(saveStatuses, stopStatus, stopAppointment)
                    }
                  >
                    {isBusy ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : (
                      <Square className="h-4 w-4 mr-2" />
                    )}
                    Abschließen &amp; speichern
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
        </div>

        {scheduledFor && (
          <div className="text-center pt-2 border-t text-sm text-muted-foreground">
            <p>Terminiert: {scheduledFor}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

const STATUS_BADGE: Record<PlayerState, 'default' | 'secondary' | 'outline'> = {
  playing: 'default',
  paused: 'secondary',
  stopped: 'outline',
};

const STATUS_LABEL: Record<PlayerState, string> = {
  playing: 'Läuft',
  paused: 'Pausiert',
  stopped: 'Gestoppt',
};

const STATUS_HINT: Record<PlayerState, string> = {
  playing: 'Zeit läuft',
  paused: 'Zeit pausiert',
  stopped: 'Keine Zeit erfasst',
};

const STATUS_ICON: Record<PlayerState, React.ReactNode> = {
  playing: <Play className="h-3 w-3 text-green-500 fill-green-500" />,
  paused: <Pause className="h-3 w-3 text-yellow-500" />,
  stopped: <Square className="h-3 w-3 text-muted-foreground" />,
};

function formatDuration(milliseconds: number): string {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return [hours, minutes, seconds].map((n) => n.toString().padStart(2, '0')).join(':');
}
