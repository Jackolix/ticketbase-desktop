import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { Minus, Square, Copy, X } from 'lucide-react';

interface TitlebarProps {
  title: string;
  /** Rendered on the right of the drag area, before the window controls. */
  children?: ReactNode;
}

/**
 * Custom window titlebar.
 *
 * The windows are built with `decorations: false`, so this replaces the OS
 * frame. The bar itself is the drag region — Tauri's `data-tauri-drag-region`
 * also handles double-click-to-maximise, so that behaviour comes for free.
 *
 * Controls sit on the left on macOS and on the right elsewhere, matching each
 * platform's convention. macOS is detected from the user agent rather than the
 * OS plugin, to avoid pulling in a dependency for one boolean.
 */
export function Titlebar({ title, children }: TitlebarProps) {
  const [isMaximized, setIsMaximized] = useState(false);
  const [isMac] = useState(() => /Mac|iPhone|iPad/.test(navigator.userAgent));

  useEffect(() => {
    const appWindow = getCurrentWindow();
    let unlisten: (() => void) | undefined;
    let disposed = false;

    const sync = async () => {
      try {
        setIsMaximized(await appWindow.isMaximized());
      } catch {
        // Not fatal: the icon just keeps its previous shape.
      }
    };

    void sync();

    // The window can be maximised by snapping or a double-click on the drag
    // region, neither of which goes through the buttons below.
    void appWindow.onResized(() => void sync()).then((off) => {
      if (disposed) off();
      else unlisten = off;
    });

    return () => {
      disposed = true;
      if (unlisten) unlisten();
    };
  }, []);

  const minimize = useCallback(() => {
    void getCurrentWindow().minimize().catch(console.error);
  }, []);

  const toggleMaximize = useCallback(() => {
    const appWindow = getCurrentWindow();
    void appWindow
      .isMaximized()
      .then((maximized) => (maximized ? appWindow.unmaximize() : appWindow.maximize()))
      .catch(console.error);
  }, []);

  const close = useCallback(() => {
    void getCurrentWindow().close().catch(console.error);
  }, []);

  const controls = (
    <div className={`flex items-center ${isMac ? 'order-first pl-2' : 'pr-1'}`}>
      <TitlebarButton onClick={minimize} label="Minimise">
        <Minus className="h-3.5 w-3.5" />
      </TitlebarButton>
      <TitlebarButton onClick={toggleMaximize} label={isMaximized ? 'Restore' : 'Maximise'}>
        {isMaximized ? <Copy className="h-3 w-3 -scale-x-100" /> : <Square className="h-3 w-3" />}
      </TitlebarButton>
      <TitlebarButton onClick={close} label="Close" danger>
        <X className="h-3.5 w-3.5" />
      </TitlebarButton>
    </div>
  );

  return (
    <div
      data-tauri-drag-region
      className="flex h-9 shrink-0 select-none items-center gap-2 border-b bg-sidebar pl-3 text-sidebar-foreground"
    >
      {isMac && controls}

      {/* The label is inert so it never swallows a drag. */}
      <span data-tauri-drag-region className="pointer-events-none text-xs font-medium">
        {title}
      </span>

      <div data-tauri-drag-region className="flex-1" />

      {children}
      {!isMac && controls}
    </div>
  );
}

function TitlebarButton({
  onClick,
  label,
  danger,
  children,
}: {
  onClick: () => void;
  label: string;
  danger?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={[
        'inline-flex h-9 w-11 items-center justify-center transition-colors',
        'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
        danger
          ? 'hover:bg-destructive hover:text-destructive-foreground'
          : 'hover:bg-sidebar-accent',
      ].join(' ')}
    >
      {children}
    </button>
  );
}
