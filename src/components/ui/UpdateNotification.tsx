import { AlertTriangle, ArrowUpCircle, Check, Download, Loader2, RotateCw, X } from 'lucide-react';

import { useUpdater } from '@/contexts/UpdaterContext';
import { parseReleaseNotes } from '@/lib/releaseNotes';
import { Button } from './button';
import { Progress } from './progress';

/**
 * The update prompt.
 *
 * A corner panel rather than a modal: an update is never urgent enough to take
 * the window away from someone mid-ticket, and the previous version was
 * dismissable anyway.
 *
 * It reads from the app's own tone tokens instead of the hardcoded blues and
 * greens it used to carry, so it follows the theme like everything else — and
 * it now has an error state at all. `lastError` was on the context the whole
 * time and never rendered, so a failed download left the panel sitting on
 * "Wird geladen…" with no way to tell what had happened.
 */
export function UpdateNotification() {
  const {
    availableUpdate,
    isDownloading,
    isUpdateDownloaded,
    isInstalling,
    downloadProgress,
    lastError,
    downloadUpdate,
    installUpdate,
    dismissUpdate,
    clearError,
  } = useUpdater();

  if (!availableUpdate) return null;

  const notes = parseReleaseNotes(availableUpdate.body, 8);
  const busy = isDownloading || isInstalling;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-4 right-4 z-50 w-[22rem] max-w-[calc(100vw-2rem)] overflow-hidden rounded-lg border bg-popover text-popover-foreground shadow-lg"
    >
      <div className="flex items-center gap-2 border-b px-3 py-2">
        {isUpdateDownloaded ? (
          <Check className="h-4 w-4 shrink-0 text-tone-success" />
        ) : (
          <ArrowUpCircle className="h-4 w-4 shrink-0 text-tone-info" />
        )}
        <h2 className="flex-1 text-xs font-semibold uppercase tracking-wide">
          {isUpdateDownloaded ? 'Update bereit' : 'Update verfügbar'}
        </h2>
        <Button
          variant="ghost"
          size="icon"
          onClick={dismissUpdate}
          aria-label="Hinweis ausblenden"
          className="h-6 w-6"
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>

      <div className="space-y-3 p-3">
        <p className="flex items-baseline gap-1.5 text-sm">
          <span className="font-mono tabular-nums text-muted-foreground">
            {availableUpdate.currentVersion}
          </span>
          <span className="text-muted-foreground">→</span>
          <span className="font-mono font-semibold tabular-nums">{availableUpdate.version}</span>
        </p>

        {notes.length > 0 && (
          <div className="max-h-40 space-y-1 overflow-y-auto pr-1 text-xs">
            {notes.map((block, index) => {
              if (block.kind === 'heading') {
                return (
                  <p
                    key={index}
                    className="pt-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground"
                  >
                    {block.text}
                  </p>
                );
              }
              if (block.kind === 'item') {
                return (
                  <p key={index} className="flex gap-1.5 text-muted-foreground">
                    <span aria-hidden className="text-muted-foreground/60">
                      ·
                    </span>
                    <span className="min-w-0 flex-1">{block.text}</span>
                  </p>
                );
              }
              return (
                <p key={index} className="text-muted-foreground">
                  {block.text}
                </p>
              );
            })}
          </div>
        )}

        {isDownloading && (
          <div className="space-y-1">
            <div className="flex items-baseline justify-between text-[11px]">
              <span className="text-muted-foreground">Wird geladen …</span>
              <span className="font-mono tabular-nums">{downloadProgress}%</span>
            </div>
            <Progress
              value={downloadProgress}
              aria-label="Fortschritt des Downloads"
              className="h-1.5"
            />
          </div>
        )}

        {isUpdateDownloaded && !isInstalling && (
          <p className="rounded-md bg-tone-success-soft px-2 py-1.5 text-[11px] text-tone-success">
            Wird beim nächsten Beenden installiert — oder jetzt.
          </p>
        )}

        {lastError && (
          <div className="space-y-1.5 rounded-md bg-tone-danger-soft px-2 py-1.5">
            <p className="flex items-start gap-1.5 text-[11px] text-tone-danger">
              <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
              <span className="min-w-0 flex-1 break-words">{lastError}</span>
            </p>
            <button
              type="button"
              onClick={clearError}
              className="text-[10px] text-tone-danger underline-offset-2 hover:underline"
            >
              Meldung ausblenden
            </button>
          </div>
        )}

        <div className="flex gap-2">
          {!isUpdateDownloaded && (
            <Button
              size="sm"
              className="flex-1"
              disabled={busy}
              onClick={() => void downloadUpdate()}
            >
              {isDownloading ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Download className="mr-1.5 h-3.5 w-3.5" />
              )}
              {isDownloading ? 'Wird geladen …' : lastError ? 'Erneut versuchen' : 'Herunterladen'}
            </Button>
          )}

          {isUpdateDownloaded && (
            <Button
              size="sm"
              className="flex-1"
              disabled={isInstalling}
              onClick={() => void installUpdate()}
            >
              {isInstalling ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <RotateCw className="mr-1.5 h-3.5 w-3.5" />
              )}
              {isInstalling ? 'Wird installiert …' : 'Neu starten'}
            </Button>
          )}

          {/* Dismissing mid-download would leave it running with nothing on
              screen to say so. */}
          {!busy && (
            <Button variant="outline" size="sm" onClick={dismissUpdate}>
              Später
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
