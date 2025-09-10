import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
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
  const [stopStatus, setStopStatus] = useState('4'); // Default to "Closed"

  useEffect(() => {
    fetchPlayerStatus();
    let interval: NodeJS.Timeout;

    if (playerStatus === 'playing' && startTime) {
      interval = setInterval(() => {
        setElapsedTime(Date.now() - startTime.getTime());
      }, 1000);
    }

    return () => {
      if (interval) {
        clearInterval(interval);
      }
    };
  }, [playerStatus, startTime, ticket.id, user?.id]);

  const fetchPlayerStatus = async () => {
    if (!user) return;

    try {
      const response = await apiClient.getPlayerStatus(ticket.id, user.id);
      if (response.status === 'success') {
        setPlayerStatus(response.data?.play_status || 'stopped');
      }
    } catch (error) {
      console.error('Failed to fetch player status:', error);
    }
  };

  const handlePlay = async () => {
    if (!user) return;
    
    setIsLoading(true);
    try {
      const response = await apiClient.play(ticket.id, user.id);
      if (response.status === 'success') {
        setPlayerStatus('playing');
        setStartTime(new Date());
        setElapsedTime(0);
        onStatusChange?.();
      }
    } catch (error) {
      console.error('Failed to start ticket:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handlePause = async () => {
    if (!user) return;
    
    setIsLoading(true);
    try {
      const response = await apiClient.pause(ticket.id, user.id);
      if (response.status === 'success') {
        setPlayerStatus('paused');
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
      const response = await apiClient.resume(ticket.id, user.id);
      if (response.status === 'success') {
        setPlayerStatus('playing');
        setStartTime(new Date(Date.now() - elapsedTime));
        onStatusChange?.();
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
      // Use saveVerlaufApi which stops timer AND saves history
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
        onStatusChange?.();
      }
    } catch (error) {
      console.error('Failed to stop ticket and save work:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleStopClick = () => {
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
                        <SelectItem value="3">In Progress</SelectItem>
                        <SelectItem value="4">Closed</SelectItem>
                        <SelectItem value="2">Scheduled</SelectItem>
                        <SelectItem value="5">Reopened</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="text-sm text-muted-foreground">
                    Time worked: <span className="font-mono">{formatTime(elapsedTime)}</span>
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