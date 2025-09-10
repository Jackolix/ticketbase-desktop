import { invoke } from '@tauri-apps/api/core';
import { WebviewWindow } from '@tauri-apps/api/webviewWindow';
import { Ticket } from '@/types/api';

export class WindowManager {
  private static openWindows = new Map<string, WebviewWindow>();

  static async openTicketInNewWindow(ticket: Ticket): Promise<void> {
    const windowLabel = `ticket-${ticket.id}`;
    
    try {
      // Try to use the Rust command first (more reliable for window management)
      await invoke('open_ticket_window', { ticketId: ticket.id });
    } catch (error) {
      console.error('Failed to open window via Rust command, falling back to JS API:', error);
      
      // Fallback to JavaScript API
      const existingWindow = await WebviewWindow.getByLabel(windowLabel);
      if (existingWindow) {
        await existingWindow.setFocus();
        return;
      }

      const webview = new WebviewWindow(windowLabel, {
        url: `/?ticketWindow=true#/ticket/${ticket.id}`,
        title: `Ticket #${ticket.id} - ${ticket.summary}`,
        width: 1000,
        height: 800,
        minWidth: 600,
        minHeight: 400,
        center: true,
      });

      // Store the window reference
      this.openWindows.set(windowLabel, webview);

      // Listen for window events
      webview.once('tauri://created', () => {
        console.log(`Window ${windowLabel} created successfully`);
      });

      webview.once('tauri://error', (error) => {
        console.error(`Error creating window ${windowLabel}:`, error);
        this.openWindows.delete(windowLabel);
      });

      // Clean up when window is closed
      webview.listen('tauri://close-requested', () => {
        this.openWindows.delete(windowLabel);
      });
    }
  }

  static async focusTicketWindow(ticketId: number): Promise<boolean> {
    const windowLabel = `ticket-${ticketId}`;
    
    try {
      const existingWindow = await WebviewWindow.getByLabel(windowLabel);
      if (existingWindow) {
        await existingWindow.setFocus();
        return true;
      }
    } catch (error) {
      console.error('Failed to focus window:', error);
    }
    
    return false;
  }

  static async closeTicketWindow(ticketId: number): Promise<void> {
    const windowLabel = `ticket-${ticketId}`;
    
    try {
      const existingWindow = await WebviewWindow.getByLabel(windowLabel);
      if (existingWindow) {
        await existingWindow.close();
        this.openWindows.delete(windowLabel);
      }
    } catch (error) {
      console.error('Failed to close window:', error);
    }
  }

  static getOpenWindows(): string[] {
    return Array.from(this.openWindows.keys());
  }

  static async isWindowOpen(ticketId: number): Promise<boolean> {
    const windowLabel = `ticket-${ticketId}`;
    if (this.openWindows.has(windowLabel)) {
      return true;
    }
    
    try {
      const existingWindow = await WebviewWindow.getByLabel(windowLabel);
      return existingWindow !== null;
    } catch {
      return false;
    }
  }
}