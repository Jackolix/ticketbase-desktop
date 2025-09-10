"use client"

import * as React from "react"
import {
  Home,
  Ticket,
  Plus,
  Calendar,
  BarChart3,
  Settings,
  Sun,
  Moon,
  Bell,
  Play,
  LogOut,
} from "lucide-react"

import { NavUser } from "@/components/nav-user"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
} from "@/components/ui/sidebar"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { useAuth } from "@/contexts/AuthContext"
import { useTheme } from "@/contexts/ThemeContext"

interface TicketAppSidebarProps extends React.ComponentProps<typeof Sidebar> {
  currentView: string;
  onViewChange: (view: string) => void;
}

export function TicketAppSidebar({ currentView, onViewChange, ...props }: TicketAppSidebarProps) {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();

  const navigationItems = [
    {
      title: "Dashboard",
      url: "dashboard",
      icon: Home,
      isActive: currentView === "dashboard",
    },
    {
      title: "Tickets",
      url: "tickets",
      icon: Ticket,
      isActive: currentView === "tickets",
    },
    {
      title: "New Ticket",
      url: "new-ticket",
      icon: Plus,
      isActive: currentView === "new-ticket",
      variant: "default" as const,
    },
    {
      title: "Today",
      url: "today",
      icon: Calendar,
      isActive: currentView === "today",
    },
    {
      title: "Reports",
      url: "reports",
      icon: BarChart3,
      isActive: currentView === "reports",
    },
  ];

  const userData = user ? {
    name: user.name,
    email: user.email,
    avatar: user.profile_photo_url || "",
  } : {
    name: "User",
    email: "user@example.com",
    avatar: "",
  };

  const handleNavClick = (url: string, e: React.MouseEvent) => {
    e.preventDefault();
    onViewChange(url);
  };

  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader className="p-4">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 overflow-hidden">
            <img 
              src="/logo.png" 
              alt="Ticket System Logo" 
              className="w-8 h-8 object-contain"
              onError={(e) => {
                // Fallback to gradient background if logo fails to load
                const target = e.target as HTMLImageElement;
                target.style.display = 'none';
                const parent = target.parentElement;
                if (parent) {
                  parent.className += ' bg-gradient-to-br from-blue-500 to-purple-600';
                  const fallbackIcon = document.createElement('div');
                  fallbackIcon.innerHTML = '<svg class="w-4 h-4 text-white" viewBox="0 0 24 24" fill="currentColor"><path d="M20 6L9 17l-5-5" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>';
                  parent.appendChild(fallbackIcon);
                }
              }}
            />
          </div>
          <div className="truncate">
            <h2 className="text-lg font-semibold">Ticketbase</h2>
            <p className="text-xs text-muted-foreground">Technican</p>
          </div>
        </div>
      </SidebarHeader>
      
      <SidebarContent className="px-2">
        {/* Main Navigation */}
        <SidebarGroup>
          <SidebarGroupLabel className="px-2 text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
            Navigation
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu className="space-y-1 group-data-[collapsible=icon]:items-center">
              {navigationItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    asChild
                    isActive={item.isActive}
                    tooltip={item.title}
                    className={`
                      h-10 px-3 rounded-lg transition-all duration-200 hover:bg-accent/80
                      group-data-[collapsible=icon]:h-8! group-data-[collapsible=icon]:w-8! group-data-[collapsible=icon]:p-2! group-data-[collapsible=icon]:justify-center
                      ${item.isActive 
                        ? 'bg-gradient-to-r from-blue-500/10 to-purple-500/10 border border-blue-200/20 dark:border-blue-800/40 text-blue-700 dark:text-blue-300 shadow-sm' 
                        : 'hover:bg-accent/50'
                      }
                      ${item.variant === 'default' 
                        ? 'bg-gradient-to-r from-green-500/10 to-emerald-500/10 border border-green-200/20 dark:border-green-800/40 text-green-700 dark:text-green-300' 
                        : ''
                      }
                    `}
                  >
                    <a href="#" onClick={(e) => handleNavClick(item.url, e)} className="flex items-center gap-3 w-full group-data-[collapsible=icon]:w-auto group-data-[collapsible=icon]:justify-center">
                      <item.icon className={`h-4 w-4 shrink-0 ${item.isActive ? 'animate-pulse' : ''}`} />
                      <span className="font-medium group-data-[collapsible=icon]:sr-only">{item.title}</span>
                    </a>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <Separator className="my-4" />

        {/* Settings & Actions */}
        <SidebarGroup>
          <SidebarGroupLabel className="px-2 text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
            Settings & Actions
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu className="space-y-1 group-data-[collapsible=icon]:items-center">
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={currentView === "settings"}
                  tooltip="Settings"
                  className={`
                    h-10 px-3 rounded-lg transition-all duration-200 hover:bg-accent/80
                    group-data-[collapsible=icon]:h-8! group-data-[collapsible=icon]:w-8! group-data-[collapsible=icon]:p-2! group-data-[collapsible=icon]:justify-center
                    ${currentView === "settings" 
                      ? 'bg-gradient-to-r from-blue-500/10 to-purple-500/10 border border-blue-200/20 dark:border-blue-800/40 text-blue-700 dark:text-blue-300 shadow-sm' 
                      : 'hover:bg-accent/50'
                    }
                  `}
                >
                  <a href="#" onClick={(e) => handleNavClick("settings", e)} className="flex items-center gap-3 w-full group-data-[collapsible=icon]:w-auto group-data-[collapsible=icon]:justify-center">
                    <Settings className="h-4 w-4 shrink-0" />
                    <span className="font-medium group-data-[collapsible=icon]:sr-only">Settings</span>
                  </a>
                </SidebarMenuButton>
              </SidebarMenuItem>

              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  tooltip={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
                  className="h-10 px-3 rounded-lg transition-all duration-200 hover:bg-accent/80 hover:bg-orange-500/10 hover:border hover:border-orange-200/20 dark:hover:border-orange-800/40 group-data-[collapsible=icon]:h-8! group-data-[collapsible=icon]:w-8! group-data-[collapsible=icon]:p-2! group-data-[collapsible=icon]:justify-center"
                >
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={toggleTheme}
                    className="w-full justify-start gap-3 h-auto p-0 hover:bg-transparent group-data-[collapsible=icon]:w-auto group-data-[collapsible=icon]:justify-center"
                  >
                    {theme === 'dark' ? (
                      <Sun className="h-4 w-4 shrink-0 text-orange-500" />
                    ) : (
                      <Moon className="h-4 w-4 shrink-0 text-blue-600" />
                    )}
                    <span className="font-medium group-data-[collapsible=icon]:sr-only">
                      {theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
                    </span>
                  </Button>
                </SidebarMenuButton>
              </SidebarMenuItem>
              
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  tooltip="Notifications"
                  className="h-10 px-3 rounded-lg transition-all duration-200 hover:bg-accent/80 hover:bg-blue-500/10 hover:border hover:border-blue-200/20 dark:hover:border-blue-800/40 group-data-[collapsible=icon]:h-8! group-data-[collapsible=icon]:w-8! group-data-[collapsible=icon]:p-2! group-data-[collapsible=icon]:justify-center"
                >
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full justify-start gap-3 h-auto p-0 hover:bg-transparent group-data-[collapsible=icon]:w-auto group-data-[collapsible=icon]:justify-center"
                  >
                    <Bell className="h-4 w-4 shrink-0" />
                    <span className="font-medium group-data-[collapsible=icon]:sr-only">Notifications</span>
                    <div className="ml-auto w-2 h-2 bg-red-500 rounded-full animate-pulse group-data-[collapsible=icon]:hidden" />
                  </Button>
                </SidebarMenuButton>
              </SidebarMenuItem>

              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  tooltip="Start Work Session"
                  className="h-10 px-3 rounded-lg transition-all duration-200 hover:bg-accent/80 hover:bg-green-500/10 hover:border hover:border-green-200/20 dark:hover:border-green-800/40 group-data-[collapsible=icon]:h-8! group-data-[collapsible=icon]:w-8! group-data-[collapsible=icon]:p-2! group-data-[collapsible=icon]:justify-center"
                >
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full justify-start gap-3 h-auto p-0 hover:bg-transparent group-data-[collapsible=icon]:w-auto group-data-[collapsible=icon]:justify-center"
                  >
                    <Play className="h-4 w-4 shrink-0 text-green-600" />
                    <span className="font-medium group-data-[collapsible=icon]:sr-only">Start Work</span>
                  </Button>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      
      <SidebarFooter className="p-2">
        <SidebarMenu className="group-data-[collapsible=icon]:items-center">
          <SidebarMenuItem>
            <NavUser user={userData} />
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton 
              asChild 
              tooltip="Logout"
              className="h-10 px-3 rounded-lg transition-all duration-200 hover:bg-red-50 dark:hover:bg-red-950/50 hover:border hover:border-red-200/40 dark:hover:border-red-800/40 group-data-[collapsible=icon]:h-8! group-data-[collapsible=icon]:w-8! group-data-[collapsible=icon]:p-2! group-data-[collapsible=icon]:justify-center"
            >
              <Button
                variant="ghost"
                size="sm"
                onClick={logout}
                className="w-full justify-start gap-3 h-auto p-0 text-red-600 hover:text-red-700 hover:bg-transparent group-data-[collapsible=icon]:w-auto group-data-[collapsible=icon]:justify-center"
              >
                <LogOut className="h-4 w-4 shrink-0" />
                <span className="font-medium group-data-[collapsible=icon]:sr-only">Logout</span>
              </Button>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      
    </Sidebar>
  )
}