import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { apiClient } from '@/lib/api';
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
      const response = await apiClient.getTicketById(parseInt(ticketId, 10));
      if (response.result === 'success' && response.tickets) {
        const rawTicket = response.tickets;
        
        const transformedTicket: Ticket = {
          id: rawTicket.id,
          description: rawTicket.description || '',
          status: rawTicket.status?.name || '',
          status_id: rawTicket.status_id || 0,
          summary: rawTicket.summary || '',
          ticketCreator: rawTicket.userone?.name || '',
          ticketUser: rawTicket.ticketuser?.name || '',
          ticketUserPhone: rawTicket.ticketuser?.phone || '',
          ticketTerminatedUser: '',
          attachments: [],
          subject: rawTicket.servicedetail?.name || '',
          priority: rawTicket.priority || '',
          index: rawTicket.priority_index || 0,
          my_ticket_id: rawTicket.my_ticket_id || 0,
          location_id: rawTicket.location_id || 0,
          company: {
            id: rawTicket.companyone?.id || 0,
            name: rawTicket.companyone?.name || '',
            number: rawTicket.companyone?.number || '',
            companyMail: rawTicket.companyone?.email || '',
            companyPhone: rawTicket.companyone?.phone || '',
            companyZip: rawTicket.companyone?.zip || '',
            companyAdress: rawTicket.companyone?.address || '',
          },
          dyn_template_id: rawTicket.dyn_template_id || 0,
          created_at: rawTicket.created_at || '',
          ticket_start: '',
          ticketMessagesCount: 0,
          template_data: rawTicket.template_data || '',
          pool_name: '',
        };
        
        setTicket(transformedTicket);
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

  // Don't show the back button in ticket windows
  const handleBack = () => {
    // In ticket window, we can close the window instead
    window.close();
  };

  return (
    <div className="min-h-screen bg-background p-4">
      <TicketDetailWindow ticket={ticket} onBack={handleBack} />
    </div>
  );
}