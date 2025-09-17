import { useState, useEffect } from "react";
import "./App.css";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { ThemeProvider } from "./contexts/ThemeContext";
import { TicketsProvider, useTickets } from "./contexts/TicketsContext";
import { UpdaterProvider } from "./contexts/UpdaterContext";
import { NotificationProvider } from "./contexts/NotificationContext";
import { CustomLoginForm } from "./components/auth/CustomLoginForm";
import { TicketAppSidebar } from "./components/TicketAppSidebar";
import { Dashboard } from "./components/dashboard/Dashboard";
import { TicketList } from "./components/tickets/TicketList";
import { TicketDetail } from "./components/tickets/TicketDetail";
import { NewTicketForm } from "./components/tickets/NewTicketForm";
import { Settings } from "./components/settings/Settings";
import { Reports } from "./components/reports/Reports";
import { TicketWindow } from "./components/tickets/TicketWindow";
import { UpdateNotification } from "./components/ui/UpdateNotification";
import { DebugPanel } from "./components/debug/DebugPanel";
import { Toaster } from "./components/ui/sonner";
import { SidebarProvider, SidebarInset, SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
} from "@/components/ui/breadcrumb";
import { Ticket } from "./types/api";
import { apiClient } from "./lib/api";
import { WindowManager } from "./lib/windowManager";

function AppContent() {
  const { isAuthenticated, isLoading } = useAuth();
  const { setActiveTab, tickets, allTicketsForSearch, filterState } = useTickets();
  const [currentView, setCurrentView] = useState("dashboard");
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [isLoadingTicket, setIsLoadingTicket] = useState(false);
  const [showDebugPanel, setShowDebugPanel] = useState(false);

  // Check URL for ticket routing on mount and cleanup temp files
  useEffect(() => {
    const checkUrlForTicket = () => {
      const hash = window.location.hash;
      const ticketMatch = hash.match(/^#\/ticket\/(\d+)$/);

      if (ticketMatch) {
        const ticketId = parseInt(ticketMatch[1], 10);
        loadTicketById(ticketId);
        return;
      }

      // Default to dashboard if no specific route
      setCurrentView("dashboard");
      setSelectedTicket(null);
    };

    if (isAuthenticated) {
      checkUrlForTicket();

      // Clean up old temp files on app startup
      WindowManager.cleanupOldTempFiles();
    }
  }, [isAuthenticated]);

  // Debug panel keyboard shortcut (Ctrl+Shift+D)
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey && event.shiftKey && event.key === 'D') {
        event.preventDefault();
        setShowDebugPanel(!showDebugPanel);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showDebugPanel]);

  // Cleanup temp files on app shutdown
  useEffect(() => {
    const handleBeforeUnload = () => {
      WindowManager.cleanupAllTempFiles();
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, []);

  const loadTicketById = async (ticketId: number) => {
    setIsLoadingTicket(true);
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
        
        setSelectedTicket(transformedTicket);
        setCurrentView("tickets");
      } else {
        console.error('Failed to load ticket:', response);
        // Fallback to dashboard if ticket not found
        setCurrentView("dashboard");
        setSelectedTicket(null);
      }
    } catch (error) {
      console.error('Failed to load ticket by ID:', error);
      // Fallback to dashboard if error
      setCurrentView("dashboard");
      setSelectedTicket(null);
    } finally {
      setIsLoadingTicket(false);
    }
  };

  const handleViewChange = (view: string) => {
    setCurrentView(view);
    setSelectedTicket(null);
    // Clear URL hash when navigating away from ticket
    if (window.location.hash.startsWith('#/ticket/')) {
      window.location.hash = '';
    }
  };

  const handleTicketSelect = (ticket: Ticket, preserveCurrentTab?: boolean) => {
    // Only determine which tab this ticket belongs to if we're not preserving the current tab
    if (!preserveCurrentTab) {
      // First check if we're using advanced filters and have expanded ticket data
      let isMyTicket = false;
      let isNewTicket = false;

      if (filterState.customerFilter && allTicketsForSearch) {
        // When using advanced filters, check the expanded ticket data
        isMyTicket = allTicketsForSearch.my_tickets.some(t => t.id === ticket.id);
        isNewTicket = allTicketsForSearch.new_tickets.some(t => t.id === ticket.id);
      } else {
        // For normal browsing, check the main ticket lists
        isMyTicket = tickets.my_tickets.some(t => t.id === ticket.id);
        isNewTicket = tickets.new_tickets.some(t => t.id === ticket.id);
      }

      if (isMyTicket) {
        setActiveTab('my');
      } else if (isNewTicket) {
        setActiveTab('new');
      } else {
        setActiveTab('all');
      }
    }

    setSelectedTicket(ticket);
    setCurrentView("tickets");
  };

  const handleTicketBack = () => {
    setSelectedTicket(null);
    setCurrentView("tickets");
    // Clear URL hash when going back
    if (window.location.hash.startsWith('#/ticket/')) {
      window.location.hash = '';
    }
  };

  if (isLoading || isLoadingTicket) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
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
    return <CustomLoginForm />;
  }

  const getBreadcrumbTitle = () => {
    if (selectedTicket) return `Ticket #${selectedTicket.id}`;
    
    switch (currentView) {
      case "dashboard": return "Dashboard";
      case "tickets": return "Tickets";
      case "new-ticket": return "New Ticket";
      case "settings": return "Settings";
      case "today": return "Today's Schedule";
      case "reports": return "Reports";
      default: return "Dashboard";
    }
  };

  const renderContent = () => {
    // If a ticket is selected, always show the ticket detail view
    if (selectedTicket) {
      return <TicketDetail ticket={selectedTicket} onBack={handleTicketBack} />;
    }

    switch (currentView) {
      case "dashboard":
        return <Dashboard onTicketSelect={handleTicketSelect} />;
      case "tickets":
        return <TicketList onTicketSelect={handleTicketSelect} />;
      case "new-ticket":
        return <NewTicketForm />;
      case "settings":
        return <Settings />;
      case "today":
        return <div><h1 className="text-3xl font-bold">Today's Schedule</h1><p className="text-muted-foreground mt-2">Coming soon...</p></div>;
      case "reports":
        return <Reports />;
      default:
        return <Dashboard onTicketSelect={handleTicketSelect} />;
    }
  };

  return (
    <SidebarProvider>
      <TicketAppSidebar currentView={currentView} onViewChange={handleViewChange} />
      <SidebarInset>
        <header className="flex h-16 shrink-0 items-center gap-2 transition-[width,height] ease-linear group-has-[[data-collapsible=icon]]/sidebar-wrapper:h-12">
          <div className="flex items-center gap-2 px-4">
            <SidebarTrigger className="-ml-1" />
            <Separator orientation="vertical" className="mr-2 h-4" />
            <Breadcrumb>
              <BreadcrumbList>
                <BreadcrumbItem>
                  <BreadcrumbPage>{getBreadcrumbTitle()}</BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
          </div>
        </header>
        <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
          {renderContent()}
        </div>
      </SidebarInset>
      <UpdateNotification />
      <DebugPanel
        isVisible={showDebugPanel && process.env.NODE_ENV === 'development'}
        onClose={() => setShowDebugPanel(false)}
      />
      <Toaster />
    </SidebarProvider>
  );
}

function App() {

  // Check if this is a ticket window (has ticketWindow=true query parameter)
  const isTicketWindow = new URLSearchParams(window.location.search).get('ticketWindow') === 'true';
  
  // Get ticket ID from URL hash
  const hash = window.location.hash;
  const ticketMatch = hash.match(/^#\/ticket\/(\d+)$/);
  const ticketId = ticketMatch ? ticketMatch[1] : null;
  
  if (isTicketWindow && ticketId) {
    return (
      <ThemeProvider>
        <UpdaterProvider>
          <AuthProvider>
            <TicketsProvider>
              <NotificationProvider>
                <TicketWindow ticketId={ticketId} />
                <Toaster />
              </NotificationProvider>
            </TicketsProvider>
          </AuthProvider>
        </UpdaterProvider>
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider>
      <UpdaterProvider>
        <AuthProvider>
          <TicketsProvider>
            <NotificationProvider>
              <AppContent />
            </NotificationProvider>
          </TicketsProvider>
        </AuthProvider>
      </UpdaterProvider>
    </ThemeProvider>
  );
}

export default App;
