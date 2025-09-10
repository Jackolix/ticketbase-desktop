import { useState } from "react";
import "./App.css";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { ThemeProvider } from "./contexts/ThemeContext";
import { TicketsProvider } from "./contexts/TicketsContext";
import { CustomLoginForm } from "./components/auth/CustomLoginForm";
import { TicketAppSidebar } from "./components/TicketAppSidebar";
import { Dashboard } from "./components/dashboard/Dashboard";
import { TicketList } from "./components/tickets/TicketList";
import { TicketDetail } from "./components/tickets/TicketDetail";
import { NewTicketForm } from "./components/tickets/NewTicketForm";
import { Settings } from "./components/settings/Settings";
import { SidebarProvider, SidebarInset, SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { 
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
} from "@/components/ui/breadcrumb";
import { Ticket } from "./types/api";

function AppContent() {
  const { isAuthenticated, isLoading } = useAuth();
  const [currentView, setCurrentView] = useState("dashboard");
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);

  const handleViewChange = (view: string) => {
    setCurrentView(view);
    setSelectedTicket(null);
  };

  const handleTicketSelect = (ticket: Ticket) => {
    setSelectedTicket(ticket);
  };

  const handleTicketBack = () => {
    setSelectedTicket(null);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center mx-auto animate-pulse">
            <div className="w-4 h-4 bg-primary-foreground rounded" />
          </div>
          <p className="text-muted-foreground">Loading...</p>
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
    if (selectedTicket) {
      return <TicketDetail ticket={selectedTicket} onBack={handleTicketBack} />;
    }

    switch (currentView) {
      case "dashboard":
        return <Dashboard />;
      case "tickets":
        return <TicketList onTicketSelect={handleTicketSelect} />;
      case "new-ticket":
        return <NewTicketForm />;
      case "settings":
        return <Settings />;
      case "today":
        return <div><h1 className="text-3xl font-bold">Today's Schedule</h1><p className="text-muted-foreground mt-2">Coming soon...</p></div>;
      case "reports":
        return <div><h1 className="text-3xl font-bold">Reports</h1><p className="text-muted-foreground mt-2">Coming soon...</p></div>;
      default:
        return <Dashboard />;
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
    </SidebarProvider>
  );
}

function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <TicketsProvider>
          <AppContent />
        </TicketsProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
