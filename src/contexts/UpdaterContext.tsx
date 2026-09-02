import React, { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from 'react';
import { check, Update, DownloadEvent } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';
import { getVersion } from '@tauri-apps/api/app';
import { getCurrentWindow } from '@tauri-apps/api/window';

interface UpdaterContextType {
  currentVersion: string;
  availableUpdate: Update | null;
  isCheckingForUpdate: boolean;
  isDownloading: boolean;
  isUpdateDownloaded: boolean;
  isInstalling: boolean;
  downloadProgress: number;
  lastError: string | null;
  lastCheckTime: Date | null;
  debugInfo: string;
  checkForUpdate: () => Promise<void>;
  downloadUpdate: () => Promise<void>;
  installUpdate: () => Promise<void>;
  dismissUpdate: () => void;
  clearError: () => void;
}

const UpdaterContext = createContext<UpdaterContextType | undefined>(undefined);

export const useUpdater = () => {
  const context = useContext(UpdaterContext);
  if (context === undefined) {
    throw new Error('useUpdater must be used within an UpdaterProvider');
  }
  return context;
};

interface UpdaterProviderProps {
  children: ReactNode;
}

export const UpdaterProvider: React.FC<UpdaterProviderProps> = ({ children }) => {
  const [currentVersion, setCurrentVersion] = useState<string>('');
  const [availableUpdate, setAvailableUpdate] = useState<Update | null>(null);
  const [isCheckingForUpdate, setIsCheckingForUpdate] = useState(false);
  const [isUpdateDownloaded, setIsUpdateDownloaded] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isInstalling, setIsInstalling] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [lastError, setLastError] = useState<string | null>(null);
  const [lastCheckTime, setLastCheckTime] = useState<Date | null>(null);
  const [debugInfo, setDebugInfo] = useState('');

  // Refs to access latest state in event handlers and long-lived intervals.
  //
  // The periodic check runs on an interval created once, so anything it reads
  // from state directly would be frozen at its first-render value. That was a
  // live bug: `availableUpdate` was permanently null inside the closure, so the
  // version comparison always passed and the same update was re-downloaded
  // every 30 minutes.
  const updateRef = useRef<Update | null>(null);
  const isUpdateDownloadedRef = useRef(false);
  const isCheckingRef = useRef(false);
  const isDownloadingRef = useRef(false);
  const isInstallingRef = useRef(false);

  // Keep refs in sync with state
  useEffect(() => {
    updateRef.current = availableUpdate;
  }, [availableUpdate]);

  useEffect(() => {
    isUpdateDownloadedRef.current = isUpdateDownloaded;
  }, [isUpdateDownloaded]);

  useEffect(() => {
    isCheckingRef.current = isCheckingForUpdate;
  }, [isCheckingForUpdate]);

  useEffect(() => {
    isDownloadingRef.current = isDownloading;
  }, [isDownloading]);

  useEffect(() => {
    isInstallingRef.current = isInstalling;
  }, [isInstalling]);

  // Get current app version on mount
  useEffect(() => {
    const getCurrentVersion = async () => {
      try {
        const version = await getVersion();
        setCurrentVersion(version);
      } catch (error) {
        console.error('Failed to get app version:', error);
        setCurrentVersion('Unknown');
      }
    };

    getCurrentVersion();
  }, []);

  // Auto-download update in background
  const autoDownloadUpdate = useCallback(async (update: Update) => {
    if (isDownloadingRef.current || isUpdateDownloadedRef.current) return;

    try {
      console.log('Auto-downloading update in background...');
      setIsDownloading(true);
      setDownloadProgress(0);

      let totalBytes = 0;
      let downloadedBytes = 0;

      await update.download((event: DownloadEvent) => {
        switch (event.event) {
          case 'Started':
            if (event.data.contentLength) {
              totalBytes = event.data.contentLength;
            }
            break;
          case 'Progress':
            downloadedBytes += event.data.chunkLength;
            if (totalBytes > 0) {
              const progress = Math.round((downloadedBytes / totalBytes) * 100);
              setDownloadProgress(progress);
            }
            break;
          case 'Finished':
            setDownloadProgress(100);
            setIsUpdateDownloaded(true);
            console.log('Update downloaded successfully (background). Will install on app close.');
            break;
        }
      });
    } catch (error) {
      console.error('Failed to auto-download update:', error);
      setDownloadProgress(0);
    } finally {
      setIsDownloading(false);
    }
  }, []);

  // Check for updates periodically (every 30 minutes)
  useEffect(() => {
    const checkForUpdates = async () => {
      if (isCheckingRef.current || isInstallingRef.current) return;

      try {
        setIsCheckingForUpdate(true);
        setLastError(null);
        const update = await check();

        const known = updateRef.current;
        if (update && (!known || update.version !== known.version)) {
          console.log('Update available:', update.version);
          setAvailableUpdate(update);
          setIsUpdateDownloaded(false);

          // Auto-download the update in background
          autoDownloadUpdate(update);
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        console.error('Update check failed:', errorMessage);

        // Don't show error for development or missing latest.json
        if (errorMessage.includes('Could not fetch a valid release JSON')) {
          console.log('Note: latest.json not found. This is normal if no releases with updater support have been published yet.');
        } else {
          setLastError(`Update check failed: ${errorMessage}`);
        }
      } finally {
        setIsCheckingForUpdate(false);
      }
    };

    // Skip automatic checks in development
    const isDevelopment = import.meta.env.DEV;
    if (!isDevelopment) {
      // Check immediately on mount
      checkForUpdates();

      // Then check every 30 minutes
      const interval = setInterval(checkForUpdates, 30 * 60 * 1000);
      return () => clearInterval(interval);
    }
  }, [autoDownloadUpdate]);

  // Install a downloaded update when the app is closed.
  //
  // This only ever runs on the main window. It used to be registered on every
  // window, so closing a ticket popup would preventDefault() and try to install
  // the whole application — and if that failed, the window could never be
  // closed at all.
  useEffect(() => {
    const isDevelopment = import.meta.env.DEV;
    if (isDevelopment) return;

    const appWindow = getCurrentWindow();
    if (appWindow.label !== 'main') return;

    let unlisten: (() => void) | undefined;
    let cancelled = false;

    const setupCloseHandler = async () => {
      const handler = await appWindow.onCloseRequested(async (event) => {
        if (!isUpdateDownloadedRef.current || !updateRef.current) return;

        // Hold the window open just long enough to swap the binary.
        event.preventDefault();
        console.log('Installing update before closing...');

        try {
          await Promise.race([
            updateRef.current.install(),
            new Promise<never>((_, reject) =>
              setTimeout(() => reject(new Error('Install timeout after 15s')), 15000)
            ),
          ]);
          await relaunch();
        } catch (error) {
          console.error('Failed to install update on close:', error);
          // The user asked to close. Honour that regardless of the update:
          // destroy() bypasses this same handler, so it cannot loop.
          await appWindow.destroy();
        }
      });

      if (cancelled) {
        handler();
        return;
      }
      unlisten = handler;
    };

    setupCloseHandler();

    return () => {
      cancelled = true;
      if (unlisten) {
        unlisten();
      }
    };
  }, []);

  const checkForUpdate = async () => {
    // Prevent multiple simultaneous checks but don't silently fail
    if (isCheckingForUpdate) {
      setDebugInfo('Update check already in progress...');
      return;
    }
    
    if (isInstalling) {
      setDebugInfo('Cannot check for updates while installing...');
      return;
    }

    setDebugInfo('Starting update check...');
    const startTime = new Date();
    
    try {
      setIsCheckingForUpdate(true);
      setLastError(null);
      setLastCheckTime(startTime);
      
      setDebugInfo('Connecting to update server...');
      
      const update = await Promise.race([
        check(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Update check timeout after 30 seconds')), 30000))
      ]) as Update | null;
      
      if (update) {
        setDebugInfo(`Update found: v${update.version} (current: v${update.currentVersion})`);
        setAvailableUpdate(update);
        setIsUpdateDownloaded(false);
      } else {
        setDebugInfo('No updates available - you have the latest version');
        setAvailableUpdate(null);
        setIsUpdateDownloaded(false);
      }
      
      // Clear debug info after 5 seconds if successful
      setTimeout(() => {
        if (!lastError) {
          setDebugInfo('');
        }
      }, 5000);
      
    } catch (error) {
      let errorMessage = 'Unknown error occurred';

      if (error instanceof Error) {
        errorMessage = error.message;
      } else if (typeof error === 'string') {
        errorMessage = error;
      } else if (error && typeof error === 'object') {
        errorMessage = JSON.stringify(error);
      }

      console.error('Update check error:', error);
      console.error('Error message:', errorMessage);

      if (errorMessage.includes('Could not fetch a valid release JSON') ||
          errorMessage.includes('404') ||
          errorMessage.includes('Not Found')) {
        setLastError('No update manifest found. This is normal until a new release is published with updater support.');
        setDebugInfo('Missing latest.json file - waiting for new release');
      } else if (errorMessage.includes('timeout') || errorMessage.includes('timed out')) {
        setLastError('Update check timed out. Please check your internet connection.');
        setDebugInfo('Connection timeout after 30 seconds');
      } else if (errorMessage.includes('network') || errorMessage.includes('fetch')) {
        setLastError('Network error. Please check your internet connection.');
        setDebugInfo(`Network error: ${errorMessage}`);
      } else {
        setLastError(`Update check failed: ${errorMessage}`);
        setDebugInfo(`Error: ${errorMessage}`);
      }
    } finally {
      setIsCheckingForUpdate(false);
      const endTime = new Date();
      const duration = endTime.getTime() - startTime.getTime();
      setDebugInfo(prev => `${prev} (took ${duration}ms)`);
    }
  };

  const clearError = () => {
    setLastError(null);
    setDebugInfo('');
  };

  const downloadUpdate = async () => {
    if (!availableUpdate || isUpdateDownloaded || isDownloading) return;

    try {
      console.log('Downloading update...');
      setIsDownloading(true);
      setDownloadProgress(0);

      let totalBytes = 0;
      let downloadedBytes = 0;

      await availableUpdate.download((event: DownloadEvent) => {
        switch (event.event) {
          case 'Started':
            if (event.data.contentLength) {
              totalBytes = event.data.contentLength;
            }
            break;
          case 'Progress':
            downloadedBytes += event.data.chunkLength;
            if (totalBytes > 0) {
              const progress = Math.round((downloadedBytes / totalBytes) * 100);
              setDownloadProgress(progress);
            }
            break;
          case 'Finished':
            setDownloadProgress(100);
            setIsUpdateDownloaded(true);
            console.log('Update downloaded successfully');
            break;
        }
      });
    } catch (error) {
      console.error('Failed to download update:', error);
      setDownloadProgress(0);
    } finally {
      setIsDownloading(false);
    }
  };

  const installUpdate = async () => {
    if (!availableUpdate || !isUpdateDownloaded) return;

    try {
      setIsInstalling(true);
      console.log('Installing update...');
      await availableUpdate.install();
      // App will restart after installation
      await relaunch();
    } catch (error) {
      console.error('Failed to install update:', error);
      setIsInstalling(false);
    }
  };

  const dismissUpdate = () => {
    setAvailableUpdate(null);
    setIsUpdateDownloaded(false);
    setDownloadProgress(0);
  };

  const value: UpdaterContextType = {
    currentVersion,
    availableUpdate,
    isCheckingForUpdate,
    isDownloading,
    isUpdateDownloaded,
    isInstalling,
    downloadProgress,
    lastError,
    lastCheckTime,
    debugInfo,
    checkForUpdate,
    downloadUpdate,
    installUpdate,
    dismissUpdate,
    clearError,
  };

  return (
    <UpdaterContext.Provider value={value}>
      {children}
    </UpdaterContext.Provider>
  );
};