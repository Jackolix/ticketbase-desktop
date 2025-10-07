import type { 
  LoginResponse, 
  TicketsResponse, 
  ApiResponse, 
  User, 
  UserStatus, 
  Template,
  Company,
  Location,
  TodoItem,
  TicketHistory,
  PlayerStatus
} from '@/types/api';

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
      throw new Error(`HTTP error! status: ${response.status}`);
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

  // Tickets
  async getTickets(userId: number, userGroupId: number, companyId?: number, locationId?: number, forUserId?: number, subUserGroupId?: number): Promise<TicketsResponse> {
    return this.request<TicketsResponse>('/getTickets', {
      method: 'POST',
      body: JSON.stringify({
        user_id: userId,
        user_group_id: userGroupId,
        company_id: companyId,
        location_id: locationId,
        for_user_id: forUserId,
        sub_user_group_id: subUserGroupId,
      }),
    });
  }

  async getTicketsToday(userId: number, datum: string): Promise<ApiResponse<{todayTickets: any[]}>> {
    return this.request<ApiResponse<{todayTickets: any[]}>>('/getTicketsToday', {
      method: 'POST',
      body: JSON.stringify({
        user_id: userId,
        datum,
      }),
    });
  }

  async getTicketData(ticketId: number): Promise<ApiResponse<{ticket_data: TicketHistory[]}>> {
    return this.request<ApiResponse<{ticket_data: TicketHistory[]}>>('/getTicketData', {
      method: 'POST',
      body: JSON.stringify({
        ticket_id: ticketId,
      }),
    });
  }

  async getTicketById(ticketId: number): Promise<ApiResponse<{tickets: any}>> {
    return this.request<ApiResponse<{tickets: any}>>(`/getTicketById?ticket_id=${ticketId}`, {
      method: 'GET',
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

  async stop(ticketId: number, userId: number): Promise<ApiResponse> {
    return this.request<ApiResponse>('/stop', {
      method: 'POST',
      body: JSON.stringify({
        ticket_id: ticketId,
        user_id: userId,
      }),
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
  async createTicket(data: {
    user_id: number;
    description: string;
    priority: string;
    company_id: number;
    location_id?: number;
    for_user_id?: number;
    dyn_template_id?: number;
  }): Promise<ApiResponse> {
    return this.request<ApiResponse>('/createTicket', {
      method: 'POST',
      body: JSON.stringify(data),
    });
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

  async changePassword(userId: number, newPassword: string): Promise<ApiResponse> {
    return this.request<ApiResponse>('/changePassword', {
      method: 'POST',
      body: JSON.stringify({
        user_id: userId,
        new_password: newPassword,
      }),
    });
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

  // Enhanced ticket search with additional filters (like web interface)
  async searchTickets(filters: {
    user_id: number;
    user_group_id: number;
    company_id?: number;
    location_id?: number;
    for_user_id?: number;
    sub_user_group_id?: number;
    customer_name?: string;
    date_from?: string;
    date_to?: string;
    status?: string;
    priority?: string;
  }): Promise<TicketsResponse> {
    return this.request<TicketsResponse>('/getTickets', {
      method: 'POST',
      body: JSON.stringify({
        user_id: filters.user_id,
        user_group_id: filters.user_group_id,
        company_id: filters.company_id,
        location_id: filters.location_id,
        for_user_id: filters.for_user_id,
        sub_user_group_id: filters.sub_user_group_id,
      }),
    });
  }

  // Get all tickets without pool filtering using test endpoint
  async getTicketsUnfiltered(userId: number, userGroupId: number, companyId?: number, locationId?: number, forUserId?: number, subUserGroupId?: number): Promise<TicketsResponse> {
    return this.request<TicketsResponse>('/testGetTickets', {
      method: 'POST',
      body: JSON.stringify({
        user_id: userId,
        user_group_id: userGroupId,
        company_id: companyId,
        location_id: locationId,
        for_user_id: forUserId,
        sub_user_group_id: subUserGroupId,
      }),
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