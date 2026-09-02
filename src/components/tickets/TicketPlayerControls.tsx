import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth } from '@/contexts/AuthContext';
import { apiClient } from '@/lib/api';
import { parseTicketDate } from '@/lib/ticketDate';
import { toPlayerState, type PlayerState } from '@/lib/playerStatus';
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
 * Elapsed time is derived rather than stored: `baseMs` is the accumulated total
 * as of the last authoritative reading, and `runningSince` is when that reading
 * was taken if the clock was running. The displayed value is the sum.
 *
 * This matters because the previous version kept the running total in state and
 * listed it in its own effect's dependencies, so the 30-second reconcile timer
 * was destroyed and recreated once per second while a timer ran — and
 * refetched status on every tick, which is what tripped the backend's rate
 * limit. Here the tick interval depends only on whether the clock is running.
 */
export function TicketPlayerControls({ ticket, onStatusChange }: TicketPlayerControlsProps) {
  const { user } = useAuth();
  const userId = user?.id;

  const [playerState, setPlayerState] = useState<PlayerState>('stopped');
  const [baseMs, setBaseMs] = useState(0);
  const [runningSince, setRunningSince] = useState<number | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());

  const [isBusy, setIsBusy] = useState(false);
  const [isStopDialogOpen, setIsStopDialogOpen] = useState(false);
  const [stopMessage, setStopMessage] = useState('');
  const [stopStatus, setStopStatus] = useState('4'); // Abgeschlossen
  const [customTime, setCustomTime] = useState('');

  const elapsedMs = useMemo(
    () => baseMs + (runningSince !== null ? Math.max(0, nowMs - runningSince) : 0),
    [baseMs, runningSince, nowMs],
  );

  const applyState = useCallback((state: PlayerState, totalMinutes: number) => {
    setPlayerState(state);
    setBaseMs(totalMinutes * 60_000);
    // Anchor to now: the server's total already includes everything up to this
    // reading, so the clock continues from here.
    setRunningSince(state === 'playing' ? Date.now() : null);
    setNowMs(Date.now());
  }, []);

  const refreshStatus = useCallback(async () => {
    if (!userId) return;

    try {
      const response = await apiClient.getPlayerStatus(ticket.id, userId);
      if (response.status !== 'success') return;

      const data = response.playerStatus;
      if (!data) {
        applyState('stopped', 0);
        return;
      }

      applyState(toPlayerState(data.play_status), data.total_time || 0);
    } catch (error) {
      // A failed poll must not reset a running timer to zero — that would look
      // like lost work. Keep whatever we last knew and try again next tick.
      console.error('Failed to fetch player status:', error);
    }
  }, [ticket.id, userId, applyState]);

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
  // `runningSince` changes only on a real state change, so this interval is
  // created once per run rather than once per second.
  useEffect(() => {
    if (runningSince === null) return;
    const interval = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [runningSince]);

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
          setBaseMs(0);
          setRunningSince(Date.now());
          setNowMs(Date.now());
          onStatusChange?.();
          return;
        }

        if (response.status === 'exists') {
          toast.warning('Already in progress', {
            description: 'Someone else is working on this ticket.',
          });
          await refreshStatus();
          return;
        }

        toast.error('Could not start the timer', {
          description: response.message || 'The server rejected the request.',
        });
      } catch (error) {
        console.error('Failed to start ticket:', error);
        toast.error('Could not start the timer', {
          description: 'Check your connection and try again.',
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
          // Freeze the accumulated total, then stop the clock.
          setBaseMs(elapsedMs);
          setRunningSince(null);
          setPlayerState('paused');
          onStatusChange?.();
        } else {
          toast.error('Could not pause the timer');
        }
      } catch (error) {
        console.error('Failed to pause ticket:', error);
        toast.error('Could not pause the timer');
      }
    });

  const handleResume = () =>
    run(async () => {
      if (!userId) return;
      try {
        // current_state 2 = PAUSE
        const response = await apiClient.resume(ticket.id, userId, 2);
        if (response.status === 'success') {
          setRunningSince(Date.now());
          setNowMs(Date.now());
          setPlayerState('playing');
          onStatusChange?.();
        } else {
          toast.error('Could not resume the timer');
        }
      } catch (error) {
        console.error('Failed to resume ticket:', error);
        toast.error('Could not resume the timer');
      }
    });

  const handleStop = () =>
    run(async () => {
      if (!userId || !stopMessage.trim()) return;

      try {
        const trackedMinutes = Math.ceil(elapsedMs / 60_000);
        const submittedMinutes = parseInt(customTime, 10) || 0;

        // Record a manual correction only when the technician actually changed
        // the number; saveVerlaufApi reads the correction back out.
        if (submittedMinutes > 0 && submittedMinutes !== trackedMinutes) {
          await apiClient.correctWatch({
            ticket_id: ticket.id,
            user_id: userId,
            old_time: trackedMinutes,
            new_time: submittedMinutes,
          });
        }

        // Deliberately no call to /stop. saveVerlaufApi ends with
        // resetWorkStatus(), which clears the player state itself — and /stop
        // only acts when it receives a current_state, which this client does
        // not send. Calling it would be a no-op at best.
        const response = await apiClient.saveTicketHistory({
          ticket_id: ticket.id,
          user_id: userId,
          verlauf_text: stopMessage,
          status_id: parseInt(stopStatus, 10),
          sendMail: 0,
        });

        if (response.status !== 'success') {
          toast.error('Could not save your work', {
            description: response.message || 'The server rejected the entry.',
          });
          return;
        }

        setPlayerState('stopped');
        setBaseMs(0);
        setRunningSince(null);
        setIsStopDialogOpen(false);
        setStopMessage('');
        setCustomTime('');
        toast.success(`Saved ${submittedMinutes || trackedMinutes} minutes to ticket #${ticket.id}`);
        onStatusChange?.();
      } catch (error) {
        console.error('Failed to stop ticket and save work:', error);
        toast.error('Could not save your work', {
          description: 'Nothing was recorded. Check your connection and try again.',
        });
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
            Ticket Timer
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
          <p className="text-sm text-muted-foreground">{STATUS_HINT[playerState]}</p>
        </div>

        <div className="flex justify-center gap-2">
          {playerState === 'stopped' && (
            <Button onClick={handlePlay} disabled={isBusy} className="flex items-center gap-2">
              {isBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
              Start
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
              Pause
            </Button>
          )}

          {playerState === 'paused' && (
            <Button onClick={handleResume} disabled={isBusy} className="flex items-center gap-2">
              {isBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
              Resume
            </Button>
          )}

          {playerState !== 'stopped' && (
            <Dialog open={isStopDialogOpen} onOpenChange={setIsStopDialogOpen}>
              <DialogTrigger asChild>
                <Button
                  onClick={handleStopClick}
                  disabled={isBusy}
                  variant="destructive"
                  className="flex items-center gap-2"
                >
                  <Square className="h-4 w-4" />
                  Finish Work
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                  <DialogTitle>Finish Work on Ticket #{ticket.id}</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="work-description">Work Description</Label>
                    <Textarea
                      id="work-description"
                      placeholder="Describe what you accomplished…"
                      value={stopMessage}
                      onChange={(e) => setStopMessage(e.target.value)}
                      rows={4}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="ticket-status">Update Ticket Status</Label>
                    <Select value={stopStatus} onValueChange={setStopStatus}>
                      <SelectTrigger id="ticket-status">
                        <SelectValue placeholder="Select status" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="4">Abgeschlossen</SelectItem>
                        <SelectItem value="3">Prüfen</SelectItem>
                        <SelectItem value="2">Terminiert</SelectItem>
                        <SelectItem value="5">Offen</SelectItem>
                        <SelectItem value="6">Vor Ort</SelectItem>
                        <SelectItem value="8">Wieder geöffnet</SelectItem>
                        <SelectItem value="9">Warten auf Rückmeldung vom Ticketbenutzer</SelectItem>
                        <SelectItem value="11">Warten auf Rückmeldung (Extern)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="custom-time">Time to Submit (minutes)</Label>
                    <Input
                      id="custom-time"
                      type="number"
                      min="0"
                      placeholder="Enter time in minutes"
                      value={customTime}
                      onChange={(e) => setCustomTime(e.target.value)}
                    />
                    <p className="text-xs text-muted-foreground">
                      Tracked: {formatDuration(elapsedMs)} ({Math.ceil(elapsedMs / 60_000)} minutes)
                    </p>
                  </div>
                </div>
                <DialogFooter>
                  <Button
                    variant="outline"
                    onClick={() => setIsStopDialogOpen(false)}
                    disabled={isBusy}
                  >
                    Cancel
                  </Button>
                  <Button onClick={handleStop} disabled={isBusy || !stopMessage.trim()}>
                    {isBusy ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : (
                      <Square className="h-4 w-4 mr-2" />
                    )}
                    Finish &amp; Save
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
        </div>

        {scheduledFor && (
          <div className="text-center pt-2 border-t text-sm text-muted-foreground">
            <p>Scheduled: {scheduledFor}</p>
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
  playing: 'Running',
  paused: 'Paused',
  stopped: 'Stopped',
};

const STATUS_HINT: Record<PlayerState, string> = {
  playing: 'Timer running',
  paused: 'Timer paused',
  stopped: 'Timer stopped',
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
