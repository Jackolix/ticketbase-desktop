import { useState, useEffect } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { useAuth } from '@/contexts/AuthContext';
import { getTicket } from '@/lib/sync';
import { Ticket } from '@/types/api';
import { TicketDetailWindow } from './TicketDetailWindow';

interface TicketWindowProps {
  ticketId: string;
}

export function TicketWindow({ ticketId }: TicketWindowProps) {
  const { isAuthenticated, isLoading } = useAuth();
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [isLoadingTicket, setIsLoadingTicket] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadTicket = async () => {
    if (!ticketId) return;
    
    setIsLoadingTicket(true);
    setError(null);
    
    try {
      const loaded = await getTicket(parseInt(ticketId, 10));
      if (loaded) {
        setTicket(loaded);
      } else {
        setError('Ticket not found');
      }
    } catch (err) {
      console.error('Failed to load ticket:', err);
      setError('Failed to load ticket');
    } finally {
      setIsLoadingTicket(false);
    }
  };

  useEffect(() => {
    if (isAuthenticated && ticketId) {
      loadTicket();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- known stale-dep bug, fixed in Phase 04. Do not "fix" by adding the deps: these callbacks are recreated every render, so that loops.
  }, [isAuthenticated, ticketId]);

  if (isLoading || isLoadingTicket) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="text-center space-y-4">
          <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center mx-auto animate-pulse">
            <div className="w-4 h-4 bg-primary-foreground rounded" />
          </div>
          <p className="text-muted-foreground">
            {isLoadingTicket ? "Loading ticket..." : "Loading..."}
          </p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="text-center space-y-4">
          <p className="text-muted-foreground">Please authenticate to view this ticket.</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="text-center space-y-4">
          <p className="text-destructive">{error}</p>
        </div>
      </div>
    );
  }

  if (!ticket) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="text-center space-y-4">
          <p className="text-muted-foreground">Ticket not found</p>
        </div>
      </div>
    );
  }

  // Ticket windows close themselves instead of navigating back.
  //
  // This must go through Tauri rather than the DOM's window.close(), which does
  // not route through the window system at all and is a no-op on WKWebView and
  // WebKitGTK.
  const handleBack = () => {
    getCurrentWindow().close().catch((err) => {
      console.error('Failed to close ticket window:', err);
    });
  };

  return (
    <div className="min-h-screen bg-background p-4">
      <TicketDetailWindow ticket={ticket} onBack={handleBack} />
    </div>
  );
}