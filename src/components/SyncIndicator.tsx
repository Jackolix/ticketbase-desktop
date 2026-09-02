import { useEffect, useState } from 'react';
import { AlertTriangle, Check, Loader2, RefreshCw, WifiOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useTickets } from '@/contexts/TicketsContext';

/**
 * Shows how current the ticket data is, and lets the user force a refresh.
 *
 * Worth having because the app now renders from a local store: without this,
 * stale data and fresh data look identical, and a failing sync would be
 * invisible until someone noticed a ticket was missing.
 */
export function SyncIndicator() {
  const { syncStatus, refreshTickets } = useTickets();
  const [, forceTick] = useState(0);

  // Re-render once a minute so the relative timestamp does not go stale.
  useEffect(() => {
    const interval = setInterval(() => forceTick((n) => n + 1), 60_000);
    return () => clearInterval(interval);
  }, []);

  if (!syncStatus) return null;

  const { state, lastSyncedAt, lastError, retrying, droppedLastSync } = syncStatus;
  const isFailed = state === 'failed';

  const icon = isFailed ? (
    retrying ? (
      <WifiOff className="h-3.5 w-3.5" />
    ) : (
      <AlertTriangle className="h-3.5 w-3.5" />
    )
  ) : state === 'syncing' ? (
    <Loader2 className="h-3.5 w-3.5 animate-spin" />
  ) : (
    <Check className="h-3.5 w-3.5" />
  );

  const label = isFailed
    ? retrying
      ? 'Offline'
      : 'Sync failed'
    : state === 'syncing'
      ? 'Syncing…'
      : lastSyncedAt
        ? relativeTime(lastSyncedAt)
        : 'Not synced yet';

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex items-center gap-1">
        <Tooltip>
          <TooltipTrigger asChild>
            <span
              className={[
                'inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-xs',
                isFailed
                  ? 'bg-tone-danger-soft text-tone-danger'
                  : 'text-muted-foreground',
              ].join(' ')}
            >
              {icon}
              <span className="tabular-nums">{label}</span>
            </span>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="max-w-xs">
            {isFailed && lastError ? (
              <div className="space-y-1">
                <p className="font-medium">
                  {retrying ? 'Retrying automatically' : 'Sync stopped'}
                </p>
                <p className="text-xs opacity-90 break-words">{lastError}</p>
                <p className="text-xs opacity-75">
                  Showing the last data that synced successfully.
                </p>
              </div>
            ) : (
              <div className="space-y-1">
                <p>
                  {lastSyncedAt
                    ? `Last synced ${new Date(lastSyncedAt).toLocaleTimeString()}`
                    : 'No successful sync yet'}
                </p>
                {/* Non-zero means the server returned nulls in its own
                    response, not that the app lost anything. */}
                {droppedLastSync > 0 && (
                  <p className="text-xs opacity-90">
                    The server returned {droppedLastSync} unreadable{' '}
                    {droppedLastSync === 1 ? 'ticket' : 'tickets'} in the last sync.
                  </p>
                )}
              </div>
            )}
          </TooltipContent>
        </Tooltip>

        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={() => void refreshTickets()}
          disabled={state === 'syncing'}
          aria-label="Refresh tickets now"
        >
          <RefreshCw className="h-3.5 w-3.5" />
        </Button>
      </div>
    </TooltipProvider>
  );
}

function relativeTime(timestamp: number): string {
  const seconds = Math.max(0, Math.round((Date.now() - timestamp) / 1000));

  if (seconds < 45) return 'Just now';
  if (seconds < 90) return '1 min ago';

  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;

  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;

  return `${Math.round(hours / 24)} d ago`;
}
