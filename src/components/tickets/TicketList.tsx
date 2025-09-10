import { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useTickets } from '@/contexts/TicketsContext';
import { apiClient } from '@/lib/api';
import { Ticket } from '@/types/api';
import { 
  Search,
  Calendar,
  Building,
  User,
  Clock,
  AlertCircle,
  Play,
  Pause,
  MessageSquare,
  Paperclip,
  RefreshCw,
  Loader2
} from 'lucide-react';

interface TicketListProps {
  onTicketSelect: (ticket: Ticket) => void;
}

export function TicketList({ onTicketSelect }: TicketListProps) {
  const { tickets, isLoading, isRefreshing, refreshTickets, lastUpdated } = useTickets();
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [priorityFilter, setPriorityFilter] = useState('all');
  const [searchedTicket, setSearchedTicket] = useState<Ticket | null>(null);
  const [isSearchingTicket, setIsSearchingTicket] = useState(false);

  // Tickets are now managed by the TicketsContext

  const searchTicketById = async (ticketId: number) => {
    setIsSearchingTicket(true);
    try {
      const response = await apiClient.getTicketById(ticketId);
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
        
        setSearchedTicket(transformedTicket);
      } else {
        setSearchedTicket(null);
      }
    } catch (error) {
      console.error('Failed to search ticket by ID:', error);
      setSearchedTicket(null);
    } finally {
      setIsSearchingTicket(false);
    }
  };

  const filterTickets = (ticketList: Ticket[]) => {
    return ticketList.filter(ticket => {
      const effectiveDescription = getTicketDescription(ticket);
      const matchesSearch = !searchTerm || 
        ticket.summary.toLowerCase().includes(searchTerm.toLowerCase()) ||
        effectiveDescription.toLowerCase().includes(searchTerm.toLowerCase()) ||
        ticket.company.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        ticket.id.toString().includes(searchTerm);
        
      const matchesStatus = statusFilter === 'all' || ticket.status.toLowerCase() === statusFilter;
      const matchesPriority = priorityFilter === 'all' || ticket.priority.toLowerCase() === priorityFilter;
      
      return matchesSearch && matchesStatus && matchesPriority;
    });
  };

  // Enhanced filter function that includes searched ticket
  const getFilteredTickets = (ticketList: Ticket[]) => {
    const filtered = filterTickets(ticketList);
    
    // If we have a searched ticket and it matches the filters, include it
    if (searchedTicket) {
      const searchedMatches = 
        (statusFilter === 'all' || searchedTicket.status.toLowerCase() === statusFilter) &&
        (priorityFilter === 'all' || searchedTicket.priority.toLowerCase() === priorityFilter);
      
      if (searchedMatches) {
        // Check if the searched ticket is already in the list
        const existsInList = filtered.some(ticket => ticket.id === searchedTicket.id);
        if (!existsInList) {
          return [searchedTicket, ...filtered];
        }
      }
    }
    
    return filtered;
  };

  // Get effective description from ticket (description or template_data)
  const getTicketDescription = (ticket: Ticket) => {
    if (ticket.description && ticket.description.trim()) {
      return ticket.description;
    }
    
    // If description is empty, try to extract meaningful content from template_data
    if (ticket.template_data && ticket.template_data.trim()) {
      try {
        const templateData = JSON.parse(ticket.template_data);
        if (typeof templateData === 'object' && templateData !== null) {
          // Extract values from template data and join them
          const values = Object.values(templateData)
            .filter(value => value && typeof value === 'string' && value.trim())
            .join(', ');
          return values || 'Custom template data';
        }
      } catch {
        // If parsing fails, return the raw template data
        return ticket.template_data;
      }
    }
    
    return 'No description available';
  };

  // Handle search term changes and check for ticket ID search
  useEffect(() => {
    if (searchTerm) {
      // Check if search term is a number (potential ticket ID)
      const ticketId = parseInt(searchTerm);
      if (!isNaN(ticketId) && searchTerm.trim() === ticketId.toString()) {
        // Check if this ticket ID exists in current datasets
        const allCurrentTickets = [...tickets.new_tickets, ...tickets.my_tickets, ...tickets.all_tickets];
        const existsInCurrent = allCurrentTickets.some(ticket => ticket.id === ticketId);
        
        if (!existsInCurrent) {
          // Search for the ticket by ID
          searchTicketById(ticketId);
        } else {
          // Clear searched ticket if it exists in current data
          setSearchedTicket(null);
        }
      } else {
        // Clear searched ticket for non-ID searches
        setSearchedTicket(null);
      }
    } else {
      // Clear searched ticket when search is empty
      setSearchedTicket(null);
    }
  }, [searchTerm, tickets]);

  const getPriorityColor = (priority: string, index: number) => {
    if (priority === 'VERY_HIGH' || index > 7) return 'destructive';
    if (priority === 'HIGH' || index > 4) return 'default';
    if (priority === 'NORMAL') return 'secondary';
    return 'secondary';
  };

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'neu': return 'default';
      case 'ausstehend': return 'secondary';
      case 'warten auf rückmeldung vom ticketbenutzer': return 'destructive';
      case 'warten auf rückmeldung (extern)': return 'destructive';
      case 'terminiert': return 'secondary';
      case 'abgeschlossen': return 'outline';
      default: return 'secondary';
    }
  };

  const formatDate = (dateString: string) => {
    if (!dateString) return 'No date';
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('en-US', { 
        month: 'short', 
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return dateString;
    }
  };

  const TicketItem = ({ ticket }: { ticket: Ticket }) => (
    <Card className="cursor-pointer hover:bg-accent/50 transition-colors" onClick={() => onTicketSelect(ticket)}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2">
            <Badge variant={getPriorityColor(ticket.priority, ticket.index)}>
              #{ticket.id}
            </Badge>
            <Badge variant={getStatusColor(ticket.status)}>
              {ticket.status}
            </Badge>
            {ticket.priority && (
              <Badge variant="outline">
                {ticket.priority}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-1">
            {ticket.playStatus && (
              <div className="flex items-center gap-1">
                {ticket.playStatus === 'playing' ? (
                  <Play className="h-3 w-3 text-green-500" />
                ) : (
                  <Pause className="h-3 w-3 text-yellow-500" />
                )}
              </div>
            )}
            {ticket.attachments?.length > 0 && (
              <Paperclip className="h-3 w-3 text-muted-foreground" />
            )}
            {ticket.ticketMessagesCount > 0 && (
              <div className="flex items-center gap-1">
                <MessageSquare className="h-3 w-3 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">{ticket.ticketMessagesCount}</span>
              </div>
            )}
          </div>
        </div>
        
        <h3 className="font-semibold mb-2 line-clamp-2">{ticket.summary}</h3>
        <p className="text-sm text-muted-foreground mb-3 line-clamp-2">{getTicketDescription(ticket)}</p>
        
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
          <div className="flex items-center gap-1 text-muted-foreground">
            <Building className="h-3 w-3" />
            <span className="truncate">{ticket.company.name}</span>
          </div>
          <div className="flex items-center gap-1 text-muted-foreground">
            <User className="h-3 w-3" />
            <span className="truncate">{ticket.ticketUser || ticket.ticketCreator}</span>
          </div>
          <div className="flex items-center gap-1 text-muted-foreground">
            <Calendar className="h-3 w-3" />
            <span>{formatDate(ticket.created_at)}</span>
          </div>
          {ticket.ticket_start && (
            <div className="flex items-center gap-1 text-muted-foreground">
              <Clock className="h-3 w-3" />
              <span>{formatDate(ticket.ticket_start)}</span>
            </div>
          )}
        </div>
        
        {ticket.subject && (
          <div className="mt-2 pt-2 border-t">
            <span className="text-xs font-medium text-muted-foreground">Subject: </span>
            <span className="text-xs">{ticket.subject}</span>
          </div>
        )}
      </CardContent>
    </Card>
  );

  if (isLoading) {
    return (
      <div>
        <div className="space-y-4">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i} className="animate-pulse">
              <CardContent className="p-4">
                <div className="h-4 bg-muted rounded w-1/4 mb-2" />
                <div className="h-6 bg-muted rounded w-3/4 mb-2" />
                <div className="h-4 bg-muted rounded w-1/2" />
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
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold">Tickets</h1>
          <div className="flex items-center gap-2">
            {lastUpdated && (
              <span className="text-sm text-muted-foreground">
                Last updated: {lastUpdated.toLocaleTimeString()}
              </span>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={refreshTickets}
              disabled={isRefreshing}
            >
              {isRefreshing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>
        
        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search tickets..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full sm:w-[180px]">
              <SelectValue placeholder="Filter by status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="neu">Neu</SelectItem>
              <SelectItem value="ausstehend">Ausstehend</SelectItem>
              <SelectItem value="warten auf rückmeldung vom ticketbenutzer">Warten auf Rückmeldung vom Ticketbenutzer</SelectItem>
              <SelectItem value="warten auf rückmeldung (extern)">Warten auf Rückmeldung (Extern)</SelectItem>
              <SelectItem value="terminiert">Terminiert</SelectItem>
              <SelectItem value="abgeschlossen">Abgeschlossen</SelectItem>
            </SelectContent>
          </Select>
          <Select value={priorityFilter} onValueChange={setPriorityFilter}>
            <SelectTrigger className="w-full sm:w-[180px]">
              <SelectValue placeholder="Filter by priority" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Priorities</SelectItem>
              <SelectItem value="very_high">Very High</SelectItem>
              <SelectItem value="high">High</SelectItem>
              <SelectItem value="normal">Normal</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Ticket Tabs */}
      <Tabs defaultValue="my" className="space-y-4">
        <TabsList>
          <TabsTrigger value="my" className="flex items-center gap-2">
            <User className="h-4 w-4" />
            My Tickets
            {tickets.my_tickets.length > 0 && (
              <Badge variant="secondary" className="ml-1">
                {getFilteredTickets(tickets.my_tickets).length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="new" className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4" />
            New Tickets
            {tickets.new_tickets.length > 0 && (
              <Badge variant="secondary" className="ml-1">
                {getFilteredTickets(tickets.new_tickets).length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="all" className="flex items-center gap-2">
            All Tickets
            {tickets.all_tickets.length > 0 && (
              <Badge variant="secondary" className="ml-1">
                {getFilteredTickets(tickets.all_tickets).length}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="my" className="space-y-4">
          {isSearchingTicket && (
            <div className="flex items-center justify-center py-4">
              <div className="text-sm text-muted-foreground">Searching for ticket...</div>
            </div>
          )}
          {getFilteredTickets(tickets.my_tickets).map((ticket) => (
            <TicketItem key={ticket.id} ticket={ticket} />
          ))}
          {getFilteredTickets(tickets.my_tickets).length === 0 && !isSearchingTicket && (
            <Card>
              <CardContent className="p-8 text-center">
                <User className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground">No tickets assigned to you</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="new" className="space-y-4">
          {isSearchingTicket && (
            <div className="flex items-center justify-center py-4">
              <div className="text-sm text-muted-foreground">Searching for ticket...</div>
            </div>
          )}
          {getFilteredTickets(tickets.new_tickets).map((ticket) => (
            <TicketItem key={ticket.id} ticket={ticket} />
          ))}
          {getFilteredTickets(tickets.new_tickets).length === 0 && !isSearchingTicket && (
            <Card>
              <CardContent className="p-8 text-center">
                <AlertCircle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground">No new tickets</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="all" className="space-y-4">
          {isSearchingTicket && (
            <div className="flex items-center justify-center py-4">
              <div className="text-sm text-muted-foreground">Searching for ticket...</div>
            </div>
          )}
          {getFilteredTickets(tickets.all_tickets).map((ticket) => (
            <TicketItem key={ticket.id} ticket={ticket} />
          ))}
          {getFilteredTickets(tickets.all_tickets).length === 0 && !isSearchingTicket && (
            <Card>
              <CardContent className="p-8 text-center">
                <div className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground">No tickets available</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}