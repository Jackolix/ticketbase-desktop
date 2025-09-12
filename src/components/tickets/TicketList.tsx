import { useState, useEffect, useRef } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Label } from '@/components/ui/label';
import { useTickets } from '@/contexts/TicketsContext';
import { useAuth } from '@/contexts/AuthContext';
import { apiClient } from '@/lib/api';
import { WindowManager } from '@/lib/windowManager';
import { Ticket, Company } from '@/types/api';
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
  Loader2,
  ExternalLink,
  MoreVertical,
  Tickets,
  Filter,
  Wrench,
  ArrowUpDown
} from 'lucide-react';

interface TicketListProps {
  onTicketSelect: (ticket: Ticket) => void;
}

export function TicketList({ onTicketSelect }: TicketListProps) {
  const { tickets, isLoading, isRefreshing, refreshTickets, lastUpdated, loadAllTicketsForSearch } = useTickets();
  const { user } = useAuth();
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [priorityFilter, setPriorityFilter] = useState('all');
  const [customerFilter, setCustomerFilter] = useState('');
  const [customerSearchTerm, setCustomerSearchTerm] = useState('');
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
  const [dateFromFilter, setDateFromFilter] = useState('');
  const [dateToFilter, setDateToFilter] = useState('');
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [sortBy, setSortBy] = useState('date-desc');
  const [customers, setCustomers] = useState<Company[]>([]);
  const [searchedTicket, setSearchedTicket] = useState<Ticket | null>(null);
  const [isSearchingTicket, setIsSearchingTicket] = useState(false);
  const [allTicketsForSearch, setAllTicketsForSearch] = useState<{
    new_tickets: Ticket[];
    my_tickets: Ticket[];
    all_tickets: Ticket[];
  } | null>(null);
  const customerDropdownRef = useRef<HTMLDivElement>(null);

  // Save search state to sessionStorage
  const saveSearchState = () => {
    const searchState = {
      searchTerm,
      statusFilter,
      priorityFilter,
      customerFilter,
      dateFromFilter,
      dateToFilter,
      showAdvancedFilters,
      sortBy
    };
    sessionStorage.setItem('ticketSearchState', JSON.stringify(searchState));
  };

  // Restore search state from sessionStorage
  useEffect(() => {
    const savedState = sessionStorage.getItem('ticketSearchState');
    if (savedState) {
      try {
        const state = JSON.parse(savedState);
        setSearchTerm(state.searchTerm || '');
        setStatusFilter(state.statusFilter || 'all');
        setPriorityFilter(state.priorityFilter || 'all');
        setCustomerFilter(state.customerFilter || '');
        setDateFromFilter(state.dateFromFilter || '');
        setDateToFilter(state.dateToFilter || '');
        setShowAdvancedFilters(state.showAdvancedFilters || false);
        setSortBy(state.sortBy || 'date-desc');
      } catch (error) {
        console.error('Failed to restore search state:', error);
      }
    }
  }, []);

  // Save search state whenever filters change
  useEffect(() => {
    saveSearchState();
  }, [searchTerm, statusFilter, priorityFilter, customerFilter, dateFromFilter, dateToFilter, showAdvancedFilters, sortBy]);

  // Load customers for filtering
  useEffect(() => {
    const loadCustomers = async () => {
      try {
        const response = await apiClient.getCustomers();
        if (response.status === 'success' && 'customers' in response) {
          setCustomers(response.customers as Company[]);
        }
      } catch (error) {
        console.error('Failed to load customers:', error);
      }
    };
    loadCustomers();
  }, []);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (customerDropdownRef.current && !customerDropdownRef.current.contains(event.target as Node)) {
        setShowCustomerDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const handleOpenInNewWindow = async (ticket: Ticket, event: React.MouseEvent) => {
    event.stopPropagation();
    try {
      await WindowManager.openTicketInNewWindow(ticket);
    } catch (error) {
      console.error('Failed to open ticket in new window:', error);
    }
  };

  const clearFilters = () => {
    setSearchTerm('');
    setStatusFilter('all');
    setPriorityFilter('all');
    setCustomerFilter('');
    setCustomerSearchTerm('');
    setShowCustomerDropdown(false);
    setDateFromFilter('');
    setDateToFilter('');
    setSortBy('date-desc');
    setAllTicketsForSearch(null); // Clear all tickets cache
  };

  const handleCustomerSelect = async (customer: Company) => {
    setCustomerFilter(customer.id.toString());
    setCustomerSearchTerm(customer.name);
    setShowCustomerDropdown(false);
    
    // Load all tickets for better search results when customer filter is applied
    if (!allTicketsForSearch) {
      try {
        const allTickets = await loadAllTicketsForSearch();
        setAllTicketsForSearch(allTickets);
      } catch (error) {
        console.error('Failed to load all tickets for search:', error);
      }
    }
  };

  const handleCustomerClear = () => {
    setCustomerFilter('');
    setCustomerSearchTerm('');
    setShowCustomerDropdown(false);
    // Clear all tickets cache when no longer needed
    setAllTicketsForSearch(null);
  };

  // Filter customers based on search term
  const filteredCustomers = customers.filter(customer =>
    customer.name.toLowerCase().includes(customerSearchTerm.toLowerCase()) ||
    customer.number?.toLowerCase().includes(customerSearchTerm.toLowerCase())
  );

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
      
      // Search filter
      const matchesSearch = !searchTerm || 
        ticket.summary.toLowerCase().includes(searchTerm.toLowerCase()) ||
        effectiveDescription.toLowerCase().includes(searchTerm.toLowerCase()) ||
        ticket.company.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        ticket.id.toString().includes(searchTerm);
        
      // Status filter
      const matchesStatus = statusFilter === 'all' || ticket.status.toLowerCase() === statusFilter;
      
      // Priority filter
      const matchesPriority = priorityFilter === 'all' || ticket.priority.toLowerCase() === priorityFilter;
      
      // Customer filter - find the selected customer name and search broadly
      const matchesCustomer = !customerFilter || (() => {
        const selectedCustomer = customers.find(c => c.id.toString() === customerFilter);
        if (!selectedCustomer) return true;
        
        const customerName = selectedCustomer.name.toLowerCase();
        const customerNumber = selectedCustomer.number?.toLowerCase() || '';
        
        return ticket.company.id.toString() === customerFilter ||
               ticket.company.name.toLowerCase().includes(customerName) ||
               (customerNumber && ticket.company.number?.toLowerCase().includes(customerNumber)) ||
               ticket.summary.toLowerCase().includes(customerName) ||
               effectiveDescription.toLowerCase().includes(customerName);
      })();
      
      // Date filter
      const matchesDate = (!dateFromFilter && !dateToFilter) || (() => {
        const ticketDate = new Date(ticket.created_at);
        const fromDate = dateFromFilter ? new Date(dateFromFilter) : null;
        const toDate = dateToFilter ? new Date(dateToFilter) : null;
        
        if (fromDate && toDate) {
          return ticketDate >= fromDate && ticketDate <= toDate;
        } else if (fromDate) {
          return ticketDate >= fromDate;
        } else if (toDate) {
          return ticketDate <= toDate;
        }
        return true;
      })();
      
      return matchesSearch && matchesStatus && matchesPriority && matchesCustomer && matchesDate;
    });
  };

  // Sort tickets based on sortBy value
  const sortTickets = (ticketList: Ticket[]) => {
    const sorted = [...ticketList].sort((a, b) => {
      switch (sortBy) {
        case 'date-desc':
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        case 'date-asc':
          return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
        case 'priority-high':
          return b.index - a.index;
        case 'priority-low':
          return a.index - b.index;
        case 'id-desc':
          return b.id - a.id;
        case 'id-asc':
          return a.id - b.id;
        case 'company-asc':
          return a.company.name.localeCompare(b.company.name);
        case 'company-desc':
          return b.company.name.localeCompare(a.company.name);
        case 'status-asc':
          return a.status.localeCompare(b.status);
        case 'status-desc':
          return b.status.localeCompare(a.status);
        default:
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      }
    });
    return sorted;
  };

  // Enhanced filter function that includes searched ticket and uses all tickets when needed
  const getFilteredTickets = (ticketList: Ticket[]) => {
    // Use all tickets for search when customer filter is active and we have them loaded
    const ticketsToFilter = (customerFilter && allTicketsForSearch) 
      ? [...allTicketsForSearch.new_tickets, ...allTicketsForSearch.my_tickets, ...allTicketsForSearch.all_tickets]
      : ticketList;
      
    const filtered = filterTickets(ticketsToFilter);
    
    // If we have a searched ticket and it matches the filters, include it
    let finalTickets = filtered;
    if (searchedTicket) {
      const searchedMatches = 
        (statusFilter === 'all' || searchedTicket.status.toLowerCase() === statusFilter) &&
        (priorityFilter === 'all' || searchedTicket.priority.toLowerCase() === priorityFilter);
      
      if (searchedMatches) {
        // Check if the searched ticket is already in the list
        const existsInList = filtered.some(ticket => ticket.id === searchedTicket.id);
        if (!existsInList) {
          finalTickets = [searchedTicket, ...filtered];
        }
      }
    }
    
    return sortTickets(finalTickets);
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
      // Handle DD-MM-YYYY HH:mm format
      const match = dateString.match(/^(\d{2})-(\d{2})-(\d{4})\s+(\d{2}):(\d{2})$/);
      if (match) {
        const [, day, month, year, hour, minute] = match;
        const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day), parseInt(hour), parseInt(minute));
        if (!isNaN(date.getTime())) {
          return date.toLocaleDateString(undefined, { 
            month: 'short', 
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
          });
        }
      }
      
      // Fallback to standard date parsing
      const date = new Date(dateString);
      if (isNaN(date.getTime())) {
        return 'Invalid Date';
      }
      return date.toLocaleDateString(undefined, { 
        month: 'short', 
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return 'Invalid Date';
    }
  };

  const TicketItem = ({ ticket }: { ticket: Ticket }) => {
    const isCurrentUserTicket = user && ticket.ticketTerminatedUser && 
      (ticket.ticketTerminatedUser === user.name);
    
    return (
      <Card className={`cursor-pointer hover:bg-accent/50 transition-colors ${
        isCurrentUserTicket ? 'border-l-4 border-l-blue-500 bg-blue-500/10 dark:bg-blue-400/10' : ''
      }`} onClick={() => onTicketSelect(ticket)}>
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
            <DropdownMenu>
              <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                  <MoreVertical className="h-3 w-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={(e) => handleOpenInNewWindow(ticket, e)}>
                  <ExternalLink className="h-4 w-4" />
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
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
          {ticket.ticketTerminatedUser && (
            <div className={`flex items-center gap-1 ${
              isCurrentUserTicket ? 'text-blue-600 dark:text-blue-400 font-medium' : 'text-muted-foreground'
            }`}>
              <Wrench className="h-3 w-3" />
              <span className="truncate">
                {isCurrentUserTicket ? `You (${ticket.ticketTerminatedUser})` : ticket.ticketTerminatedUser}
              </span>
            </div>
          )}
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
  };

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
        <div className="flex items-center justify-end">
          {lastUpdated && (
            <span className="text-sm text-muted-foreground mr-2">
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
        
        {/* Filters */}
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none z-10" />
              <Input
                placeholder="Search tickets..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
                style={{ paddingLeft: '2.75rem' }}
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
            <Select value={sortBy} onValueChange={setSortBy}>
              <SelectTrigger className="w-full sm:w-[180px]">
                <ArrowUpDown className="h-4 w-4 mr-2" />
                <SelectValue placeholder="Sort by" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="date-desc">Date (Newest)</SelectItem>
                <SelectItem value="date-asc">Date (Oldest)</SelectItem>
                <SelectItem value="priority-high">Priority (High)</SelectItem>
                <SelectItem value="priority-low">Priority (Low)</SelectItem>
                <SelectItem value="id-desc">ID (Highest)</SelectItem>
                <SelectItem value="id-asc">ID (Lowest)</SelectItem>
                <SelectItem value="company-asc">Company (A-Z)</SelectItem>
                <SelectItem value="company-desc">Company (Z-A)</SelectItem>
                <SelectItem value="status-asc">Status (A-Z)</SelectItem>
                <SelectItem value="status-desc">Status (Z-A)</SelectItem>
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
              className="flex items-center gap-2"
            >
              <Filter className="h-4 w-4" />
              Advanced
            </Button>
          </div>

          {/* Advanced Filters */}
          {showAdvancedFilters && (
            <Card className="p-4 bg-muted/50">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <Label className="font-medium">Advanced Filters</Label>
                  <Button variant="ghost" size="sm" onClick={clearFilters}>
                    Clear All
                  </Button>
                </div>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="customer-filter">Customer</Label>
                    <div className="relative" ref={customerDropdownRef}>
                      <Building className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none z-10" />
                      <Input
                        id="customer-filter"
                        placeholder="Search customers..."
                        value={customerSearchTerm}
                        onChange={(e) => {
                          setCustomerSearchTerm(e.target.value);
                          setShowCustomerDropdown(true);
                        }}
                        onFocus={() => setShowCustomerDropdown(true)}
                        className="pl-10 pr-8"
                        style={{ paddingLeft: '2.75rem' }}
                      />
                      {customerFilter && (
                        <button
                          onClick={handleCustomerClear}
                          className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground hover:text-foreground"
                        >
                          ×
                        </button>
                      )}
                      {showCustomerDropdown && filteredCustomers.length > 0 && (
                        <Card className="absolute top-full left-0 right-0 mt-1 max-h-60 overflow-y-auto z-50 shadow-lg">
                          <CardContent className="p-0">
                            {filteredCustomers.slice(0, 10).map((customer) => (
                              <button
                                key={customer.id}
                                onClick={() => handleCustomerSelect(customer)}
                                className="w-full text-left px-3 py-2 hover:bg-accent hover:text-accent-foreground border-b last:border-b-0 transition-colors"
                              >
                                <div className="font-medium">{customer.name}</div>
                                {customer.number && (
                                  <div className="text-sm text-muted-foreground">#{customer.number}</div>
                                )}
                              </button>
                            ))}
                            {filteredCustomers.length > 10 && (
                              <div className="px-3 py-2 text-sm text-muted-foreground border-t">
                                {filteredCustomers.length - 10} more customers...
                              </div>
                            )}
                          </CardContent>
                        </Card>
                      )}
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="date-from" className="flex items-center gap-2">
                      <Calendar className="h-4 w-4" />
                      Date From
                    </Label>
                    <Input
                      id="date-from"
                      type="date"
                      value={dateFromFilter}
                      onChange={(e) => setDateFromFilter(e.target.value)}
                      className="block w-full"
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="date-to" className="flex items-center gap-2">
                      <Calendar className="h-4 w-4" />
                      Date To
                    </Label>
                    <Input
                      id="date-to"
                      type="date"
                      value={dateToFilter}
                      onChange={(e) => setDateToFilter(e.target.value)}
                      className="block w-full"
                    />
                  </div>
                </div>
              </div>
            </Card>
          )}
        </div>
      </div>

      {/* Ticket Tabs */}
      <Tabs defaultValue="my" className="space-y-4">
        <TabsList className="grid w-full grid-cols-3 h-11">
          <TabsTrigger 
            value="my" 
            className="data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm transition-all duration-200 hover:bg-background/50 font-medium"
          >
            <User className="w-4 h-4 mr-2" />
            My Tickets
            {tickets.my_tickets.length > 0 && (
              <Badge 
                variant="outline" 
                className="ml-2 h-5 px-1.5 text-xs bg-primary/10 text-primary border-primary/20 hover:bg-primary/20 transition-colors duration-200"
              >
                {getFilteredTickets(tickets.my_tickets).length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger 
            value="new" 
            className="data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm transition-all duration-200 hover:bg-background/50 font-medium"
          >
            <AlertCircle className="w-4 h-4 mr-2" />
            New Tickets
            {tickets.new_tickets.length > 0 && (
              <Badge 
                variant="outline" 
                className="ml-2 h-5 px-1.5 text-xs bg-primary/10 text-primary border-primary/20 hover:bg-primary/20 transition-colors duration-200"
              >
                {getFilteredTickets(tickets.new_tickets).length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger 
            value="all" 
            className="data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm transition-all duration-200 hover:bg-background/50 font-medium relative"
          >
            <Tickets className="w-4 h-4 mr-2" />
            All Tickets
            {tickets.all_tickets.length > 0 && (
              <Badge 
                variant="outline" 
                className="ml-2 h-5 px-1.5 text-xs bg-primary/10 text-primary border-primary/20 hover:bg-primary/20 transition-colors duration-200"
              >
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