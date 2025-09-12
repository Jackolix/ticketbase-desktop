import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { check, Update, DownloadEvent } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';
import { getVersion } from '@tauri-apps/api/app';

interface UpdaterContextType {
  currentVersion: string;
  availableUpdate: Update | null;
  isCheckingForUpdate: boolean;
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
  const [isInstalling, setIsInstalling] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [lastError, setLastError] = useState<string | null>(null);
  const [lastCheckTime, setLastCheckTime] = useState<Date | null>(null);
  const [debugInfo, setDebugInfo] = useState('');

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

  // Check for updates periodically (every 30 minutes)
  useEffect(() => {
    const checkForUpdates = async () => {
      if (isCheckingForUpdate || isInstalling) return;

      try {
        setIsCheckingForUpdate(true);
        setLastError(null);
        const update = await check();
        
        if (update && (!availableUpdate || update.version !== availableUpdate.version)) {
          console.log('Update available:', update.version);
          setAvailableUpdate(update);
          setIsUpdateDownloaded(false);
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
  }, []); // Remove dependencies to prevent infinite loops

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
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      
      if (errorMessage.includes('Could not fetch a valid release JSON')) {
        setLastError('No update manifest found. This is normal until a new release is published with updater support.');
        setDebugInfo('Missing latest.json file - waiting for new release');
      } else if (errorMessage.includes('timeout')) {
        setLastError('Update check timed out. Please check your internet connection.');
        setDebugInfo('Connection timeout after 30 seconds');
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
    if (!availableUpdate || isUpdateDownloaded) return;

    try {
      console.log('Downloading update...');
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