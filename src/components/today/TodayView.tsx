import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { apiClient } from '@/lib/api';
import { Ticket } from '@/types/api';
import {
  Calendar,
  Clock,
  Play,
  CheckCircle2,
  AlertCircle,
  TrendingUp,
  Loader2,
  Timer,
  ListTodo,
  Ticket as TicketIcon,
} from 'lucide-react';

interface TodayViewProps {
  onTicketSelect: (ticket: Ticket) => void;
}

export function TodayView({ onTicketSelect }: TodayViewProps) {
  const { user } = useAuth();
  const [todayTickets, setTodayTickets] = useState<Ticket[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [workTimeStats, setWorkTimeStats] = useState({
    totalMinutes: 0,
    activeTickets: 0,
    completedToday: 0,
  });

  useEffect(() => {
    if (user) {
      fetchTodayData();
    }
  }, [user]);

  const fetchTodayData = async () => {
    if (!user) return;

    setIsLoading(true);
    try {
      const today = new Date().toISOString().split('T')[0];
      const response = await apiClient.getTicketsToday(user.id, today);

      if (response.status === 'success' && response.todayTickets) {
        setTodayTickets(response.todayTickets);

        // Calculate stats from tickets
        let activeTickets = 0;
        let completedToday = 0;

        response.todayTickets.forEach((ticket: any) => {
          if (ticket.status_id === 4) {
            completedToday++;
          }
          if (ticket.status_id !== 4 && ticket.my_ticket_id === user.id) {
            activeTickets++;
          }
        });

        setWorkTimeStats({
          totalMinutes: 0, // Work time not provided by backend
          activeTickets,
          completedToday,
        });
      }
    } catch (error) {
      console.error('Failed to fetch today data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const formatDateTime = (dateString: string): string => {
    const date = new Date(dateString);
    return date.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
  };

  const getPriorityColor = (priority: string, index: number) => {
    if (priority === 'High' || index > 7) return 'destructive';
    if (priority === 'Medium' || index > 4) return 'default';
    return 'secondary';
  };

  const getStatusBadge = (statusId: number) => {
    const statusMap: Record<number, { label: string; variant: any }> = {
      1: { label: 'Neu', variant: 'default' },
      2: { label: 'Terminiert', variant: 'secondary' },
      3: { label: 'Prüfen', variant: 'outline' },
      4: { label: 'Abgeschlossen', variant: 'success' },
      5: { label: 'Offen', variant: 'default' },
      6: { label: 'Vor Ort', variant: 'default' },
      8: { label: 'Wieder geöffnet', variant: 'destructive' },
      9: { label: 'Warten auf Rückmeldung', variant: 'outline' },
      11: { label: 'Warten (Extern)', variant: 'outline' },
      13: { label: 'In Bearbeitung', variant: 'default' },
    };
    return statusMap[statusId] || { label: 'Unbekannt', variant: 'outline' };
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-3">
          <Calendar className="h-8 w-8" />
          Heute - {new Date().toLocaleDateString('de-DE', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric'
          })}
        </h1>
        <p className="text-muted-foreground mt-1">
          Ihre heutigen Tickets und Arbeitszeit
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Terminierte Tickets
            </CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {todayTickets.length}
            </div>
            <p className="text-xs text-muted-foreground">
              Für heute geplant
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Aktive Tickets
            </CardTitle>
            <Play className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{workTimeStats.activeTickets}</div>
            <p className="text-xs text-muted-foreground">
              In Bearbeitung
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Heute abgeschlossen
            </CardTitle>
            <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{workTimeStats.completedToday}</div>
            <p className="text-xs text-muted-foreground">
              Tickets erledigt
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            Quick Actions
          </CardTitle>
          <CardDescription>
            Schnelle Aktionen für heute
          </CardDescription>
        </CardHeader>
        <CardContent className="flex gap-2 flex-wrap">
          <Button variant="default" onClick={() => window.location.hash = '#new-ticket'}>
            <TicketIcon className="h-4 w-4 mr-2" />
            Neues Ticket
          </Button>
          <Button variant="outline" onClick={fetchTodayData}>
            <Clock className="h-4 w-4 mr-2" />
            Aktualisieren
          </Button>
        </CardContent>
      </Card>

      {/* Today's Timeline */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Timer className="h-5 w-5" />
            Heutige Tickets
          </CardTitle>
          <CardDescription>
            {todayTickets.length} Ticket{todayTickets.length !== 1 ? 's' : ''} für heute
          </CardDescription>
        </CardHeader>
        <CardContent>
          {todayTickets.length === 0 ? (
            <div className="text-center py-12">
              <ListTodo className="h-16 w-16 mx-auto mb-4 text-muted-foreground/20" />
              <h3 className="text-lg font-medium mb-2">Keine Tickets für heute</h3>
              <p className="text-muted-foreground">
                Sie haben heute keine terminierten Tickets
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {todayTickets.map((ticket: any) => {
                const status = getStatusBadge(ticket.status_id);
                return (
                  <Card
                    key={ticket.id}
                    className="hover:shadow-md transition-shadow cursor-pointer"
                    onClick={() => onTicketSelect(ticket)}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between">
                        <div className="flex-1 space-y-2">
                          <div className="flex items-center gap-2 flex-wrap">
                            <Badge variant="outline">#{ticket.id}</Badge>
                            <Badge variant={status.variant as any}>
                              {status.label}
                            </Badge>
                            {ticket.priority && (
                              <Badge
                                variant={getPriorityColor(ticket.priority, ticket.index) as any}
                              >
                                {ticket.priority}
                              </Badge>
                            )}
                          </div>
                          <h3 className="font-medium line-clamp-1">
                            {ticket.subject || ticket.description || 'Kein Betreff'}
                          </h3>
                          <div className="flex items-center gap-4 text-sm text-muted-foreground">
                            {ticket.company?.name && (
                              <span className="flex items-center gap-1">
                                <TicketIcon className="h-3 w-3" />
                                {ticket.company.name}
                              </span>
                            )}
                            {ticket.ticket_start && (
                              <span className="flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                {formatDateTime(ticket.ticket_start)}
                              </span>
                            )}
                          </div>
                        </div>
                        {ticket.status_id === 4 ? (
                          <CheckCircle2 className="h-5 w-5 text-green-500 shrink-0" />
                        ) : (
                          <AlertCircle className="h-5 w-5 text-orange-500 shrink-0" />
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
