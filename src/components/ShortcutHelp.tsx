import { useState } from 'react';
import { Keyboard } from 'lucide-react';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useHotkey } from '@/hooks/useHotkey';
import { formatHotkey, SHORTCUT_HELP } from '@/lib/hotkeys';

/**
 * The shortcut list, on `?`.
 *
 * A shortcut nobody knows about is not a feature, and this app has no menu bar
 * to hang them off. `?` is the convention.
 */
export function ShortcutHelp() {
  const [open, setOpen] = useState(false);

  useHotkey('?', () => setOpen((current) => !current));
  // Reachable from inside the dialog too, so the same key closes it.
  useHotkey('escape', () => setOpen(false), { enabled: open, whenOverlayOpen: true });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Keyboard className="h-4 w-4" />
            Tastenkürzel
          </DialogTitle>
          <DialogDescription>Mit ? jederzeit ein- und ausblenden.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {SHORTCUT_HELP.map((section) => (
            <div key={section.group} className="space-y-1.5">
              <h3 className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                {section.group}
              </h3>
              <dl className="space-y-1">
                {section.items.map(([hotkey, label]) => (
                  <div key={`${section.group}-${hotkey}-${label}`} className="flex items-baseline justify-between gap-4">
                    <dt className="text-sm">{label}</dt>
                    <dd>
                      <kbd className="rounded border bg-muted px-1.5 py-0.5 font-mono text-[11px]">
                        {formatHotkey(hotkey)}
                      </kbd>
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
