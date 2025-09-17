import { invoke } from '@tauri-apps/api/core';
import { WebviewWindow } from '@tauri-apps/api/webviewWindow';
import { Ticket } from '@/types/api';

export class WindowManager {
  private static openWindows = new Map<string, WebviewWindow>();
  private static tempFiles = new Set<string>();

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

  static async openFileExternally(filename: string, fileBlob: Blob): Promise<void> {
    try {
      // Import required modules
      const opener = await import('@tauri-apps/plugin-opener');
      const { tempDir } = await import('@tauri-apps/api/path');
      const { join } = await import('@tauri-apps/api/path');
      const { writeFile } = await import('@tauri-apps/plugin-fs');

      // Create unique filename to avoid conflicts
      const timestamp = Date.now();
      const uniqueFilename = `${timestamp}_${filename}`;

      // Get temp directory and create full path
      const tempDirPath = await tempDir();
      const fullFilePath = await join(tempDirPath, uniqueFilename);

      // Write file directly to temp directory
      const arrayBuffer = await fileBlob.arrayBuffer();
      const uint8Array = new Uint8Array(arrayBuffer);
      await writeFile(fullFilePath, uint8Array);

      console.log('File written to temp directory:', fullFilePath);

      // Open the file with default application
      try {
        console.log('Opening file with openPath:', fullFilePath);
        await opener.openPath(fullFilePath);
      } catch (pathError) {
        console.log('openPath failed, trying with file:// URL');
        try {
          // Convert path to proper file URL format for all platforms
          const fileUrl = `file://${fullFilePath.startsWith('/') ? '' : '/'}${fullFilePath.replace(/\\/g, '/')}`;
          await opener.openUrl(fileUrl);
        } catch (urlError) {
          console.log('openUrl failed, trying revealItemInDir to show file in folder');
          await opener.revealItemInDir(fullFilePath);
          console.log('File revealed in temp folder');
        }
      }

      // Track temp files for cleanup
      this.trackTempFile(fullFilePath);

      // Set up cleanup after a delay (file viewer should have opened by now)
      // We'll clean up after 30 seconds, assuming the file viewer has loaded the file into memory
      setTimeout(async () => {
        await this.cleanupTempFile(fullFilePath);
      }, 30000); // 30 seconds

      console.log(`File opened externally: ${filename}`);
    } catch (error) {
      console.error('Failed to open file externally:', error);
      throw error;
    }
  }

  private static trackTempFile(filePath: string): void {
    this.tempFiles.add(filePath);

    // Store temp files in localStorage for persistence across app sessions
    const existingFiles = JSON.parse(localStorage.getItem('tempFiles') || '[]');
    existingFiles.push({
      path: filePath,
      created: Date.now()
    });
    localStorage.setItem('tempFiles', JSON.stringify(existingFiles));
  }

  private static async cleanupTempFile(filePath: string): Promise<void> {
    try {
      const { exists, remove } = await import('@tauri-apps/plugin-fs');

      const fileStillExists = await exists(filePath);
      if (fileStillExists) {
        await remove(filePath);
        console.log('Temporary file cleaned up:', filePath);
      }

      this.tempFiles.delete(filePath);
      this.removeFromPersistentStorage(filePath);
    } catch (cleanupError) {
      console.warn('Failed to cleanup temporary file:', cleanupError);
    }
  }

  private static removeFromPersistentStorage(filePath: string): void {
    const existingFiles = JSON.parse(localStorage.getItem('tempFiles') || '[]');
    const updatedFiles = existingFiles.filter((file: any) => file.path !== filePath);
    localStorage.setItem('tempFiles', JSON.stringify(updatedFiles));
  }

  // Clean up old temp files on app startup
  static async cleanupOldTempFiles(): Promise<void> {
    try {
      const { exists, remove } = await import('@tauri-apps/plugin-fs');
      const existingFiles = JSON.parse(localStorage.getItem('tempFiles') || '[]');
      const now = Date.now();
      const maxAge = 24 * 60 * 60 * 1000; // 24 hours

      const filesToCleanup = existingFiles.filter((file: any) =>
        (now - file.created) > maxAge
      );

      for (const file of filesToCleanup) {
        try {
          const fileExists = await exists(file.path);
          if (fileExists) {
            await remove(file.path);
            console.log('Cleaned up old temp file:', file.path);
          }
        } catch (error) {
          console.warn('Failed to cleanup old temp file:', file.path, error);
        }
      }

      // Update storage with remaining files
      const remainingFiles = existingFiles.filter((file: any) =>
        (now - file.created) <= maxAge
      );
      localStorage.setItem('tempFiles', JSON.stringify(remainingFiles));

      console.log(`Temp file cleanup completed. Cleaned ${filesToCleanup.length} old files.`);
    } catch (error) {
      console.error('Failed to cleanup old temp files:', error);
    }
  }

  // Clean up all temp files (call this on app shutdown)
  static async cleanupAllTempFiles(): Promise<void> {
    try {
      const { exists, remove } = await import('@tauri-apps/plugin-fs');
      const existingFiles = JSON.parse(localStorage.getItem('tempFiles') || '[]');

      for (const file of existingFiles) {
        try {
          const fileExists = await exists(file.path);
          if (fileExists) {
            await remove(file.path);
            console.log('Cleaned up temp file on shutdown:', file.path);
          }
        } catch (error) {
          console.warn('Failed to cleanup temp file on shutdown:', file.path, error);
        }
      }

      // Clear storage
      localStorage.removeItem('tempFiles');
      this.tempFiles.clear();

      console.log('All temp files cleaned up on shutdown');
    } catch (error) {
      console.error('Failed to cleanup temp files on shutdown:', error);
    }
  }

}