import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Archive,
  Download,
  ExternalLink,
  FileText,
  Image as ImageIcon,
  Loader2,
  Mail,
  Minus,
  Music,
  Paperclip,
  Plus,
  RotateCw,
  Video,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { apiClient } from '@/lib/api';
import { parseEml, type ParsedEmail } from '@/lib/emlParser';
import { normalizeTicketText, splitQuotedReply } from '@/lib/richText';
import { WindowManager } from '@/lib/windowManager';

interface FilePreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  filename: string;
  ticketId: number;
  onDownload: () => void;
  isDownloading?: boolean;
}

type FileKind =
  | 'image'
  | 'pdf'
  | 'text'
  | 'email'
  | 'video'
  | 'audio'
  | 'archive'
  | 'office'
  | 'unknown';

interface FileKindInfo {
  kind: FileKind;
  icon: typeof FileText;
  label: string;
  previewable: boolean;
}

const EXTENSIONS: Array<[string[], FileKindInfo]> = [
  [
    ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'svg'],
    { kind: 'image', icon: ImageIcon, label: 'Bild', previewable: true },
  ],
  [['pdf'], { kind: 'pdf', icon: FileText, label: 'PDF', previewable: true }],
  // Forwarded mail is common on tickets and is now readable without leaving
  // the app.
  [['eml', 'msg'], { kind: 'email', icon: Mail, label: 'E-Mail', previewable: true }],
  [
    ['txt', 'md', 'json', 'xml', 'csv', 'log'],
    { kind: 'text', icon: FileText, label: 'Text', previewable: true },
  ],
  [['mp4', 'webm', 'mov'], { kind: 'video', icon: Video, label: 'Video', previewable: true }],
  [
    ['mp3', 'wav', 'ogg', 'flac'],
    { kind: 'audio', icon: Music, label: 'Audio', previewable: true },
  ],
  [
    ['zip', 'rar', '7z', 'tar', 'gz'],
    { kind: 'archive', icon: Archive, label: 'Archiv', previewable: false },
  ],
  [
    ['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx'],
    { kind: 'office', icon: FileText, label: 'Dokument', previewable: false },
  ],
];

function kindOf(filename: string): FileKindInfo {
  const extension = filename.split('.').pop()?.toLowerCase() ?? '';
  const match = EXTENSIONS.find(([extensions]) => extensions.includes(extension));
  return match?.[1] ?? { kind: 'unknown', icon: FileText, label: 'Datei', previewable: false };
}

/**
 * Attachment preview.
 *
 * `.msg` is listed alongside `.eml` because Outlook exports both; the parser
 * handles the MIME form, and the Outlook binary form falls back to a clear
 * "could not read" state rather than rendering an empty shell.
 */
export function FilePreviewModal({
  isOpen,
  onClose,
  filename,
  ticketId,
  onDownload,
  isDownloading,
}: FilePreviewModalProps) {
  const info = useMemo(() => kindOf(filename), [filename]);

  const [blob, setBlob] = useState<Blob | null>(null);
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [textContent, setTextContent] = useState<string | null>(null);
  const [email, setEmail] = useState<ParsedEmail | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [zoom, setZoom] = useState(100);
  const [rotation, setRotation] = useState(0);
  const [showQuoted, setShowQuoted] = useState(false);

  useEffect(() => {
    if (!isOpen || !info.previewable) return;

    let url: string | null = null;
    let cancelled = false;

    const load = async () => {
      setIsLoading(true);
      setError(null);
      setZoom(100);
      setRotation(0);
      setShowQuoted(false);

      try {
        const downloaded = await apiClient.downloadAttachment(ticketId, filename);
        if (cancelled) return;
        setBlob(downloaded);

        if (info.kind === 'email') {
          const raw = await downloaded.text();
          if (cancelled) return;
          const parsed = parseEml(raw);
          // A binary .msg yields no headers and no body; say so rather than
          // showing an empty message.
          if (!parsed.subject && !parsed.from && !parsed.body.trim()) {
            setError('Diese Datei konnte nicht als E-Mail gelesen werden.');
          } else {
            setEmail(parsed);
          }
        } else if (info.kind === 'text') {
          const raw = await downloaded.text();
          if (cancelled) return;
          setTextContent(raw);
        } else {
          url = URL.createObjectURL(downloaded);
          setObjectUrl(url);
        }
      } catch (err) {
        console.error('Failed to load attachment:', err);
        if (!cancelled) setError('Die Datei konnte nicht geladen werden.');
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    void load();

    return () => {
      cancelled = true;
      // Revoke the URL this run created, never one from a previous render.
      if (url) URL.revokeObjectURL(url);
      setObjectUrl(null);
      setTextContent(null);
      setEmail(null);
      setBlob(null);
    };
  }, [isOpen, info.previewable, info.kind, ticketId, filename]);

  const openExternally = useCallback(async () => {
    if (!blob) return;
    try {
      await WindowManager.openFileExternally(filename, blob);
      onClose();
    } catch (err) {
      console.error('Failed to open file externally:', err);
    }
  }, [blob, filename, onClose]);

  const Icon = info.icon;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="flex h-[85vh] max-w-5xl flex-col gap-0 overflow-hidden p-0">
        <div className="flex items-center gap-2 border-b px-3 py-2">
          <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
          <div className="min-w-0 flex-1">
            <DialogTitle className="truncate text-sm font-medium">{filename}</DialogTitle>
          </div>
          <Badge variant="outline" className="shrink-0 text-[10px]">
            {info.label}
          </Badge>

          {info.kind === 'image' && objectUrl && (
            <div className="flex shrink-0 items-center gap-0.5">
              <IconButton label="Verkleinern" onClick={() => setZoom((z) => Math.max(25, z - 25))}>
                <Minus className="h-3.5 w-3.5" />
              </IconButton>
              <span className="w-10 text-center font-mono text-[11px] tabular-nums text-muted-foreground">
                {zoom}%
              </span>
              <IconButton label="Vergrößern" onClick={() => setZoom((z) => Math.min(400, z + 25))}>
                <Plus className="h-3.5 w-3.5" />
              </IconButton>
              <IconButton label="Drehen" onClick={() => setRotation((r) => (r + 90) % 360)}>
                <RotateCw className="h-3.5 w-3.5" />
              </IconButton>
            </div>
          )}

          {blob && (
            <IconButton label="Extern öffnen" onClick={() => void openExternally()}>
              <ExternalLink className="h-3.5 w-3.5" />
            </IconButton>
          )}
          <IconButton label="Herunterladen" onClick={onDownload} disabled={isDownloading}>
            {isDownloading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Download className="h-3.5 w-3.5" />
            )}
          </IconButton>
        </div>

        <div className="min-h-0 flex-1 overflow-auto bg-muted/30">
          {isLoading ? (
            <Centered>
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              <p className="text-xs text-muted-foreground">Wird geladen…</p>
            </Centered>
          ) : error ? (
            <Centered>
              <Icon className="h-10 w-10 text-muted-foreground" />
              <p className="text-sm">{error}</p>
              <Button variant="outline" size="sm" onClick={onDownload} className="gap-1.5">
                <Download className="h-3.5 w-3.5" />
                Herunterladen
              </Button>
            </Centered>
          ) : !info.previewable ? (
            <Centered>
              <Icon className="h-10 w-10 text-muted-foreground" />
              <div className="space-y-1">
                <p className="text-sm font-medium">Keine Vorschau für {info.label}</p>
                <p className="text-xs text-muted-foreground">
                  Die Datei kann heruntergeladen oder extern geöffnet werden.
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={onDownload} className="gap-1.5">
                <Download className="h-3.5 w-3.5" />
                Herunterladen
              </Button>
            </Centered>
          ) : email ? (
            <EmailView email={email} showQuoted={showQuoted} onToggleQuoted={setShowQuoted} />
          ) : textContent !== null ? (
            <pre className="whitespace-pre-wrap break-words p-4 font-mono text-xs leading-relaxed">
              {textContent}
            </pre>
          ) : objectUrl && info.kind === 'image' ? (
            <div className="flex min-h-full items-center justify-center p-4">
              <img
                src={objectUrl}
                alt={filename}
                style={{ transform: `scale(${zoom / 100}) rotate(${rotation}deg)` }}
                className="max-h-full max-w-full object-contain transition-transform"
              />
            </div>
          ) : objectUrl && info.kind === 'pdf' ? (
            <iframe src={objectUrl} title={filename} className="h-full w-full border-0" />
          ) : objectUrl && info.kind === 'video' ? (
            <div className="flex min-h-full items-center justify-center p-4">
              <video src={objectUrl} controls className="max-h-full max-w-full" />
            </div>
          ) : objectUrl && info.kind === 'audio' ? (
            <Centered>
              <Music className="h-10 w-10 text-muted-foreground" />
              <audio src={objectUrl} controls className="w-80" />
            </Centered>
          ) : (
            <Centered>
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </Centered>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Renders a parsed .eml the way a mail client would. */
function EmailView({
  email,
  showQuoted,
  onToggleQuoted,
}: {
  email: ParsedEmail;
  showQuoted: boolean;
  onToggleQuoted: (open: boolean) => void;
}) {
  const { body, quoted } = splitQuotedReply(normalizeTicketText(email.body));
  const sent = email.date ? new Date(email.date) : null;
  const sentValid = sent !== null && !Number.isNaN(sent.getTime());

  return (
    <div className="mx-auto max-w-3xl space-y-4 bg-background p-5">
      <div className="space-y-2 border-b pb-3">
        <h2 className="text-base font-semibold leading-snug">
          {email.subject || '(Kein Betreff)'}
        </h2>
        <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-xs">
          <Field label="Von" value={email.from} />
          <Field label="An" value={email.to} />
          {email.cc && <Field label="Cc" value={email.cc} />}
          {sentValid && <Field label="Datum" value={sent.toLocaleString()} />}
        </dl>
      </div>

      {email.bodyFromHtml && (
        <p className="rounded bg-muted px-2 py-1 text-[11px] text-muted-foreground">
          Diese Nachricht enthielt nur HTML — die Formatierung wurde entfernt.
        </p>
      )}

      <p className="whitespace-pre-wrap text-sm leading-relaxed">{body || '(Kein Inhalt)'}</p>

      {quoted && (
        <div className="space-y-2">
          <button
            type="button"
            onClick={() => onToggleQuoted(!showQuoted)}
            className="text-[11px] text-muted-foreground underline-offset-2 hover:underline"
          >
            {showQuoted ? 'Zitierten Verlauf ausblenden' : 'Zitierten Verlauf anzeigen'}
          </button>
          {showQuoted && (
            <p className="whitespace-pre-wrap border-l-2 pl-3 text-xs leading-relaxed text-muted-foreground">
              {quoted}
            </p>
          )}
        </div>
      )}

      {email.attachments.length > 0 && (
        <div className="space-y-1.5 border-t pt-3">
          <p className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-muted-foreground">
            <Paperclip className="h-3 w-3" />
            {email.attachments.length} {email.attachments.length === 1 ? 'Anhang' : 'Anhänge'}
          </p>
          <ul className="space-y-1">
            {email.attachments.map((attachment) => (
              <li
                key={attachment.filename}
                className="flex items-center gap-2 rounded border px-2 py-1.5 text-xs"
              >
                <Paperclip className="h-3 w-3 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate">{attachment.filename}</span>
                <span className="shrink-0 font-mono text-[10px] tabular-nums text-muted-foreground">
                  {formatBytes(attachment.size)}
                </span>
              </li>
            ))}
          </ul>
          {/* Extracting these would mean decoding arbitrary binaries out of the
              MIME tree; opening the .eml externally is the honest route until
              that is worth building. */}
          <p className="text-[10px] text-muted-foreground">
            Zum Öffnen der Anhänge die E-Mail extern öffnen.
          </p>
        </div>
      )}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  if (!value) return null;
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="break-words">{value}</dd>
    </>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-full flex-col items-center justify-center gap-3 p-8 text-center">
      {children}
    </div>
  );
}

function IconButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="h-7 w-7 shrink-0"
    >
      {children}
    </Button>
  );
}

function formatBytes(bytes: number): string {
  if (bytes <= 0) return '—';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  return `${(bytes / 1024 ** i).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}
