import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth } from '@/contexts/AuthContext';
import { apiClient } from '@/lib/api';
import { Ticket, TicketHistory, TodoItem } from '@/types/api';
import { TicketPlayerControls } from './TicketPlayerControls';
import { 
  ArrowLeft,
  Calendar,
  Building,
  User,
  Phone,
  Clock,
  Paperclip,
  CheckCircle,
  Circle,
  Plus,
  MessageSquare,
  Download,
  Loader2
} from 'lucide-react';

interface TicketDetailProps {
  ticket: Ticket;
  onBack: () => void;
}

export function TicketDetail({ ticket, onBack }: TicketDetailProps) {
  const { user } = useAuth();
  const [ticketHistory, setTicketHistory] = useState<TicketHistory[]>([]);
  const [todos, setTodos] = useState<TodoItem[]>([]);
  const [newTodo, setNewTodo] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isAddingTodo, setIsAddingTodo] = useState(false);
  const [newHistoryText, setNewHistoryText] = useState('');
  const [newHistoryStatus, setNewHistoryStatus] = useState('3'); // Default to "In Progress"
  const [isAddingHistory, setIsAddingHistory] = useState(false);
  const [downloadingFiles, setDownloadingFiles] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetchTicketData();
    fetchTodos();
  }, [ticket.id]);

  const fetchTicketData = async () => {
    try {
      const response = await apiClient.getTicketData(ticket.id);
      if (response.status === 'success' && response.ticket_data) {
        setTicketHistory(response.ticket_data);
      }
    } catch (error) {
      console.error('Failed to fetch ticket data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchTodos = async () => {
    try {
      const response = await apiClient.getCheckList(ticket.id);
      if (response.status === 'success' && response.check_list) {
        setTodos(response.check_list);
      }
    } catch (error) {
      console.error('Failed to fetch todos:', error);
    }
  };

  const handleAddTodo = async () => {
    if (!user || !newTodo.trim()) return;

    setIsAddingTodo(true);
    try {
      const response = await apiClient.newTodo(ticket.id, user.id, newTodo);
      if (response.status === 'sucess' && response.check_list) {
        setTodos(response.check_list);
        setNewTodo('');
      }
    } catch (error) {
      console.error('Failed to add todo:', error);
    } finally {
      setIsAddingTodo(false);
    }
  };

  const handleToggleTodo = async (todoId: number, checked: number) => {
    try {
      const response = await apiClient.checkTodo(todoId, checked ? 0 : 1);
      if (response.status === 'success') {
        setTodos(todos.map(todo => 
          todo.id === todoId ? { ...todo, checked: checked ? 0 : 1 } : todo
        ));
      }
    } catch (error) {
      console.error('Failed to toggle todo:', error);
    }
  };

  const handleAddHistory = async () => {
    if (!user || !newHistoryText.trim()) return;

    setIsAddingHistory(true);
    try {
      const response = await apiClient.saveTicketHistory({
        ticket_id: ticket.id,
        user_id: user.id,
        verlauf_text: newHistoryText,
        status_id: parseInt(newHistoryStatus),
        sendMail: 0, // Don't send email by default
      });

      if (response.status === 'success') {
        setNewHistoryText('');
        // Refresh ticket history
        await fetchTicketData();
      }
    } catch (error) {
      console.error('Failed to add history:', error);
    } finally {
      setIsAddingHistory(false);
    }
  };

  const getPriorityColor = (priority: string, index: number) => {
    if (priority === 'High' || index > 7) return 'destructive';
    if (priority === 'Medium' || index > 4) return 'default';
    return 'secondary';
  };

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'new': return 'default';
      case 'in progress': return 'secondary';
      case 'closed': return 'outline';
      default: return 'secondary';
    }
  };

  const formatDate = (dateString: string) => {
    if (!dateString) return 'No date';
    try {
      return new Date(dateString).toLocaleString();
    } catch {
      return dateString;
    }
  };

  const decodeHtmlEntities = (text: string) => {
    const textarea = document.createElement('textarea');
    textarea.innerHTML = text;
    return textarea.value;
  };

  const stripHtmlTags = (html: string) => {
    const tmp = document.createElement('div');
    tmp.innerHTML = html;
    return tmp.textContent || tmp.innerText || '';
  };

  // Get effective description from ticket (description or template_data)
  const getTicketDescription = (ticket: Ticket) => {
    if (ticket.description && ticket.description.trim()) {
      return ticket.description;
    }
    
    // If description is empty, try to extract meaningful content from template_data
    if (ticket.template_data && ticket.template_data.trim()) {
      try {
        const templateData = JSON.parse(ticket.template_data);
        if (typeof templateData === 'object' && templateData !== null) {
          // For detail view, show template data in a more structured way
          return Object.entries(templateData)
            .filter(([, value]) => value && typeof value === 'string' && value.trim())
            .map(([key, value]) => `${key}: ${value}`)
            .join('\n') || 'Custom template data';
        }
      } catch {
        // If parsing fails, return the raw template data
        return ticket.template_data;
      }
    }
    
    return 'No description available';
  };

  const handleDownloadAttachment = async (filename: string) => {
    setDownloadingFiles(prev => new Set(prev).add(filename));
    
    try {
      const blob = await apiClient.downloadAttachment(ticket.id, filename);
      
      // Create download link
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Failed to download attachment:', error);
    } finally {
      setDownloadingFiles(prev => {
        const newSet = new Set(prev);
        newSet.delete(filename);
        return newSet;
      });
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="outline" size="icon" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2">
            <Badge variant={getPriorityColor(ticket.priority, ticket.index)}>
              #{ticket.id}
            </Badge>
            <Badge variant={getStatusColor(ticket.status)}>
              {ticket.status}
            </Badge>
            {ticket.priority && (
              <Badge variant="outline">
                {ticket.priority}
              </Badge>
            )}
          </div>
          <h1 className="text-2xl font-bold">{ticket.summary}</h1>
          <p className="text-muted-foreground">{ticket.subject}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          <Tabs defaultValue="details" className="space-y-4">
            <TabsList>
              <TabsTrigger value="details">Details</TabsTrigger>
              <TabsTrigger value="history">History</TabsTrigger>
              <TabsTrigger value="todos">
                Todos
                {todos.length > 0 && (
                  <Badge variant="secondary" className="ml-1">
                    {todos.filter(t => !t.checked).length}/{todos.length}
                  </Badge>
                )}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="details" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Description</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="whitespace-pre-wrap">{getTicketDescription(ticket)}</p>
                  
                  {ticket.attachments && ticket.attachments.length > 0 && (
                    <div className="mt-4">
                      <h4 className="font-medium mb-2 flex items-center gap-2">
                        <Paperclip className="h-4 w-4" />
                        Attachments
                      </h4>
                      <div className="space-y-2">
                        {ticket.attachments.map((filename, index) => (
                          <div key={index} className="flex items-center gap-2 p-2 bg-muted rounded hover:bg-muted/80 transition-colors">
                            <Paperclip className="h-4 w-4 text-muted-foreground" />
                            <span className="text-sm flex-1">{filename}</span>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 p-0"
                              onClick={() => handleDownloadAttachment(filename)}
                              disabled={downloadingFiles.has(filename)}
                            >
                              {downloadingFiles.has(filename) ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Download className="h-4 w-4" />
                              )}
                            </Button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Company & Contact Information</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <Building className="h-4 w-4 text-muted-foreground" />
                        <span className="font-medium">Company</span>
                      </div>
                      <p>{ticket.company.name}</p>
                      <p className="text-sm text-muted-foreground">{ticket.company.companyAdress}</p>
                      <p className="text-sm text-muted-foreground">{ticket.company.companyZip}</p>
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <User className="h-4 w-4 text-muted-foreground" />
                        <span className="font-medium">Contact</span>
                      </div>
                      <p>{ticket.ticketUser}</p>
                      {ticket.ticketUserPhone && (
                        <div className="flex items-center gap-2">
                          <Phone className="h-4 w-4 text-muted-foreground" />
                          <span className="text-sm">{ticket.ticketUserPhone}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="history" className="space-y-4">
              {/* Add New History Entry Form */}
              <Card>
                <CardHeader>
                  <CardTitle>Add History Entry</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <Textarea
                    placeholder="Enter history details..."
                    value={newHistoryText}
                    onChange={(e) => setNewHistoryText(e.target.value)}
                    disabled={isAddingHistory}
                    rows={3}
                  />
                  <div className="flex gap-2 items-center">
                    <Select value={newHistoryStatus} onValueChange={setNewHistoryStatus}>
                      <SelectTrigger className="w-[200px]">
                        <SelectValue placeholder="Select status" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1">New</SelectItem>
                        <SelectItem value="2">Scheduled</SelectItem>
                        <SelectItem value="3">In Progress</SelectItem>
                        <SelectItem value="4">Closed</SelectItem>
                        <SelectItem value="5">Reopened</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button 
                      onClick={handleAddHistory} 
                      disabled={isAddingHistory || !newHistoryText.trim()}
                      className="ml-auto"
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      Add Entry
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* History Entries */}
              {isLoading ? (
                <div className="space-y-4">
                  {[1, 2, 3].map((i) => (
                    <Card key={i} className="animate-pulse">
                      <CardContent className="p-4">
                        <div className="h-4 bg-muted rounded w-1/4 mb-2" />
                        <div className="h-6 bg-muted rounded w-3/4 mb-2" />
                        <div className="h-4 bg-muted rounded w-1/2" />
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : (
                <>
                  {ticketHistory.map((entry) => (
                    <Card key={entry.id}>
                      <CardHeader>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <User className="h-4 w-4" />
                            <span className="font-medium">{entry.user.name}</span>
                            <Badge variant="outline">{entry.status_name}</Badge>
                          </div>
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Calendar className="h-3 w-3" />
                            {formatDate(entry.created_at)}
                          </div>
                        </div>
                      </CardHeader>
                      {entry.technician_reply && (
                        <CardContent>
                          <p className="whitespace-pre-wrap">{stripHtmlTags(decodeHtmlEntities(entry.technician_reply))}</p>
                          {entry.total_time > 0 && (
                            <div className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
                              <Clock className="h-3 w-3" />
                              Time spent: {Math.floor(entry.total_time / 60)} minutes
                            </div>
                          )}
                        </CardContent>
                      )}
                    </Card>
                  ))}
                  {ticketHistory.length === 0 && (
                    <Card>
                      <CardContent className="p-8 text-center">
                        <MessageSquare className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                        <p className="text-muted-foreground">No history entries yet</p>
                      </CardContent>
                    </Card>
                  )}
                </>
              )}
            </TabsContent>

            <TabsContent value="todos" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Add New Todo</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex gap-2">
                    <Input
                      placeholder="Enter new todo..."
                      value={newTodo}
                      onChange={(e) => setNewTodo(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleAddTodo()}
                      disabled={isAddingTodo}
                    />
                    <Button onClick={handleAddTodo} disabled={isAddingTodo || !newTodo.trim()}>
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>

              <div className="space-y-2">
                {todos.map((todo) => (
                  <Card key={todo.id}>
                    <CardContent className="p-4">
                      <div className="flex items-center gap-3">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="p-0 h-auto"
                          onClick={() => handleToggleTodo(todo.id, todo.checked)}
                        >
                          {todo.checked ? (
                            <CheckCircle className="h-5 w-5 text-green-500" />
                          ) : (
                            <Circle className="h-5 w-5 text-muted-foreground" />
                          )}
                        </Button>
                        <div className="flex-1">
                          <p className={`${todo.checked ? 'line-through text-muted-foreground' : ''}`}>
                            {todo.to_do}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Added {formatDate(todo.created_at)}
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
                {todos.length === 0 && (
                  <Card>
                    <CardContent className="p-8 text-center">
                      <CheckCircle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                      <p className="text-muted-foreground">No todos yet</p>
                    </CardContent>
                  </Card>
                )}
              </div>
            </TabsContent>
          </Tabs>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Ticket Player Controls */}
          <TicketPlayerControls ticket={ticket} />

          {/* Ticket Info */}
          <Card>
            <CardHeader>
              <CardTitle>Ticket Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 gap-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Created:</span>
                  <span>{formatDate(ticket.created_at)}</span>
                </div>
                {ticket.ticket_start && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Scheduled:</span>
                    <span>{formatDate(ticket.ticket_start)}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Creator:</span>
                  <span>{ticket.ticketCreator}</span>
                </div>
                {ticket.ticketTerminatedUser && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Assigned:</span>
                    <span>{ticket.ticketTerminatedUser}</span>
                  </div>
                )}
                {ticket.pool_name && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Pool:</span>
                    <span>{ticket.pool_name}</span>
                  </div>
                )}
                {ticket.ticketMessagesCount > 0 && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Messages:</span>
                    <Badge variant="secondary">{ticket.ticketMessagesCount}</Badge>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}