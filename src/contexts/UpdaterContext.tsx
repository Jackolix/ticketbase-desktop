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
  checkForUpdate: () => Promise<void>;
  downloadUpdate: () => Promise<void>;
  installUpdate: () => Promise<void>;
  dismissUpdate: () => void;
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
        const update = await check();
        
        if (update && (!availableUpdate || update.version !== availableUpdate.version)) {
          console.log('Update available:', update.version);
          setAvailableUpdate(update);
          setIsUpdateDownloaded(false);
        }
      } catch (error) {
        console.error('Update check failed:', error);
      } finally {
        setIsCheckingForUpdate(false);
      }
    };

    // Check immediately on mount
    checkForUpdates();

    // Then check every 30 minutes
    const interval = setInterval(checkForUpdates, 30 * 60 * 1000);

    return () => clearInterval(interval);
  }, [availableUpdate, isCheckingForUpdate, isInstalling]);

  const checkForUpdate = async () => {
    if (isCheckingForUpdate || isInstalling) return;

    try {
      setIsCheckingForUpdate(true);
      const update = await check();
      
      if (update) {
        console.log('Update available:', update.version);
        setAvailableUpdate(update);
        setIsUpdateDownloaded(false);
      } else {
        setAvailableUpdate(null);
        setIsUpdateDownloaded(false);
      }
    } catch (error) {
      console.error('Update check failed:', error);
    } finally {
      setIsCheckingForUpdate(false);
    }
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
    checkForUpdate,
    downloadUpdate,
    installUpdate,
    dismissUpdate,
  };

  return (
    <UpdaterContext.Provider value={value}>
      {children}
    </UpdaterContext.Provider>
  );
};