export interface User {
  id: number;
  name: string;
  email: string;
  firstname: string;
  surname: string;
  phone: string;
  company_id: number;
  user_group_id: number;
  sub_user_group_id: number;
  location_id: number;
  profile_photo_url: string;
  role: {
    id: number;
    name: string;
  };
}

export interface LoginResponse {
  status: string;
  user: User;
  authorisation: {
    token: string;
    type: string;
  };
}

export interface Company {
  id: number;
  name: string;
  number: string;
  companyMail: string;
  companyPhone: string;
  companyZip: string;
  companyAdress: string;
  locations?: Array<{
    id: number;
    name: string;
  }>;
}

export interface Ticket {
  id: number;
  description: string;
  status: string;
  status_id: number;
  summary: string;
  ticketCreator: string;
  ticketUser: string;
  ticketUserPhone: string;
  playStatus?: string;
  ticketTerminatedUser: string;
  attachments: string[];
  subject: string;
  priority: string;
  index: number;
  my_ticket_id: number;
  location_id: number;
  company: Company;
  dyn_template_id: number;
  created_at: string;
  ticket_start: string;
  ticketMessagesCount: number;
  template_data: string;
  pool_name: string;
}

export interface TicketsResponse {
  status: string;
  new_tickets: Ticket[];
  my_tickets: Ticket[];
  all_tickets: Ticket[];
}

export interface TicketHistory {
  id: number;
  ticket_id: number;
  technician_id: number;
  status_id: number;
  technician_reply: string;
  created_at: string;
  updated_at: string;
  service_start: number;
  service_end: number;
  total_time: number;
  user: User;
  status_name: string;
}

export interface TodoItem {
  id: number;
  ticket_id: number;
  user_id: number;
  to_do: string;
  checked: number;
  created_at: string;
}

export interface PlayerStatus {
  id: number;
  play_status: number;
  status_id: number;
  total_time: number;
  total_time_raw: string;
  tmp_description: string;
  ticket_status_id: number;
}

export interface ApiResponse<T = any> {
  status: string;
  result?: string;
  message?: string;
  data?: T;
  tickets?: any;
  ticket_data?: TicketHistory[];
  check_list?: TodoItem[];
  playerStatus?: PlayerStatus;
  users?: User[];
}

export interface UserStatus {
  activeStatus: boolean;
  message: string;
}

export interface Template {
  id: number;
  name: string;
}

export interface Location {
  id: number;
  name: string;
  company_id: number;
}