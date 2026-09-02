import { useState, useEffect, useMemo, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { onSyncChanged, queryTickets } from '@/lib/sync';
import { compareTicketDates } from '@/lib/ticketDate';
import { TONE_BADGE, priorityTone, statusTone } from '@/lib/ticketStatus';
import { Ticket } from '@/types/api';
import {
  Ticket as TicketIcon,
  AlertCircle,
  TrendingUp,
  Calendar,
  User,
  Building,
  Activity,
  Clock
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
  const [recentActivity, setRecentActivity] = useState<any[]>([]);

  // Reads the local store rather than calling getTickets itself.
  //
  // The dashboard used to run its own fetch with its own three-minute cache, on
  // top of the one TicketsContext already ran — two independent pulls of every
  // open ticket per window. It now shares the single sync the whole app uses,
  // and deliberately queries unfiltered so the stats are not skewed by whatever
  // filters happen to be set on the ticket list.
  const loadFromStore = useCallback(async () => {
    try {
      const [newTickets, myTickets, allTickets] = await Promise.all([
        queryTickets({ bucket: 'new' }),
        queryTickets({ bucket: 'mine' }),
        queryTickets({ bucket: 'all' }),
      ]);

      setTickets({
        new_tickets: newTickets,
        my_tickets: myTickets,
        all_tickets: allTickets,
      });

      const activities = [...myTickets, ...newTickets, ...allTickets]
        .sort((a, b) => compareTicketDates(b.created_at, a.created_at))
        .slice(0, 10)
        .map((ticket) => ({
          id: ticket.id,
          type: 'ticket_created',
          ticket,
          timestamp: ticket.created_at,
          description: `Ticket #${ticket.id} created`,
        }));
      setRecentActivity(activities);
    } catch (error) {
      console.error('Failed to read tickets from the local store:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadFromStore();
  }, [loadFromStore]);

  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | undefined;

    void onSyncChanged(() => {
      void loadFromStore();
    }).then((off) => {
      if (disposed) off();
      else unlisten = off;
    });

    return () => {
      disposed = true;
      if (unlisten) unlisten();
    };
  }, [loadFromStore]);

  const totalTickets = useMemo(
    () => tickets.new_tickets.length + tickets.my_tickets.length + tickets.all_tickets.length,
    [tickets]
  );

  const highPriorityTickets = useMemo(
    () => [...tickets.new_tickets, ...tickets.my_tickets, ...tickets.all_tickets]
      .filter(ticket => ticket.priority === 'High' || ticket.index > 7),
    [tickets]
  );



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
                    <Badge variant="outline" className={TONE_BADGE[priorityTone(ticket.priority, ticket.index)]}>
                      #{ticket.id}
                    </Badge>
                    <Badge variant="outline" className={TONE_BADGE[statusTone(ticket.status)]}>
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
                    <Badge variant="outline" className={TONE_BADGE[priorityTone(ticket.priority, ticket.index)]}>
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

      {/* Activity Feed */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Recent Activity
          </CardTitle>
          <CardDescription>
            Latest updates and ticket activities
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {recentActivity.map((activity) => (
              <div
                key={`${activity.type}-${activity.id}`}
                className="flex items-start gap-4 p-3 border-l-2 border-muted hover:border-primary transition-colors cursor-pointer"
                onClick={() => onTicketSelect(activity.ticket)}
              >
                <div className="mt-0.5">
                  {activity.type === 'ticket_created' && (
                    <TicketIcon className="h-5 w-5 text-blue-500" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <Badge variant="outline">#{activity.ticket.id}</Badge>
                    <Badge variant="outline" className={TONE_BADGE[statusTone(activity.ticket.status)]}>
                      {activity.ticket.status}
                    </Badge>
                  </div>
                  <p className="font-medium truncate">{activity.ticket.summary}</p>
                  <p className="text-sm text-muted-foreground">
                    {activity.ticket.company.name}
                  </p>
                </div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground shrink-0">
                  <Clock className="h-3 w-3" />
                  <span>{new Date(activity.timestamp).toLocaleDateString('de-DE')}</span>
                </div>
              </div>
            ))}
            {recentActivity.length === 0 && (
              <p className="text-center text-muted-foreground py-8">
                No recent activity
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}