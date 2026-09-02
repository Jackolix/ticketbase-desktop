import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  AlertCircle,
  ArrowLeft,
  Building,
  Calendar,
  CheckCircle2,
  Circle,
  Clock,
  Download,
  ExternalLink,
  Eye,
  FileText,
  History,
  ListTodo,
  Loader2,
  MessageSquare,
  Paperclip,
  Phone,
  Plus,
  User,
  UserPlus,
  X,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { FilePreviewModal } from '@/components/ui/FilePreviewModal';
import { useAuth } from '@/contexts/AuthContext';
import { apiClient } from '@/lib/api';
import { syncRefresh } from '@/lib/sync';
import { parseTicketDate } from '@/lib/ticketDate';
import { parseTemplateData } from '@/lib/templateData';
import { TICKET_STATUS_OPTIONS } from '@/lib/ticketStatusOptions';
import { TONE_BADGE, priorityLabel, priorityTone, statusTone } from '@/lib/ticketStatus';
import { WindowManager } from '@/lib/windowManager';
import { Ticket, TicketHistory, TodoItem } from '@/types/api';
import { TemplateFields } from './TemplateFields';
import { TicketMessages } from './TicketMessages';
import { TicketPlayerControls } from './TicketPlayerControls';

interface TicketDetailProps {
  ticket: Ticket;
  onBack: () => void;
  /**
   * `embedded` renders inside the main window: a back arrow, and a button to
   * pop the ticket out. `window` renders as its own window: a close button, and
   * no pop-out, since it already is one.
   */
  variant?: 'embedded' | 'window';
}

/**
 * Ticket detail.
 *
 * The content of the ticket — its description or its template fields — leads,
 * rather than sitting behind a "Details" tab alongside the history. Everything
 * a technician needs to identify the ticket sits in a sidebar, and the tabs
 * hold only the things they act on: history, tasks and messages.
 */
export function TicketDetail({ ticket, onBack, variant = 'embedded' }: TicketDetailProps) {
  const { user } = useAuth();

  const [history, setHistory] = useState<TicketHistory[]>([]);
  const [todos, setTodos] = useState<TodoItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [newTodo, setNewTodo] = useState('');
  const [isAddingTodo, setIsAddingTodo] = useState(false);

  const [entryText, setEntryText] = useState('');
  const [entryStatus, setEntryStatus] = useState('3');
  const [entryMinutes, setEntryMinutes] = useState('');
  const [isSavingEntry, setIsSavingEntry] = useState(false);

  const [downloading, setDownloading] = useState<Set<string>>(new Set());
  const [previewFile, setPreviewFile] = useState<string | null>(null);
  const [isClaiming, setIsClaiming] = useState(false);

  const templateFields = parseTemplateData(ticket.template_data);
  const hasDescription = Boolean(ticket.description?.trim());

  const fetchHistory = useCallback(async () => {
    try {
      const response = await apiClient.getTicketData(ticket.id);
      if (response.status === 'success' && response.ticket_data) {
        setHistory(response.ticket_data);
        setLoadError(null);
      }
    } catch (error) {
      console.error('Failed to fetch ticket history:', error);
      setLoadError('Der Verlauf konnte nicht geladen werden.');
    } finally {
      setIsLoading(false);
    }
  }, [ticket.id]);

  const fetchTodos = useCallback(async () => {
    try {
      const response = await apiClient.getCheckList(ticket.id);
      if (response.status === 'success' && response.check_list) {
        setTodos(response.check_list);
      }
    } catch (error) {
      console.error('Failed to fetch tasks:', error);
    }
  }, [ticket.id]);

  useEffect(() => {
    setIsLoading(true);
    void fetchHistory();
    void fetchTodos();
  }, [fetchHistory, fetchTodos]);

  /**
   * Claims an unassigned ticket. Server-side this sets my_ticket_id, moves the
   * ticket to "Zugewiesen" and pushes a notification; it refuses if someone
   * already has a timer running on it.
   */
  const handleClaim = async () => {
    if (!user) return;
    setIsClaiming(true);
    try {
      const response = await apiClient.ticketTerminieren(
        ticket.id,
        user.id,
        new Date().toISOString().slice(0, 10),
      );
      if (response.result === 'success') {
        toast.success(`Ticket #${ticket.id} übernommen`);
        await syncRefresh();
      } else {
        toast.error('Ticket konnte nicht übernommen werden', {
          description: response.message || 'Es ist möglicherweise bereits vergeben.',
        });
      }
    } catch (error) {
      console.error('Failed to claim ticket:', error);
      toast.error('Ticket konnte nicht übernommen werden');
    } finally {
      setIsClaiming(false);
    }
  };

  const handleAddTodo = async () => {
    if (!user || !newTodo.trim()) return;
    setIsAddingTodo(true);
    try {
      const response = await apiClient.newTodo(ticket.id, user.id, newTodo);
      // The backend spells this "sucess"; accept both rather than depend on it.
      if (response.status === 'sucess' || response.status === 'success') {
        if (response.check_list) setTodos(response.check_list);
        setNewTodo('');
      } else {
        toast.error('Aufgabe konnte nicht angelegt werden');
      }
    } catch (error) {
      console.error('Failed to add task:', error);
      toast.error('Aufgabe konnte nicht angelegt werden');
    } finally {
      setIsAddingTodo(false);
    }
  };

  const handleToggleTodo = async (todoId: number, checked: number) => {
    const next = checked ? 0 : 1;
    setTodos((list) => list.map((t) => (t.id === todoId ? { ...t, checked: next } : t)));

    try {
      const response = await apiClient.checkTodo(todoId, next);
      if (response.status !== 'success') throw new Error(response.message);
    } catch (error) {
      console.error('Failed to toggle task:', error);
      setTodos((list) => list.map((t) => (t.id === todoId ? { ...t, checked } : t)));
      toast.error('Aufgabe konnte nicht geändert werden');
    }
  };

  const handleSaveEntry = async () => {
    if (!user || !entryText.trim()) return;
    setIsSavingEntry(true);
    try {
      const minutes = parseInt(entryMinutes, 10) || 0;
      if (minutes > 0) {
        await apiClient.correctWatch({
          ticket_id: ticket.id,
          user_id: user.id,
          old_time: 0,
          new_time: minutes,
        });
      }

      const response = await apiClient.saveTicketHistory({
        ticket_id: ticket.id,
        user_id: user.id,
        verlauf_text: entryText,
        status_id: parseInt(entryStatus, 10),
        sendMail: 0,
      });

      if (response.status === 'success') {
        setEntryText('');
        setEntryMinutes('');
        toast.success('Eintrag gespeichert');
        await fetchHistory();
        await syncRefresh();
      } else {
        toast.error('Eintrag konnte nicht gespeichert werden', {
          description: response.message,
        });
      }
    } catch (error) {
      console.error('Failed to save history entry:', error);
      toast.error('Eintrag konnte nicht gespeichert werden');
    } finally {
      setIsSavingEntry(false);
    }
  };

  const handleDownload = async (filename: string) => {
    setDownloading((s) => new Set(s).add(filename));
    try {
      const blob = await apiClient.downloadAttachment(ticket.id, filename);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Failed to download attachment:', error);
      toast.error(`"${filename}" konnte nicht geladen werden`);
    } finally {
      setDownloading((s) => {
        const next = new Set(s);
        next.delete(filename);
        return next;
      });
    }
  };

  const openTicketWindow = async () => {
    try {
      await WindowManager.openTicketInNewWindow(ticket);
    } catch (error) {
      console.error('Failed to open ticket in new window:', error);
    }
  };

  const openTodos = todos.filter((t) => !t.checked).length;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start gap-3">
        {variant === 'embedded' && (
          <Button
            variant="outline"
            size="icon"
            onClick={onBack}
            aria-label="Zurück"
            className="mt-0.5 h-8 w-8 shrink-0"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
        )}

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="font-mono text-xs tabular-nums text-muted-foreground">
              #{ticket.id}
            </span>
            <Badge
              variant="outline"
              className={`${TONE_BADGE[statusTone(ticket.status)]} px-1.5 py-0 text-[10px]`}
            >
              {ticket.status || '—'}
            </Badge>
            <Badge
              variant="outline"
              className={`${TONE_BADGE[priorityTone(ticket.priority, ticket.index)]} px-1.5 py-0 text-[10px]`}
            >
              {priorityLabel(ticket.priority)}
            </Badge>
            {ticket.pool_name && (
              <span className="text-[11px] text-muted-foreground">{ticket.pool_name}</span>
            )}
          </div>
          <h1 className="mt-1 text-lg font-semibold leading-snug">{ticket.summary || '—'}</h1>
          {ticket.subject && (
            <p className="text-sm text-muted-foreground">{ticket.subject}</p>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {ticket.my_ticket_id === 0 && (
            <Button onClick={handleClaim} disabled={isClaiming} size="sm" className="h-8 gap-1.5">
              {isClaiming ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <UserPlus className="h-3.5 w-3.5" />
              )}
              Übernehmen
            </Button>
          )}
          {variant === 'embedded' ? (
            <Button
              variant="outline"
              size="icon"
              onClick={openTicketWindow}
              aria-label="In neuem Fenster öffnen"
              className="h-8 w-8"
            >
              <ExternalLink className="h-4 w-4" />
            </Button>
          ) : (
            <Button
              variant="ghost"
              size="icon"
              onClick={onBack}
              aria-label="Fenster schließen"
              className="h-8 w-8 text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
        {/* Main column */}
        <div className="min-w-0 space-y-4">
          {/* The ticket's actual content, not hidden behind a tab. */}
          <Card className="py-0">
            <div className="flex items-center gap-1.5 border-b px-3 py-2">
              <FileText className="h-3.5 w-3.5 text-muted-foreground" />
              <h2 className="text-xs font-semibold uppercase tracking-wide">
                {templateFields.length > 0 && !hasDescription ? 'Formular' : 'Beschreibung'}
              </h2>
            </div>
            <CardContent className="space-y-4 p-3">
              {hasDescription && (
                <p className="whitespace-pre-wrap text-sm leading-relaxed">{ticket.description}</p>
              )}

              {templateFields.length > 0 && (
                <>
                  {hasDescription && <div className="border-t pt-3" />}
                  <TemplateFields templateData={ticket.template_data} />
                </>
              )}

              {!hasDescription && templateFields.length === 0 && (
                <p className="text-sm italic text-muted-foreground">
                  Keine Beschreibung vorhanden
                </p>
              )}
            </CardContent>
          </Card>

          {ticket.attachments.length > 0 && (
            <Card className="py-0">
              <div className="flex items-center gap-1.5 border-b px-3 py-2">
                <Paperclip className="h-3.5 w-3.5 text-muted-foreground" />
                <h2 className="text-xs font-semibold uppercase tracking-wide">Anhänge</h2>
                <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
                  {ticket.attachments.length}
                </span>
              </div>
              <ul className="divide-y">
                {ticket.attachments.map((filename) => (
                  <li key={filename} className="flex items-center gap-2 px-3 py-2">
                    <Paperclip className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <button
                      type="button"
                      onClick={() => setPreviewFile(filename)}
                      className="min-w-0 flex-1 truncate text-left text-xs hover:underline"
                    >
                      {filename}
                    </button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={() => setPreviewFile(filename)}
                      aria-label={`${filename} ansehen`}
                    >
                      <Eye className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={() => void handleDownload(filename)}
                      disabled={downloading.has(filename)}
                      aria-label={`${filename} herunterladen`}
                    >
                      {downloading.has(filename) ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Download className="h-3.5 w-3.5" />
                      )}
                    </Button>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          <Tabs defaultValue="history">
            <TabsList>
              <TabsTrigger value="history" className="gap-1.5 text-xs">
                <History className="h-3.5 w-3.5" /> Verlauf
                {history.length > 0 && (
                  <span className="font-mono text-[10px] tabular-nums opacity-70">
                    {history.length}
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger value="todos" className="gap-1.5 text-xs">
                <ListTodo className="h-3.5 w-3.5" /> Aufgaben
                {openTodos > 0 && (
                  <span className="font-mono text-[10px] tabular-nums opacity-70">{openTodos}</span>
                )}
              </TabsTrigger>
              <TabsTrigger value="messages" className="gap-1.5 text-xs">
                <MessageSquare className="h-3.5 w-3.5" /> Nachrichten
                {ticket.ticketMessagesCount > 0 && (
                  <span className="font-mono text-[10px] tabular-nums opacity-70">
                    {ticket.ticketMessagesCount}
                  </span>
                )}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="history" className="mt-3 space-y-3">
              <Card className="py-0">
                <div className="border-b px-3 py-2">
                  <h2 className="text-xs font-semibold uppercase tracking-wide">Eintrag hinzufügen</h2>
                </div>
                <CardContent className="space-y-3 p-3">
                  <Textarea
                    value={entryText}
                    onChange={(e) => setEntryText(e.target.value)}
                    placeholder="Was wurde gemacht?"
                    rows={3}
                    className="text-sm"
                  />
                  <div className="flex flex-wrap items-end gap-2">
                    <div className="space-y-1">
                      <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">
                        Status
                      </Label>
                      <Select value={entryStatus} onValueChange={setEntryStatus}>
                        <SelectTrigger className="h-8 w-[220px] text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {TICKET_STATUS_OPTIONS.map((option) => (
                            <SelectItem key={option.id} value={option.id} className="text-xs">
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">
                        Zeit (Min.)
                      </Label>
                      <Input
                        type="number"
                        min="0"
                        value={entryMinutes}
                        onChange={(e) => setEntryMinutes(e.target.value)}
                        placeholder="0"
                        className="h-8 w-[100px] text-xs"
                      />
                    </div>
                    <Button
                      onClick={handleSaveEntry}
                      disabled={isSavingEntry || !entryText.trim()}
                      size="sm"
                      className="ml-auto h-8 gap-1.5 text-xs"
                    >
                      {isSavingEntry && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                      Speichern
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {isLoading ? (
                <div className="space-y-2">
                  {Array.from({ length: 3 }, (_, i) => (
                    <Card key={i} className="animate-pulse py-0">
                      <CardContent className="space-y-2 p-3">
                        <div className="h-3 w-1/4 rounded bg-muted" />
                        <div className="h-3 w-3/4 rounded bg-muted" />
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : history.length === 0 ? (
                // A failed load and an empty history used to look identical.
                <Card className={loadError ? 'border-destructive/40 py-0' : 'py-0'}>
                  <CardContent className="space-y-3 p-8 text-center">
                    {loadError ? (
                      <>
                        <AlertCircle className="mx-auto h-8 w-8 text-destructive" />
                        <p className="text-xs text-muted-foreground">{loadError}</p>
                        <Button variant="outline" size="sm" onClick={() => void fetchHistory()}>
                          Erneut versuchen
                        </Button>
                      </>
                    ) : (
                      <>
                        <History className="mx-auto h-8 w-8 text-muted-foreground" />
                        <p className="text-xs text-muted-foreground">Noch keine Einträge</p>
                      </>
                    )}
                  </CardContent>
                </Card>
              ) : (
                <ol className="space-y-2">
                  {history.map((entry) => (
                    <li key={entry.id}>
                      <Card className="py-0">
                        <CardContent className="space-y-1.5 p-3">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex items-center gap-1.5">
                              <User className="h-3 w-3 text-muted-foreground" />
                              <span className="text-xs font-medium">{entry.user?.name || '—'}</span>
                              {entry.status_name && (
                                <Badge
                                  variant="outline"
                                  className={`${TONE_BADGE[statusTone(entry.status_name)]} px-1.5 py-0 text-[10px]`}
                                >
                                  {entry.status_name}
                                </Badge>
                              )}
                            </div>
                            <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
                              {formatDate(entry.created_at)}
                            </span>
                          </div>

                          {entry.technician_reply && (
                            <p className="whitespace-pre-wrap text-sm leading-relaxed">
                              {toPlainText(entry.technician_reply)}
                            </p>
                          )}

                          {entry.total_time > 0 && (
                            <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
                              <Clock className="h-3 w-3" />
                              {Math.floor(entry.total_time / 60)} Min.
                            </p>
                          )}
                        </CardContent>
                      </Card>
                    </li>
                  ))}
                </ol>
              )}
            </TabsContent>

            <TabsContent value="todos" className="mt-3 space-y-3">
              <Card className="py-0">
                <CardContent className="p-3">
                  <div className="flex gap-2">
                    <Input
                      value={newTodo}
                      onChange={(e) => setNewTodo(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleAddTodo()}
                      placeholder="Neue Aufgabe…"
                      disabled={isAddingTodo}
                      className="h-8 text-xs"
                    />
                    <Button
                      onClick={handleAddTodo}
                      disabled={isAddingTodo || !newTodo.trim()}
                      size="icon"
                      className="h-8 w-8 shrink-0"
                      aria-label="Aufgabe hinzufügen"
                    >
                      {isAddingTodo ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Plus className="h-3.5 w-3.5" />
                      )}
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {todos.length === 0 ? (
                <Card className="py-0">
                  <CardContent className="p-8 text-center">
                    <ListTodo className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
                    <p className="text-xs text-muted-foreground">Keine Aufgaben</p>
                  </CardContent>
                </Card>
              ) : (
                <Card className="py-0">
                  <ul className="divide-y">
                    {todos.map((todo) => (
                      <li key={todo.id}>
                        <button
                          type="button"
                          onClick={() => void handleToggleTodo(todo.id, todo.checked)}
                          className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-accent/50"
                        >
                          {todo.checked ? (
                            <CheckCircle2 className="h-4 w-4 shrink-0 text-tone-success" />
                          ) : (
                            <Circle className="h-4 w-4 shrink-0 text-muted-foreground" />
                          )}
                          <span
                            className={[
                              'flex-1 text-xs',
                              todo.checked ? 'text-muted-foreground line-through' : '',
                            ].join(' ')}
                          >
                            {todo.to_do}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </Card>
              )}
            </TabsContent>

            <TabsContent value="messages" className="mt-3">
              <TicketMessages ticketId={ticket.id} />
            </TabsContent>
          </Tabs>
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          <TicketPlayerControls ticket={ticket} />

          <Card className="py-0">
            <div className="flex items-center gap-1.5 border-b px-3 py-2">
              <Building className="h-3.5 w-3.5 text-muted-foreground" />
              <h2 className="text-xs font-semibold uppercase tracking-wide">Kunde</h2>
            </div>
            <CardContent className="space-y-2 p-3">
              <p className="text-sm font-medium">{ticket.company?.name || '—'}</p>
              {ticket.company?.number && (
                <p className="font-mono text-[11px] text-muted-foreground">
                  {ticket.company.number}
                </p>
              )}
              {ticket.ticketUser && (
                <Meta icon={User} label="Ansprechpartner" value={ticket.ticketUser} />
              )}
              {ticket.ticketUserPhone && (
                <Meta icon={Phone} label="Telefon" value={ticket.ticketUserPhone} mono />
              )}
            </CardContent>
          </Card>

          <Card className="py-0">
            <div className="flex items-center gap-1.5 border-b px-3 py-2">
              <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
              <h2 className="text-xs font-semibold uppercase tracking-wide">Details</h2>
            </div>
            <CardContent className="space-y-2 p-3">
              <Meta icon={Calendar} label="Erstellt" value={formatDate(ticket.created_at)} mono />
              {ticket.ticket_start && (
                <Meta icon={Clock} label="Terminiert" value={formatDate(ticket.ticket_start)} mono />
              )}
              {ticket.ticketCreator && (
                <Meta icon={User} label="Ersteller" value={ticket.ticketCreator} />
              )}
              {ticket.ticketTerminatedUser && (
                <Meta icon={UserPlus} label="Zugewiesen" value={ticket.ticketTerminatedUser} />
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {previewFile && (
        <FilePreviewModal
          isOpen={Boolean(previewFile)}
          onClose={() => setPreviewFile(null)}
          filename={previewFile}
          ticketId={ticket.id}
          onDownload={() => void handleDownload(previewFile)}
          isDownloading={downloading.has(previewFile)}
        />
      )}
    </div>
  );
}

function Meta({
  icon: Icon,
  label,
  value,
  mono,
}: {
  icon: typeof User;
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-start gap-2">
      <Icon className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground" />
      <div className="min-w-0">
        <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className={`break-words text-xs ${mono ? 'font-mono tabular-nums' : ''}`}>{value}</p>
      </div>
    </div>
  );
}

function formatDate(value: string): string {
  if (!value) return '—';
  const parsed = parseTicketDate(value);
  return parsed ? parsed.toLocaleString(undefined, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }) : value;
}

/**
 * History entries are HTML from the web editor. Rendering them as text keeps
 * untrusted markup out of the app; the trade-off is losing formatting, which is
 * preferable to injecting it.
 */
function toPlainText(html: string): string {
  const el = document.createElement('div');
  el.innerHTML = html;
  return (el.textContent || el.innerText || '').trim();
}
