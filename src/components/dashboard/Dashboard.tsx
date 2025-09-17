import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { apiClient } from '@/lib/api';
import { Ticket } from '@/types/api';
import { 
  Ticket as TicketIcon, 
  AlertCircle, 
  TrendingUp,
  Calendar,
  User,
  Building
} from 'lucide-react';

interface DashboardProps {
  onTicketSelect: (ticket: Ticket, preserveCurrentTab?: boolean) => void;
}

export function Dashboard({ onTicketSelect }: DashboardProps) {
  const { user } = useAuth();
  const [tickets, setTickets] = useState<{
    new_tickets: Ticket[];
    my_tickets: Ticket[];
    all_tickets: Ticket[];
  }>({ new_tickets: [], my_tickets: [], all_tickets: [] });
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchTickets();
  }, [user]);

  const fetchTickets = async () => {
    if (!user) return;
    
    try {
      const response = await apiClient.getTickets(
        user.id,
        user.user_group_id,
        user.company_id,
        user.location_id,
        user.id,
        user.sub_user_group_id
      );
      setTickets(response);
    } catch (error) {
      console.error('Failed to fetch tickets:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const totalTickets = tickets.new_tickets.length + tickets.my_tickets.length + tickets.all_tickets.length;
  const highPriorityTickets = [...tickets.new_tickets, ...tickets.my_tickets, ...tickets.all_tickets]
    .filter(ticket => ticket.priority === 'High' || ticket.index > 7);

  const getPriorityColor = (priority: string, index: number) => {
    if (priority === 'High' || index > 7) return 'destructive';
    if (priority === 'Medium' || index > 4) return 'default';
    return 'secondary';
  };

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'new': return 'default';
      case 'in progress': return 'secondary';
      case 'closed': return 'outline';
      default: return 'secondary';
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i} className="animate-pulse">
              <CardHeader className="pb-2">
                <div className="h-4 bg-muted rounded w-1/2" />
              </CardHeader>
              <CardContent>
                <div className="h-8 bg-muted rounded w-1/3" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="space-y-2">
        <p className="text-muted-foreground">
          Welcome back, {user?.name}. Here's your ticket overview.
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Tickets</CardTitle>
            <TicketIcon className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalTickets}</div>
            <p className="text-xs text-muted-foreground">All assigned tickets</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">My Tickets</CardTitle>
            <User className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{tickets.my_tickets.length}</div>
            <p className="text-xs text-muted-foreground">Assigned to me</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">New Tickets</CardTitle>
            <AlertCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{tickets.new_tickets.length}</div>
            <p className="text-xs text-muted-foreground">Awaiting assignment</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">High Priority</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{highPriorityTickets.length}</div>
            <p className="text-xs text-muted-foreground">Urgent attention needed</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent My Tickets */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="h-5 w-5" />
              My Recent Tickets
            </CardTitle>
            <CardDescription>
              Tickets currently assigned to you
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {tickets.my_tickets.slice(0, 5).map((ticket) => (
              <div key={ticket.id} className="flex items-center justify-between p-3 border rounded-lg">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <Badge variant={getPriorityColor(ticket.priority, ticket.index)}>
                      #{ticket.id}
                    </Badge>
                    <Badge variant={getStatusColor(ticket.status)}>
                      {ticket.status}
                    </Badge>
                  </div>
                  <p className="font-medium truncate">{ticket.summary}</p>
                  <div className="flex items-center gap-4 mt-1 text-sm text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Building className="h-3 w-3" />
                      {ticket.company.name}
                    </span>
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      {ticket.created_at}
                    </span>
                  </div>
                </div>
                <Button size="sm" variant="outline" onClick={() => onTicketSelect(ticket)}>
                  View
                </Button>
              </div>
            ))}
            {tickets.my_tickets.length === 0 && (
              <p className="text-center text-muted-foreground py-8">
                No tickets assigned to you
              </p>
            )}
          </CardContent>
        </Card>

        {/* New Tickets */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5" />
              New Tickets
            </CardTitle>
            <CardDescription>
              Recently created tickets awaiting assignment
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {tickets.new_tickets.slice(0, 5).map((ticket) => (
              <div key={ticket.id} className="flex items-center justify-between p-3 border rounded-lg">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <Badge variant={getPriorityColor(ticket.priority, ticket.index)}>
                      #{ticket.id}
                    </Badge>
                    <Badge variant="default">New</Badge>
                  </div>
                  <p className="font-medium truncate">{ticket.summary}</p>
                  <div className="flex items-center gap-4 mt-1 text-sm text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Building className="h-3 w-3" />
                      {ticket.company.name}
                    </span>
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      {ticket.created_at}
                    </span>
                  </div>
                </div>
                <Button size="sm" onClick={() => onTicketSelect(ticket)}>
                  View
                </Button>
              </div>
            ))}
            {tickets.new_tickets.length === 0 && (
              <p className="text-center text-muted-foreground py-8">
                No new tickets
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}