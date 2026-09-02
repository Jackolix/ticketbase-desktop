import { useCallback, useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
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
import { WikiSearch } from "./components/WikiSearch";
import { TodayView } from "./components/today/TodayView";
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
import { getTicket } from "./lib/sync";
import { WindowManager } from "./lib/windowManager";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { SyncIndicator } from "./components/SyncIndicator";
import { Titlebar } from "./components/Titlebar";

function AppContent() {
  const { isAuthenticated, isLoading } = useAuth();
  const { setActiveTab, tickets } = useTickets();
  const [currentView, setCurrentView] = useState("dashboard");
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [isLoadingTicket, setIsLoadingTicket] = useState(false);
  const [showDebugPanel, setShowDebugPanel] = useState(false);

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

  const loadTicketById = useCallback(async (ticketId: number) => {
    setIsLoadingTicket(true);
    try {
      // Served from the local store when the ticket has been synced, which is
      // both instant and complete — the network fallback loses attachments,
      // pool and message count because getTicketById loads fewer relations.
      const ticket = await getTicket(ticketId);
      if (ticket) {
        setSelectedTicket(ticket);
        setCurrentView("tickets");
      } else {
        console.error('Ticket not found:', ticketId);
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
  }, []);

  // Check URL for ticket routing on mount, and clean up old temp files.
  useEffect(() => {
    if (!isAuthenticated) return;

    const ticketMatch = window.location.hash.match(/^#\/ticket\/(\d+)$/);
    if (ticketMatch) {
      void loadTicketById(parseInt(ticketMatch[1], 10));
    } else {
      setCurrentView("dashboard");
      setSelectedTicket(null);
    }

    WindowManager.cleanupOldTempFiles();
  }, [isAuthenticated, loadTicketById]);

  // A clicked notification raises this window and asks it to show a ticket.
  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | undefined;

    void listen<number>('navigate://ticket', (event) => {
      void loadTicketById(event.payload);
    }).then((off) => {
      if (disposed) off();
      else unlisten = off;
    });

    return () => {
      disposed = true;
      if (unlisten) unlisten();
    };
  }, [loadTicketById]);

  const handleViewChange = (view: string) => {
    setCurrentView(view);
    setSelectedTicket(null);
    // Clear URL hash when navigating away from ticket
    if (window.location.hash.startsWith('#/ticket/')) {
      window.location.hash = '';
    }
  };

  const handleTicketSelect = (ticket: Ticket, preserveCurrentTab?: boolean) => {
    // Pick the tab the ticket actually lives in.
    //
    // This used to branch on whether an "advanced search" had loaded a second,
    // wider copy of the ticket data. The store makes every synced ticket
    // available to the normal lists, so there is only one source to check.
    if (!preserveCurrentTab) {
      if (tickets.my_tickets.some((t) => t.id === ticket.id)) {
        setActiveTab('my');
      } else if (tickets.new_tickets.some((t) => t.id === ticket.id)) {
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

  // Every screen needs the titlebar: with decorations disabled there is no OS
  // frame, so without it the window cannot be moved, minimised or closed.
  if (isLoading || isLoadingTicket) {
    return (
      <div className="flex h-screen flex-col overflow-hidden bg-background">
        <Titlebar title="Ticketbase" />
        <div className="flex flex-1 items-center justify-center">
          <div className="text-center space-y-4">
            <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center mx-auto animate-pulse">
              <div className="w-4 h-4 bg-primary-foreground rounded" />
            </div>
            <p className="text-muted-foreground">
              {isLoadingTicket ? "Loading ticket..." : "Loading..."}
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="flex h-screen flex-col overflow-hidden bg-background">
        <Titlebar title="Ticketbase" />
        <div className="flex-1 overflow-auto">
          <CustomLoginForm />
        </div>
        <UpdateNotification />
      </div>
    );
  }

  const getBreadcrumbTitle = () => {
    if (selectedTicket) return `Ticket #${selectedTicket.id}`;

    switch (currentView) {
      case "dashboard": return "Dashboard";
      case "tickets": return "Tickets";
      case "new-ticket": return "New Ticket";
      case "settings": return "Settings";
      case "today": return "Today's Schedule";
      case "wiki": return "Knowledge Base";
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
        return <TodayView onTicketSelect={handleTicketSelect} />;
      case "wiki":
        return <WikiSearch />;
      case "reports":
        return <Reports />;
      default:
        return <Dashboard onTicketSelect={handleTicketSelect} />;
    }
  };

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <Titlebar title="Ticketbase" />
      <SidebarProvider className="min-h-0 flex-1">
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
          <div className="ml-auto px-4">
            <SyncIndicator />
          </div>
        </header>
        <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
          <ErrorBoundary
            label={selectedTicket ? `ticket #${selectedTicket.id}` : getBreadcrumbTitle().toLowerCase()}
            resetKey={selectedTicket ? `ticket-${selectedTicket.id}` : currentView}
          >
            {renderContent()}
          </ErrorBoundary>
        </div>
      </SidebarInset>
      <UpdateNotification />
      <DebugPanel
        isVisible={showDebugPanel && process.env.NODE_ENV === 'development'}
        onClose={() => setShowDebugPanel(false)}
      />
      <Toaster />
      </SidebarProvider>
    </div>
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
