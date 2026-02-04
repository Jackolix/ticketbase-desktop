import React from 'react';
import { useUpdater } from '../../contexts/UpdaterContext';
import { Button } from './button';
import { Progress } from './progress';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from './card';
import { Badge } from './badge';
import { Check, Download, RefreshCw, X } from 'lucide-react';

export const UpdateNotification: React.FC = () => {
  const {
    availableUpdate,
    isDownloading,
    isUpdateDownloaded,
    isInstalling,
    downloadProgress,
    downloadUpdate,
    installUpdate,
    dismissUpdate,
  } = useUpdater();

  if (!availableUpdate) {
    return null;
  }

  const handleDownload = () => {
    downloadUpdate();
  };

  const handleInstall = () => {
    installUpdate();
  };

  const handleDismiss = () => {
    dismissUpdate();
  };

  return (
    <Card className="fixed bottom-4 right-4 w-80 border-blue-200 bg-blue-50 dark:bg-blue-950 dark:border-blue-800 z-50">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <div className="flex items-center gap-2">
          <RefreshCw className="h-4 w-4 text-blue-600 dark:text-blue-400" />
          <CardTitle className="text-sm">
            {isUpdateDownloaded ? 'Update Ready' : 'Update Available'}
          </CardTitle>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleDismiss}
          className="h-6 w-6 p-0 hover:bg-blue-100 dark:hover:bg-blue-900"
        >
          <X className="h-3 w-3" />
        </Button>
      </CardHeader>

      <CardContent className="pb-3">
        <CardDescription className="mb-3">
          Version <Badge variant="secondary">{availableUpdate.version}</Badge> is now available.
          You're currently on version <Badge variant="outline">{availableUpdate.currentVersion}</Badge>.
        </CardDescription>

        {availableUpdate.body && (
          <div className="text-xs text-muted-foreground mb-3 max-h-20 overflow-y-auto">
            {availableUpdate.body}
          </div>
        )}

        {isDownloading && (
          <div className="mb-3">
            <div className="flex justify-between text-xs mb-1">
              <span>Downloading...</span>
              <span>{downloadProgress}%</span>
            </div>
            <Progress value={downloadProgress} className="h-2" />
          </div>
        )}

        {isUpdateDownloaded && !isInstalling && (
          <div className="flex items-center gap-2 text-xs text-green-600 dark:text-green-400 mb-2">
            <Check className="h-3 w-3" />
            <span>Update will install when you close the app</span>
          </div>
        )}
      </CardContent>

      <CardFooter className="pt-0">
        {!isUpdateDownloaded && !isDownloading && (
          <Button onClick={handleDownload} className="w-full" size="sm">
            <Download className="h-3 w-3 mr-1" />
            Download Update
          </Button>
        )}

        {isDownloading && (
          <Button disabled className="w-full" size="sm">
            <Download className="h-3 w-3 mr-1 animate-spin" />
            Downloading...
          </Button>
        )}

        {isUpdateDownloaded && !isInstalling && (
          <Button onClick={handleInstall} className="w-full" size="sm" variant="outline">
            <RefreshCw className="h-3 w-3 mr-1" />
            Install & Restart Now
          </Button>
        )}

        {isInstalling && (
          <Button disabled className="w-full" size="sm">
            <RefreshCw className="h-3 w-3 mr-1 animate-spin" />
            Installing...
          </Button>
        )}
      </CardFooter>
    </Card>
  );
};