import { useState, useEffect, useLayoutEffect, useRef, useMemo, useCallback, memo } from 'react';
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
import { usePerformanceMonitor } from '@/utils/performanceMonitor';
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
  onTicketSelect: (ticket: Ticket, preserveCurrentTab?: boolean) => void;
}

export function TicketList({ onTicketSelect }: TicketListProps) {
  const {
    tickets,
    isLoading,
    isRefreshing,
    refreshTickets,
    lastUpdated,
    loadAllTicketsForSearch,
    filterState,
    updateFilterState,
    clearFilters,
    allTicketsForSearch,
    setAllTicketsForSearch,
    customers,
    setCustomers,
    navigationState,
    setActiveTab,
    setScrollPosition
  } = useTickets();
  const { user } = useAuth();
  const perf = usePerformanceMonitor('TicketList');

  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
  const [searchedTicket, setSearchedTicket] = useState<Ticket | null>(null);
  const [isSearchingTicket, setIsSearchingTicket] = useState(false);
  const [isLoadingAdvancedSearch, setIsLoadingAdvancedSearch] = useState(false);
  const [visibleItemCounts, setVisibleItemCounts] = useState({
    my: 50,
    new: 50,
    all: 50
  });
  const customerDropdownRef = useRef<HTMLDivElement>(null);

  // Refs for scroll containers
  const scrollContainerRefs = useRef<{
    my: HTMLDivElement | null;
    new: HTMLDivElement | null;
    all: HTMLDivElement | null;
  }>({
    my: null,
    new: null,
    all: null
  });

  const ITEMS_PER_PAGE = 50;

  // Track scroll position changes
  const handleScroll = useCallback((tab: 'my' | 'new' | 'all') => {
    const container = scrollContainerRefs.current[tab];
    if (container) {
      const position = container.scrollTop;
      setScrollPosition(tab, position);
    }
  }, [setScrollPosition]);

  // Handle tab changes
  const handleTabChange = useCallback((value: string) => {
    setActiveTab(value);
  }, [setActiveTab]);

  // Enhanced ticket select handler to preserve navigation state
  const handleTicketSelect = useCallback((ticket: Ticket) => {
    // Save current scroll position before navigating
    const activeTab = navigationState.activeTab as 'my' | 'new' | 'all';
    const container = scrollContainerRefs.current[activeTab];
    if (container) {
      setScrollPosition(activeTab, container.scrollTop);
    }
    // Preserve the current tab when selecting from within the TicketList
    onTicketSelect(ticket, true);
  }, [navigationState.activeTab, setScrollPosition, onTicketSelect]);

  // Load customers on mount
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
  }, [setCustomers]);

  // Load advanced search data when customer filter is applied
  useEffect(() => {
    if (filterState.customerFilter && !allTicketsForSearch && !isLoadingAdvancedSearch) {
      console.log('Loading advanced search for customer filter:', filterState.customerFilter);
      perf.startTimer('loadAdvancedSearch');
      setIsLoadingAdvancedSearch(true);
      loadAllTicketsForSearch().then((result) => {
        setAllTicketsForSearch(result);
        const dataSize = new Blob([JSON.stringify(result)]).size;
        const ticketCount = result.new_tickets.length + result.my_tickets.length + result.all_tickets.length;
        perf.recordCacheHit('advancedSearch', dataSize);
        perf.recordCacheSize('advancedSearch', dataSize, ticketCount);
      }).catch((error) => {
        console.error('Failed to load all tickets for search:', error);
        perf.recordCacheMiss('advancedSearch');
      }).finally(() => {
        setIsLoadingAdvancedSearch(false);
        perf.endTimer('loadAdvancedSearch');
      });
    }
  }, [filterState.customerFilter, allTicketsForSearch, isLoadingAdvancedSearch, loadAllTicketsForSearch, setAllTicketsForSearch, perf]);

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

  const handleCustomerSelect = useCallback((customer: { id: number; name: string; number?: string }) => {
    updateFilterState({
      customerFilter: customer.id.toString(),
      customerSearchTerm: customer.name,
      showAdvancedFilters: true
    });
    setShowCustomerDropdown(false);
  }, [updateFilterState]);

  const handleCustomerClear = useCallback(() => {
    updateFilterState({
      customerFilter: '',
      customerSearchTerm: ''
    });
    setShowCustomerDropdown(false);
    setAllTicketsForSearch(null);
  }, [updateFilterState, setAllTicketsForSearch]);

  const handleClearFilters = useCallback(() => {
    clearFilters();
    setAllTicketsForSearch(null);
    setSearchedTicket(null);
    // Reset pagination when clearing filters
    setVisibleItemCounts({
      my: ITEMS_PER_PAGE,
      new: ITEMS_PER_PAGE,
      all: ITEMS_PER_PAGE
    });
  }, [clearFilters, setAllTicketsForSearch, ITEMS_PER_PAGE]);

  // Memoized filtered customers to prevent unnecessary re-filtering
  const filteredCustomers = useMemo(() =>
    customers.filter(customer =>
      customer.name.toLowerCase().includes(filterState.customerSearchTerm.toLowerCase()) ||
      customer.number?.toLowerCase().includes(filterState.customerSearchTerm.toLowerCase())
    ),
    [customers, filterState.customerSearchTerm]
  );

  // Get effective description from ticket (description or template_data)
  const getTicketDescription = useCallback((ticket: Ticket) => {
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
  }, []);

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
      const matchesSearch = !filterState.searchTerm ||
        ticket.summary.toLowerCase().includes(filterState.searchTerm.toLowerCase()) ||
        effectiveDescription.toLowerCase().includes(filterState.searchTerm.toLowerCase()) ||
        ticket.company.name.toLowerCase().includes(filterState.searchTerm.toLowerCase()) ||
        ticket.id.toString().includes(filterState.searchTerm);

      // Status filter
      const matchesStatus = filterState.statusFilter === 'all' || ticket.status.toLowerCase() === filterState.statusFilter;

      // Priority filter
      const matchesPriority = filterState.priorityFilter === 'all' || ticket.priority.toLowerCase() === filterState.priorityFilter;

      // Customer filter
      const matchesCustomer = !filterState.customerFilter || (() => {
        const selectedCustomer = customers.find(c => c.id.toString() === filterState.customerFilter);
        if (!selectedCustomer) return true;

        const customerName = selectedCustomer.name.toLowerCase();
        const customerNumber = selectedCustomer.number?.toLowerCase() || '';

        return ticket.company.id.toString() === filterState.customerFilter ||
               ticket.company.name.toLowerCase().includes(customerName) ||
               (customerNumber && ticket.company.number?.toLowerCase().includes(customerNumber)) ||
               ticket.summary.toLowerCase().includes(customerName) ||
               effectiveDescription.toLowerCase().includes(customerName);
      })();

      // Date filter
      const matchesDate = (!filterState.dateFromFilter && !filterState.dateToFilter) || (() => {
        const ticketDate = new Date(ticket.created_at);
        const fromDate = filterState.dateFromFilter ? new Date(filterState.dateFromFilter) : null;
        const toDate = filterState.dateToFilter ? new Date(filterState.dateToFilter) : null;

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
      switch (filterState.sortBy) {
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
  const getFilteredTickets = useCallback((ticketList: Ticket[]) => {
    perf.startTimer('getFilteredTickets');

    // Use all tickets for search when customer filter is active and we have them loaded
    const ticketsToFilter = (filterState.customerFilter && allTicketsForSearch)
      ? [...allTicketsForSearch.new_tickets, ...allTicketsForSearch.my_tickets, ...allTicketsForSearch.all_tickets]
      : ticketList;

    const filtered = filterTickets(ticketsToFilter);

    // If we have a searched ticket and it matches the filters, include it
    let finalTickets = filtered;
    if (searchedTicket) {
      const searchedMatches =
        (filterState.statusFilter === 'all' || searchedTicket.status.toLowerCase() === filterState.statusFilter) &&
        (filterState.priorityFilter === 'all' || searchedTicket.priority.toLowerCase() === filterState.priorityFilter);

      if (searchedMatches) {
        // Check if the searched ticket is already in the list
        const existsInList = filtered.some(ticket => ticket.id === searchedTicket.id);
        if (!existsInList) {
          finalTickets = [searchedTicket, ...filtered];
        }
      }
    }

    const result = sortTickets(finalTickets);
    perf.endTimer('getFilteredTickets');
    return result;
  }, [filterState, allTicketsForSearch, searchedTicket, perf]);

  // Memoized filtered results for each tab to prevent recalculation
  const filteredMyTickets = useMemo(() =>
    getFilteredTickets(tickets.my_tickets),
    [getFilteredTickets, tickets.my_tickets]
  );

  const filteredNewTickets = useMemo(() =>
    getFilteredTickets(tickets.new_tickets),
    [getFilteredTickets, tickets.new_tickets]
  );

  const filteredAllTickets = useMemo(() =>
    getFilteredTickets(tickets.all_tickets),
    [getFilteredTickets, tickets.all_tickets]
  );

  // Paginated results for performance
  const paginatedMyTickets = useMemo(() =>
    filteredMyTickets.slice(0, visibleItemCounts.my),
    [filteredMyTickets, visibleItemCounts.my]
  );

  const paginatedNewTickets = useMemo(() =>
    filteredNewTickets.slice(0, visibleItemCounts.new),
    [filteredNewTickets, visibleItemCounts.new]
  );

  const paginatedAllTickets = useMemo(() =>
    filteredAllTickets.slice(0, visibleItemCounts.all),
    [filteredAllTickets, visibleItemCounts.all]
  );

  // Restore scroll positions immediately after DOM changes (before paint)
  useLayoutEffect(() => {
    const restoreScrollPosition = (tab: 'my' | 'new' | 'all') => {
      const container = scrollContainerRefs.current[tab];
      if (container) {
        const savedPosition = navigationState.scrollPositions[tab];
        container.scrollTop = savedPosition;
      }
    };

    // Restore all scroll positions immediately
    restoreScrollPosition('my');
    restoreScrollPosition('new');
    restoreScrollPosition('all');
  }, [navigationState.scrollPositions, paginatedMyTickets.length, paginatedNewTickets.length, paginatedAllTickets.length]);

  // Reset pagination when filters change
  useEffect(() => {
    setVisibleItemCounts({
      my: ITEMS_PER_PAGE,
      new: ITEMS_PER_PAGE,
      all: ITEMS_PER_PAGE
    });
  }, [filterState.searchTerm, filterState.statusFilter, filterState.priorityFilter, filterState.customerFilter, filterState.sortBy, ITEMS_PER_PAGE]);

  // Load more functions
  const loadMoreTickets = useCallback((tab: 'my' | 'new' | 'all') => {
    setVisibleItemCounts(prev => ({
      ...prev,
      [tab]: prev[tab] + ITEMS_PER_PAGE
    }));
  }, [ITEMS_PER_PAGE]);


  // Handle search term changes and check for ticket ID search (debounced for performance)
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (filterState.searchTerm) {
        // Check if search term is a number (potential ticket ID)
        const ticketId = parseInt(filterState.searchTerm);
        if (!isNaN(ticketId) && filterState.searchTerm.trim() === ticketId.toString()) {
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
    }, 300); // 300ms debounce

    return () => clearTimeout(timeoutId);
  }, [filterState.searchTerm, tickets]);

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
      const matchWithTime = dateString.match(/^(\d{2})-(\d{2})-(\d{4})\s+(\d{2}):(\d{2})$/);
      if (matchWithTime) {
        const [, day, month, year, hour, minute] = matchWithTime;
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

      // Handle DD-MM-YYYY format without time
      const matchWithoutTime = dateString.match(/^(\d{2})-(\d{2})-(\d{4})$/);
      if (matchWithoutTime) {
        const [, day, month, year] = matchWithoutTime;
        const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
        if (!isNaN(date.getTime())) {
          return date.toLocaleDateString(undefined, {
            month: 'short',
            day: 'numeric'
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

  // Memoized TicketItem component to prevent unnecessary re-renders
  const TicketItem = memo(({ ticket, onSelect, onOpenInNewWindow, currentUserName }: {
    ticket: Ticket;
    onSelect: (ticket: Ticket) => void;
    onOpenInNewWindow: (ticket: Ticket, event: React.MouseEvent) => void;
    currentUserName?: string;
  }) => {
    const isCurrentUserTicket = currentUserName && ticket.ticketTerminatedUser &&
      (ticket.ticketTerminatedUser === currentUserName);

    const ticketDescription = useMemo(() => getTicketDescription(ticket), [ticket]);
    const formattedDate = useMemo(() => formatDate(ticket.created_at), [ticket.created_at]);
    const formattedStartDate = useMemo(() =>
      ticket.ticket_start ? formatDate(ticket.ticket_start) : null,
      [ticket.ticket_start]
    );

    return (
      <Card className={`cursor-pointer hover:bg-accent/50 transition-colors ${
        isCurrentUserTicket ? 'border-l-4 border-l-blue-500 bg-blue-500/10 dark:bg-blue-400/10' : ''
      }`} onClick={() => onSelect(ticket)}>
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
                <DropdownMenuItem onClick={(e) => onOpenInNewWindow(ticket, e)}>
                  <ExternalLink className="h-4 w-4" />
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        <h3 className="font-semibold mb-2 line-clamp-2">{ticket.summary}</h3>
        <p className="text-sm text-muted-foreground mb-3 line-clamp-2">{ticketDescription}</p>

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
            <span>{formattedDate}</span>
          </div>
          {formattedStartDate && (
            <div className="flex items-center gap-1 text-muted-foreground">
              <Clock className="h-3 w-3" />
              <span>{formattedStartDate}</span>
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
  });

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
                value={filterState.searchTerm}
                onChange={(e) => updateFilterState({ searchTerm: e.target.value })}
                className="pl-10"
                style={{ paddingLeft: '2.75rem' }}
              />
            </div>
            <Select value={filterState.statusFilter} onValueChange={(value) => updateFilterState({ statusFilter: value })}>
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
            <Select value={filterState.priorityFilter} onValueChange={(value) => updateFilterState({ priorityFilter: value })}>
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
            <Select value={filterState.sortBy} onValueChange={(value) => updateFilterState({ sortBy: value })}>
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
              onClick={() => updateFilterState({ showAdvancedFilters: !filterState.showAdvancedFilters })}
              className="flex items-center gap-2"
            >
              <Filter className="h-4 w-4" />
              Advanced
            </Button>
          </div>

          {/* Advanced Search Loading */}
          {isLoadingAdvancedSearch && (
            <Card className="p-4 bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800">
              <div className="flex items-center gap-3">
                <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
                <div>
                  <div className="font-medium text-blue-900 dark:text-blue-100">Loading comprehensive search results...</div>
                  <div className="text-sm text-blue-700 dark:text-blue-300">This may take up to 20 seconds to complete. Results will be cached for future use.</div>
                </div>
              </div>
            </Card>
          )}

          {/* Advanced Filters */}
          {filterState.showAdvancedFilters && (
            <Card className="p-4 bg-muted/50">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <Label className="font-medium">Advanced Filters</Label>
                  <Button variant="ghost" size="sm" onClick={handleClearFilters}>
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
                        value={filterState.customerSearchTerm}
                        onChange={(e) => {
                          updateFilterState({ customerSearchTerm: e.target.value });
                          setShowCustomerDropdown(true);
                        }}
                        onFocus={() => setShowCustomerDropdown(true)}
                        className="pl-10 pr-8"
                        style={{ paddingLeft: '2.75rem' }}
                      />
                      {filterState.customerFilter && (
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
                      value={filterState.dateFromFilter}
                      onChange={(e) => updateFilterState({ dateFromFilter: e.target.value })}
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
                      value={filterState.dateToFilter}
                      onChange={(e) => updateFilterState({ dateToFilter: e.target.value })}
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
      <Tabs value={navigationState.activeTab} onValueChange={handleTabChange} className="space-y-4">
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
{filteredMyTickets.length}
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
{filteredNewTickets.length}
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
{filteredAllTickets.length}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="my" className="space-y-4">
          <div
            ref={(el) => {
              scrollContainerRefs.current.my = el;
              // Immediately restore scroll position when ref is set
              if (el && navigationState.scrollPositions.my > 0) {
                el.scrollTop = navigationState.scrollPositions.my;
              }
            }}
            onScroll={() => handleScroll('my')}
            className="space-y-4 max-h-[calc(100vh-300px)] overflow-y-auto"
            style={{ scrollBehavior: 'auto' }}
          >
            {isSearchingTicket && (
              <div className="flex items-center justify-center py-4">
                <div className="text-sm text-muted-foreground">Searching for ticket...</div>
              </div>
            )}
            {paginatedMyTickets.map((ticket) => (
              <TicketItem
                key={ticket.id}
                ticket={ticket}
                onSelect={handleTicketSelect}
                onOpenInNewWindow={handleOpenInNewWindow}
                currentUserName={user?.name}
              />
            ))}

            {/* Load More Button */}
            {filteredMyTickets.length > paginatedMyTickets.length && (
              <div className="flex justify-center py-4">
                <Button
                  variant="outline"
                  onClick={() => loadMoreTickets('my')}
                  className="flex items-center gap-2"
                >
                  <RefreshCw className="h-4 w-4" />
                  Load More ({filteredMyTickets.length - paginatedMyTickets.length} remaining)
                </Button>
              </div>
            )}

            {filteredMyTickets.length === 0 && !isSearchingTicket && (
              <Card>
                <CardContent className="p-8 text-center">
                  <User className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <p className="text-muted-foreground">No tickets assigned to you</p>
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>

        <TabsContent value="new" className="space-y-4">
          <div
            ref={(el) => {
              scrollContainerRefs.current.new = el;
              // Immediately restore scroll position when ref is set
              if (el && navigationState.scrollPositions.new > 0) {
                el.scrollTop = navigationState.scrollPositions.new;
              }
            }}
            onScroll={() => handleScroll('new')}
            className="space-y-4 max-h-[calc(100vh-300px)] overflow-y-auto"
            style={{ scrollBehavior: 'auto' }}
          >
            {isSearchingTicket && (
              <div className="flex items-center justify-center py-4">
                <div className="text-sm text-muted-foreground">Searching for ticket...</div>
              </div>
            )}
            {paginatedNewTickets.map((ticket) => (
              <TicketItem
                key={ticket.id}
                ticket={ticket}
                onSelect={handleTicketSelect}
                onOpenInNewWindow={handleOpenInNewWindow}
                currentUserName={user?.name}
              />
            ))}

            {/* Load More Button */}
            {filteredNewTickets.length > paginatedNewTickets.length && (
              <div className="flex justify-center py-4">
                <Button
                  variant="outline"
                  onClick={() => loadMoreTickets('new')}
                  className="flex items-center gap-2"
                >
                  <RefreshCw className="h-4 w-4" />
                  Load More ({filteredNewTickets.length - paginatedNewTickets.length} remaining)
                </Button>
              </div>
            )}

            {filteredNewTickets.length === 0 && !isSearchingTicket && (
              <Card>
                <CardContent className="p-8 text-center">
                  <AlertCircle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <p className="text-muted-foreground">No new tickets</p>
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>

        <TabsContent value="all" className="space-y-4">
          <div
            ref={(el) => {
              scrollContainerRefs.current.all = el;
              // Immediately restore scroll position when ref is set
              if (el && navigationState.scrollPositions.all > 0) {
                el.scrollTop = navigationState.scrollPositions.all;
              }
            }}
            onScroll={() => handleScroll('all')}
            className="space-y-4 max-h-[calc(100vh-300px)] overflow-y-auto"
            style={{ scrollBehavior: 'auto' }}
          >
            {isSearchingTicket && (
              <div className="flex items-center justify-center py-4">
                <div className="text-sm text-muted-foreground">Searching for ticket...</div>
              </div>
            )}
            {paginatedAllTickets.map((ticket) => (
              <TicketItem
                key={ticket.id}
                ticket={ticket}
                onSelect={handleTicketSelect}
                onOpenInNewWindow={handleOpenInNewWindow}
                currentUserName={user?.name}
              />
            ))}

            {/* Load More Button */}
            {filteredAllTickets.length > paginatedAllTickets.length && (
              <div className="flex justify-center py-4">
                <Button
                  variant="outline"
                  onClick={() => loadMoreTickets('all')}
                  className="flex items-center gap-2"
                >
                  <RefreshCw className="h-4 w-4" />
                  Load More ({filteredAllTickets.length - paginatedAllTickets.length} remaining)
                </Button>
              </div>
            )}

            {filteredAllTickets.length === 0 && !isSearchingTicket && (
              <Card>
                <CardContent className="p-8 text-center">
                  <div className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <p className="text-muted-foreground">No tickets available</p>
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}