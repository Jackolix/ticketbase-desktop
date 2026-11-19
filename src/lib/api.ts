import type {
  LoginResponse,
  ApiResponse,
  User,
  UserStatus,
  Template,
  Company,
  Location,
  TodoItem,
  TicketHistory,
  PlayerStatus,
  SaveStatus
} from '@/types/api';
import { fetch } from '@tauri-apps/plugin-http';
import { hasFiles, type FormAnswers } from '@/lib/formSchema';

export interface CreateTicketInput {
  description: string;
  priority: 'NORMAL' | 'HIGH' | 'VERY_HIGH';
  company_id: number;
  location_id: number;
  for_user_id: number;
  /** Short title; the server falls back to the description. */
  summary?: string;
  dyn_template_id?: number;
  /** Answers to the template's form, by field key. */
  form_answers?: FormAnswers;
  attachment?: File;
}

/** What createTicket returns about the new ticket (HTTP 201). */
export interface CreatedTicket {
  id: number;
  status_id: number;
  created_at: string;
}

/** A 422 from createTicket: `errors` maps a field (or `form_answers.f_…`) to messages. */
export class TicketValidationError extends Error {
  constructor(message: string, readonly errors: Record<string, string[]>) {
    super(message);
  }
}

class ApiClient {
  private baseUrl: string;
  private token: string | null = null;

  constructor(baseUrl: string = 'https://itm.ticketbase.net/api') {
    this.baseUrl = baseUrl;
    this.loadToken();
  }

  private loadToken() {
    this.token = localStorage.getItem('auth_token');
  }

  private saveToken(token: string) {
    this.token = token;
    localStorage.setItem('auth_token', token);
  }

  private clearToken() {
    this.token = null;
    localStorage.removeItem('auth_token');
  }

  private async request<T>(
    endpoint: string, 
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;

    // Re-read on every request: changing the password replaces the token
    // (the old one is rejected from then on), and every window has its own
    // ApiClient but shares localStorage.
    this.loadToken();

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      ...(options.headers as Record<string, string>),
    };

    if (this.token) {
      headers.Authorization = `Bearer ${this.token}`;
    }

    const response = await fetch(url, {
      ...options,
      headers,
    });

    if (!response.ok) {
      let errorBody = '';
      try {
        errorBody = await response.text();
        console.error('❌ Server error response body:', errorBody);
      } catch {
        console.error('Could not read error response body');
      }
      throw new Error(`HTTP error! status: ${response.status}${errorBody ? ' - ' + errorBody.substring(0, 500) : ''}`);
    }

    return response.json();
  }

  // Authentication
  async login(email: string, password: string): Promise<LoginResponse> {
    const response = await this.request<LoginResponse>('/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });

    if (response.status === 'success' && response.authorisation.token) {
      this.saveToken(response.authorisation.token);
    }

    return response;
  }

  logout() {
    this.clearToken();
  }

  async getTicketData(ticketId: number): Promise<ApiResponse<{ticket_data: TicketHistory[]}>> {
    return this.request<ApiResponse<{ticket_data: TicketHistory[]}>>('/getTicketData', {
      method: 'POST',
      body: JSON.stringify({
        ticket_id: ticketId,
      }),
    });
  }

  // User Status
  async getUserStatus(userId: number): Promise<ApiResponse<{activity: UserStatus}>> {
    return this.request<ApiResponse<{activity: UserStatus}>>('/getUserStatus', {
      method: 'POST',
      body: JSON.stringify({
        user_id: userId,
      }),
    });
  }

  async changeUserStatus(userId: number, type: number): Promise<ApiResponse<{activity: UserStatus}>> {
    return this.request<ApiResponse<{activity: UserStatus}>>('/changeUserStatus', {
      method: 'POST',
      body: JSON.stringify({
        user_id: userId,
        type,
      }),
    });
  }

  // Templates and Data
  async getTemplates(companyId?: number): Promise<ApiResponse<{templates: Template[]}>> {
    return this.request<ApiResponse<{templates: Template[]}>>(`/getTemplates${companyId ? `/${companyId}` : ''}`, {
      method: 'POST',
      body: JSON.stringify({
        company_id: companyId,
      }),
    });
  }

  async getCustomers(): Promise<ApiResponse<{customers: Company[]}>> {
    return this.request<ApiResponse<{customers: Company[]}>>('/getCustomers', {
      method: 'POST',
    });
  }

  async getCustomerLocations(customerId: number): Promise<ApiResponse<{locations: Location[]}>> {
    return this.request<ApiResponse<{locations: Location[]}>>('/getCustomerLocations', {
      method: 'POST',
      body: JSON.stringify({
        customer_id: customerId,
      }),
    });
  }

  async getLocationUsers(locationId: number): Promise<ApiResponse<{users: User[]}>> {
    return this.request<ApiResponse<{users: User[]}>>('/getLocationUsers', {
      method: 'POST',
      body: JSON.stringify({
        location_id: locationId,
      }),
    });
  }

  // Todo List
  async getCheckList(ticketId: number): Promise<ApiResponse<{check_list: TodoItem[]}>> {
    return this.request<ApiResponse<{check_list: TodoItem[]}>>('/getCheckList', {
      method: 'POST',
      body: JSON.stringify({
        ticket_id: ticketId,
      }),
    });
  }

  async newTodo(ticketId: number, userId: number, todo: string): Promise<ApiResponse<{check_list: TodoItem[]}>> {
    return this.request<ApiResponse<{check_list: TodoItem[]}>>('/newTodo', {
      method: 'POST',
      body: JSON.stringify({
        ticket_id: ticketId,
        user_id: userId,
        todo,
      }),
    });
  }

  async checkTodo(todoId: number, type: number): Promise<ApiResponse> {
    return this.request<ApiResponse>('/checkTodo', {
      method: 'POST',
      body: JSON.stringify({
        todo_id: todoId,
        type,
      }),
    });
  }

  // Ticket Player Controls
  async play(ticketId: number, userId: number): Promise<ApiResponse> {
    return this.request<ApiResponse>('/play', {
      method: 'POST',
      body: JSON.stringify({
        ticket_id: ticketId,
        user_id: userId,
      }),
    });
  }

  async pause(ticketId: number, userId: number, currentState: number = 1): Promise<ApiResponse> {
    return this.request<ApiResponse>('/pause', {
      method: 'POST',
      body: JSON.stringify({
        ticket_id: ticketId,
        user_id: userId,
        current_state: currentState, // 1 for PLAY, 3 for RESUME
      }),
    });
  }

  async resume(ticketId: number, userId: number, currentState: number = 2): Promise<ApiResponse> {
    return this.request<ApiResponse>('/resume', {
      method: 'POST',
      body: JSON.stringify({
        ticket_id: ticketId,
        user_id: userId,
        current_state: currentState, // 2 for PAUSE state
      }),
    });
  }

  /**
   * Stops the timer. The server only acts on current_state 1 (PLAY) or
   * 3 (RESUME); for anything else it returns an empty body, so callers must
   * resume a paused timer first. See stopTimerForSave in workEntry.ts.
   */
  async stop(ticketId: number, userId: number, currentState: 1 | 3): Promise<ApiResponse> {
    return this.request<ApiResponse>('/stop', {
      method: 'POST',
      body: JSON.stringify({
        ticket_id: ticketId,
        user_id: userId,
        current_state: currentState,
      }),
    });
  }

  /**
   * Statuses the server accepts when saving a work entry, in display order,
   * with the rules each one carries.
   */
  async getSaveStatuses(): Promise<ApiResponse & { statuses?: SaveStatus[] }> {
    return this.request<ApiResponse & { statuses?: SaveStatus[] }>('/getSaveStatuses', {
      method: 'GET',
    });
  }

  async getPlayerStatus(ticketId: number, userId: number): Promise<ApiResponse<PlayerStatus>> {
    return this.request<ApiResponse<PlayerStatus>>('/getPlayerStatus', {
      method: 'POST',
      body: JSON.stringify({
        ticket_id: ticketId,
        user_id: userId,
      }),
    });
  }

  // Ticket Management
  /**
   * Creates a ticket (POST createTicket, INTEGRATIONS.md §4.2).
   *
   * The creator is always the signed-in user. Location and recipient must
   * belong to the customer, and a template must be enabled for it; the server
   * answers 422 with per-field `errors` otherwise, thrown here as
   * TicketValidationError. With a template that has a form, `form_answers`
   * carries the answers; files among them, or an attachment, make this a
   * multipart request.
   */
  async createTicket(input: CreateTicketInput): Promise<CreatedTicket | null> {
    const answers = input.form_answers;
    const multipart = Boolean(input.attachment) || (answers ? hasFiles(answers) : false);

    const fields: Record<string, string | number | undefined> = {
      description: input.description,
      priority: input.priority,
      company_id: input.company_id,
      location_id: input.location_id,
      for_user_id: input.for_user_id,
      summary: input.summary?.trim() || undefined,
      dyn_template_id: input.dyn_template_id,
    };

    let body: BodyInit;
    const headers: Record<string, string> = { Accept: 'application/json' };

    if (multipart) {
      const form = new FormData();
      for (const [key, value] of Object.entries(fields)) {
        if (value !== undefined) form.append(key, String(value));
      }
      for (const [key, value] of Object.entries(answers ?? {})) {
        if (value instanceof File) form.append(`form_answers[${key}]`, value);
        else if (Array.isArray(value)) value.forEach((v) => form.append(`form_answers[${key}][]`, v));
        else if (value !== null) form.append(`form_answers[${key}]`, value);
      }
      // A single file: createTicketMobile reads `ticket_image` as one upload,
      // so `ticket_image[]` would break server-side.
      if (input.attachment) form.append('ticket_image', input.attachment);
      body = form;
    } else {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify({ ...fields, ...(answers && { form_answers: answers }) });
    }

    this.loadToken();
    if (this.token) headers.Authorization = `Bearer ${this.token}`;

    const response = await fetch(`${this.baseUrl}/createTicket`, { method: 'POST', headers, body });
    const payload = (await response.json().catch(() => null)) as {
      status?: string;
      message?: string;
      errors?: Record<string, string[]>;
      ticket?: CreatedTicket;
    } | null;

    if (response.status === 422) {
      throw new TicketValidationError(
        payload?.message || 'Bitte die markierten Angaben prüfen.',
        payload?.errors ?? {},
      );
    }
    if (!response.ok || payload?.status !== 'success') {
      throw new Error(
        payload?.message || `Das Ticket konnte nicht angelegt werden (HTTP ${response.status}).`,
      );
    }

    // Servers before the 2026-11 release answer without the new ticket.
    return payload.ticket ?? null;
  }

  async ticketTerminieren(ticketId: number, userId: number, date: string): Promise<ApiResponse> {
    return this.request<ApiResponse>('/TicketTerminieren', {
      method: 'POST',
      body: JSON.stringify({
        ticket_id: ticketId,
        user_id: userId,
        date,
      }),
    });
  }

  async ticketTerminierenApi(ticketId: number, userId: number, ticketStart: string, mode: number = 1): Promise<ApiResponse> {
    return this.request<ApiResponse>('/ticketTerminierenApi', {
      method: 'POST',
      body: JSON.stringify({
        ticket_id: ticketId,
        user_id: userId,
        ticket_start: ticketStart,
        mode,
      }),
    });
  }

  // Profile Management
  async editProfile(userId: number, name: string, phone: string): Promise<ApiResponse<{user: User}>> {
    return this.request<ApiResponse<{user: User}>>('/editProfile', {
      method: 'POST',
      body: JSON.stringify({
        user_id: userId,
        name,
        phone,
      }),
    });
  }

  /**
   * Changes the user's own password.
   *
   * The server invalidates every token issued before the change, including the
   * one this request carried, and returns a fresh one in `authorisation` like
   * login does. It is stored here; the caller must also hand it to the sync
   * engine, which holds its own copy.
   */
  async changePassword(userId: number, newPassword: string): Promise<ApiResponse & { authorisation?: { token: string } }> {
    const response = await this.request<ApiResponse & { authorisation?: { token: string } }>('/changePassword', {
      method: 'POST',
      body: JSON.stringify({
        user_id: userId,
        new_password: newPassword,
      }),
    });

    if (response.status === 'success' && response.authorisation?.token) {
      this.saveToken(response.authorisation.token);
    }

    return response;
  }

  // Mail Settings
  async getUsersMailSettings(userId: number): Promise<ApiResponse<{user_mail_settings_arr: any}>> {
    return this.request<ApiResponse<{user_mail_settings_arr: any}>>('/getUsersMailSettings', {
      method: 'POST',
      body: JSON.stringify({
        user_id: userId,
      }),
    });
  }

  async userMailSettings(userId: number, value: number, type: number): Promise<ApiResponse> {
    return this.request<ApiResponse>('/userMailSettings', {
      method: 'POST',
      body: JSON.stringify({
        user_id: userId,
        value,
        type,
      }),
    });
  }

  async saveTicketHistory(data: {
    ticket_id: number;
    user_id: number;
    verlauf_text: string;
    status_id: number;
    sendMail?: number;
    retermUserId?: number;
    retermDate?: string;
  }): Promise<ApiResponse> {
    return this.request<ApiResponse>('/saveVerlaufApi', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async correctWatch(data: {
    ticket_id: number;
    user_id: number;
    old_time: number;
    new_time: number;
  }): Promise<ApiResponse> {
    return this.request<ApiResponse>('/correctWatch', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async downloadAttachment(ticketId: number, filename: string): Promise<Blob> {
    this.loadToken();
    const response = await fetch(`${this.baseUrl}/getDataUrl`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/octet-stream',
        ...(this.token && { Authorization: `Bearer ${this.token}` }),
      },
      body: JSON.stringify({
        ticket_id: ticketId,
        filename: filename,
      }),
    });

    if (!response.ok) {
      throw new Error(`Failed to download attachment: ${response.status}`);
    }

    return response.blob();
  }

  // Reports
  async getReport4(startDate: string, endDate: string): Promise<ApiResponse<{report: any[]}>> {
    return this.request<ApiResponse<{report: any[]}>>(`/Report4?start_date=${startDate}&end_date=${endDate}`, {
      method: 'GET',
    });
  }

  async getReport5(startDate: string, endDate: string): Promise<ApiResponse<{report: any[]}>> {
    return this.request<ApiResponse<{report: any[]}>>(`/Report5?start_date=${startDate}&end_date=${endDate}`, {
      method: 'GET',
    });
  }

  async getTopUsers(month: number): Promise<ApiResponse<{top_users: any[]}>> {
    return this.request<ApiResponse<{top_users: any[]}>>(`/getTopUsers?month=${month}`, {
      method: 'GET',
    });
  }

  // Ticket Messaging
  async getTicketMessages(ticketId: number): Promise<ApiResponse<{messages: any[]}>> {
    return this.request<ApiResponse<{messages: any[]}>>(`/getTicketMessages?ticket_id=${ticketId}`, {
      method: 'GET',
    });
  }

  async sendMessage(ticketId: number, userId: number, message: string): Promise<ApiResponse> {
    return this.request<ApiResponse>('/sendMessage', {
      method: 'POST',
      body: JSON.stringify({
        ticket_id: ticketId,
        user_id: userId,
        message,
      }),
    });
  }

  // Wiki / Knowledge Base
  async getWikiData(): Promise<ApiResponse<{wikiData: any[]}>> {
    return this.request<ApiResponse<{wikiData: any[]}>>('/getWikiData', {
      method: 'GET',
    });
  }

  // Ticket Rating
  async getClosedConfirmedTickets(userId: number): Promise<ApiResponse<{tickets: any[]}>> {
    return this.request<ApiResponse<{tickets: any[]}>>(`/getClosedConfirmedTickets?user_id=${userId}`, {
      method: 'GET',
    });
  }

  async rateTicket(ticketId: number, userId: number, rating: number, feedback?: string): Promise<ApiResponse> {
    return this.request<ApiResponse>('/rateTicket', {
      method: 'POST',
      body: JSON.stringify({
        ticket_id: ticketId,
        user_id: userId,
        rating,
        feedback,
      }),
    });
  }

  // Time Tracking History
  async getCorrectWatchHistoriesForPeriod(userId: number, startDate: string, endDate: string): Promise<ApiResponse<{histories: any[]}>> {
    return this.request<ApiResponse<{histories: any[]}>>(`/getCorrectWatchHistoriesForPeriod?user_id=${userId}&start_date=${startDate}&end_date=${endDate}`, {
      method: 'GET',
    });
  }

  // Utility
  isAuthenticated(): boolean {
    return !!this.token;
  }

  setBaseUrl(url: string) {
    this.baseUrl = url;
  }
}

export const apiClient = new ApiClient();