import { useRef, useState } from 'react';
import { toast } from 'sonner';

import { FilePreviewModal } from '@/components/ui/FilePreviewModal';

/** What the picker offers, and what we accept from it. */
const ACCEPT = '.eml,.msg,message/rfc822,application/vnd.ms-outlook';

/**
 * Refuse anything implausible before reading it.
 *
 * A mislabelled 200 MB file would otherwise be read into memory in full before
 * the parser could reject it.
 */
const MAX_BYTES = 25 * 1024 * 1024;

/**
 * Opens an .eml from disk in the app's mail viewer.
 *
 * Deliberately a file input rather than a drag-and-drop target. Tauri's
 * webview is scoped to `$TEMP` for filesystem reads, so reading a file dropped
 * from Downloads or the desktop would need that scope widened; a picked file
 * is handed to the webview directly and needs no filesystem permission at all.
 *
 * `render` receives the opener so the trigger can look like whatever suits the
 * place it sits in.
 */
export function OpenEmlFile({
  render,
}: {
  render: (open: () => void) => React.ReactNode;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<{ blob: Blob; name: string } | null>(null);

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const picked = event.target.files?.[0];
    // Reset immediately so picking the same file twice still fires a change.
    event.target.value = '';

    if (!picked) return;

    if (picked.size > MAX_BYTES) {
      toast.error('Datei ist zu groß', {
        description: 'E-Mails über 25 MB werden nicht geöffnet.',
      });
      return;
    }

    setFile({ blob: picked, name: picked.name });
  };

  return (
    <>
      {render(() => inputRef.current?.click())}

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        onChange={handleChange}
        className="hidden"
        aria-hidden
        tabIndex={-1}
      />

      {file && (
        <FilePreviewModal
          isOpen
          onClose={() => setFile(null)}
          filename={file.name}
          file={file.blob}
        />
      )}
    </>
  );
}
