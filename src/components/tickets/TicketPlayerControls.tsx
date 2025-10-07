import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth } from '@/contexts/AuthContext';
import { apiClient } from '@/lib/api';
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

export function TicketPlayerControls({ ticket, onStatusChange }: TicketPlayerControlsProps) {
  const { user } = useAuth();
  const [playerStatus, setPlayerStatus] = useState<string>('stopped');
  const [isLoading, setIsLoading] = useState(false);
  const [startTime, setStartTime] = useState<Date | null>(null);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [isStopDialogOpen, setIsStopDialogOpen] = useState(false);
  const [stopMessage, setStopMessage] = useState('');
  const [stopStatus, setStopStatus] = useState('4'); // Default to "Abgeschlossen"
  const [customTime, setCustomTime] = useState<string>(''); // Custom time in minutes

  useEffect(() => {
    fetchPlayerStatus();
    let timerInterval: NodeJS.Timeout;
    let statusInterval: NodeJS.Timeout;

    // Update elapsed time every second when playing (only when we have a startTime)
    if (playerStatus === 'playing' && startTime) {
      timerInterval = setInterval(() => {
        setElapsedTime(Date.now() - startTime.getTime());
      }, 1000);
    }
    // When paused, don't update elapsed time - it should stay at the current value

    // Poll player status every 30 seconds to detect external changes
    statusInterval = setInterval(() => {
      fetchPlayerStatus();
    }, 30000);

    return () => {
      if (timerInterval) {
        clearInterval(timerInterval);
      }
      if (statusInterval) {
        clearInterval(statusInterval);
      }
    };
  }, [playerStatus, startTime, ticket.id, user?.id]);

  const fetchPlayerStatus = async () => {
    if (!user) return;

    try {
      const response = await apiClient.getPlayerStatus(ticket.id, user.id);
      if (response.status === 'success') {
        // Fix: The API returns playerStatus directly, not nested under data
        const playerStatusData = response.playerStatus;
        if (playerStatusData) {
          const newStatus = getPlayerStatusString(playerStatusData.play_status);
          setPlayerStatus(newStatus);
          
          // Set elapsed time from API response (total_time is in minutes, convert to milliseconds)
          const totalTimeMs = (playerStatusData.total_time || 0) * 60 * 1000;
          setElapsedTime(totalTimeMs);
          
          // If the timer is running, set start time based on elapsed time
          if (newStatus === 'playing') {
            setStartTime(new Date(Date.now() - totalTimeMs));
          } else if (newStatus === 'paused') {
            // For paused state, we keep the elapsed time but no active start time
            setStartTime(null);
          } else if (newStatus === 'stopped') {
            setStartTime(null);
          }
        } else {
          setPlayerStatus('stopped');
          setElapsedTime(0);
          setStartTime(null);
        }
      }
    } catch (error: any) {
      console.error('Failed to fetch player status:', error);
      
      // Handle rate limiting gracefully
      if (error.message?.includes('429') || error.message?.includes('Too Many Requests')) {
        console.warn('Rate limited - will retry on next interval');
        return; // Don't reset status on rate limit, keep current state
      }
      
      // Only reset status on actual errors, not rate limiting
      setPlayerStatus('stopped');
      setElapsedTime(0);
      setStartTime(null);
    }
  };

  // Helper function to convert numeric status to string
  const getPlayerStatusString = (status: number): string => {
    // API status constants from PHP
    const PLAY = 1;
    const PAUSE = 2;
    const RESUME = 3;
    const STOP = 4;
    
    switch (status) {
      case PLAY:
      case RESUME:
        return 'playing';  // Both PLAY and RESUME mean timer is actively running
      case PAUSE:
        return 'paused';   // Timer is paused, can be resumed
      case STOP:
        return 'stopped';  // Timer is stopped/completed
      default:
        return 'stopped';
    }
  };

  const handlePlay = async () => {
    if (!user) return;
    
    setIsLoading(true);
    try {
      // First check current status to prevent conflicts
      await fetchPlayerStatus();
      
      const response = await apiClient.play(ticket.id, user.id);
      if (response.status === 'success') {
        setPlayerStatus('playing');
        setStartTime(new Date());
        setElapsedTime(0);
        onStatusChange?.();
      } else if (response.status === 'exists') {
        // Ticket is already being worked on by someone else
        alert('This ticket is already being worked on by another user.');
        await fetchPlayerStatus(); // Refresh to get current status
      } else {
        console.error('Failed to start ticket:', response.message);
        alert('Unable to start ticket. Please try again.');
      }
    } catch (error) {
      console.error('Failed to start ticket:', error);
      alert('Error starting ticket. Please check your connection and try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handlePause = async () => {
    if (!user) return;
    
    setIsLoading(true);
    try {
      // Pass current state (1 = PLAY) to pause API
      const response = await apiClient.pause(ticket.id, user.id, 1);
      if (response.status === 'success') {
        setPlayerStatus('paused');
        // Stop the timer but keep elapsed time
        setStartTime(null);
        onStatusChange?.();
      }
    } catch (error) {
      console.error('Failed to pause ticket:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleResume = async () => {
    if (!user) return;
    
    setIsLoading(true);
    try {
      // Pass current state (2 = PAUSE) to resume API
      const response = await apiClient.resume(ticket.id, user.id, 2);
      if (response.status === 'success') {
        setPlayerStatus('playing');
        // Use the current elapsed time to set the start time correctly
        setStartTime(new Date(Date.now() - elapsedTime));
        onStatusChange?.();
        // Refresh status immediately to get updated state from server
        setTimeout(() => fetchPlayerStatus(), 1000);
      }
    } catch (error) {
      console.error('Failed to resume ticket:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleStop = async () => {
    if (!user || !stopMessage.trim()) return;

    setIsLoading(true);
    try {
      // Parse custom time (in minutes)
      const newTimeInMinutes = parseInt(customTime) || 0;
      const oldTimeInMinutes = Math.ceil(elapsedTime / 60000);

      // First, set the correction time using correctWatch API
      if (newTimeInMinutes > 0 && newTimeInMinutes !== oldTimeInMinutes) {
        await apiClient.correctWatch({
          ticket_id: ticket.id,
          user_id: user.id,
          old_time: oldTimeInMinutes,
          new_time: newTimeInMinutes,
        });
      }

      // Then save the ticket history (which will use the corrected time)
      const response = await apiClient.saveTicketHistory({
        ticket_id: ticket.id,
        user_id: user.id,
        verlauf_text: stopMessage,
        status_id: parseInt(stopStatus),
        sendMail: 0,
      });

      if (response.status === 'success') {
        setPlayerStatus('stopped');
        setStartTime(null);
        setElapsedTime(0);
        setIsStopDialogOpen(false);
        setStopMessage('');
        setCustomTime('');
        onStatusChange?.();
      }
    } catch (error) {
      console.error('Failed to stop ticket and save work:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleStopClick = () => {
    // Initialize custom time with current elapsed time in minutes
    const elapsedMinutes = Math.ceil(elapsedTime / 60000);
    setCustomTime(elapsedMinutes.toString());
    setIsStopDialogOpen(true);
  };

  const formatTime = (milliseconds: number) => {
    const seconds = Math.floor(milliseconds / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    
    return `${hours.toString().padStart(2, '0')}:${(minutes % 60).toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`;
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'playing': return 'default';
      case 'paused': return 'secondary';
      default: return 'outline';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'playing': return <Play className="h-3 w-3 text-green-500 fill-green-500" />;
      case 'paused': return <Pause className="h-3 w-3 text-yellow-500" />;
      default: return <Square className="h-3 w-3 text-muted-foreground" />;
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Ticket Timer
          </div>
          <Badge variant={getStatusColor(playerStatus)}>
            <div className="flex items-center gap-1">
              {getStatusIcon(playerStatus)}
              {playerStatus.charAt(0).toUpperCase() + playerStatus.slice(1)}
            </div>
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Time Display */}
        <div className="text-center">
          <div className="text-3xl font-mono font-bold">
            {formatTime(elapsedTime)}
          </div>
          <p className="text-sm text-muted-foreground">
            {playerStatus === 'playing' ? 'Timer running' : 
             playerStatus === 'paused' ? 'Timer paused' : 'Timer stopped'}
          </p>
        </div>

        {/* Control Buttons */}
        <div className="flex justify-center gap-2">
          {playerStatus === 'stopped' && (
            <Button
              onClick={handlePlay}
              disabled={isLoading}
              className="flex items-center gap-2"
            >
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Play className="h-4 w-4" />
              )}
              Start
            </Button>
          )}
          
          {playerStatus === 'playing' && (
            <Button
              onClick={handlePause}
              disabled={isLoading}
              variant="secondary"
              className="flex items-center gap-2"
            >
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Pause className="h-4 w-4" />
              )}
              Pause
            </Button>
          )}
          
          {playerStatus === 'paused' && (
            <Button
              onClick={handleResume}
              disabled={isLoading}
              className="flex items-center gap-2"
            >
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RotateCcw className="h-4 w-4" />
              )}
              Resume
            </Button>
          )}
          
          {(playerStatus === 'playing' || playerStatus === 'paused') && (
            <Dialog open={isStopDialogOpen} onOpenChange={setIsStopDialogOpen}>
              <DialogTrigger asChild>
                <Button
                  onClick={handleStopClick}
                  disabled={isLoading}
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
                    <label htmlFor="work-description" className="text-sm font-medium">
                      Work Description
                    </label>
                    <Textarea
                      id="work-description"
                      placeholder="Describe what you accomplished..."
                      value={stopMessage}
                      onChange={(e) => setStopMessage(e.target.value)}
                      rows={4}
                    />
                  </div>
                  <div className="space-y-2">
                    <label htmlFor="ticket-status" className="text-sm font-medium">
                      Update Ticket Status
                    </label>
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
                    <label htmlFor="custom-time" className="text-sm font-medium">
                      Time to Submit (minutes)
                    </label>
                    <Input
                      id="custom-time"
                      type="number"
                      min="0"
                      placeholder="Enter time in minutes"
                      value={customTime}
                      onChange={(e) => setCustomTime(e.target.value)}
                    />
                    <p className="text-xs text-muted-foreground">
                      Tracked time: {formatTime(elapsedTime)} ({Math.ceil(elapsedTime / 60000)} minutes)
                    </p>
                  </div>
                </div>
                <DialogFooter>
                  <Button
                    variant="outline"
                    onClick={() => setIsStopDialogOpen(false)}
                    disabled={isLoading}
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={handleStop}
                    disabled={isLoading || !stopMessage.trim()}
                  >
                    {isLoading ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : (
                      <Square className="h-4 w-4 mr-2" />
                    )}
                    Finish & Save
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
        </div>

        {/* Additional Info */}
        {ticket.ticket_start && (
          <div className="text-center pt-2 border-t text-sm text-muted-foreground">
            <p>Scheduled: {new Date(ticket.ticket_start).toLocaleString()}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}