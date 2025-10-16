export interface Ticket {
  id?: number;
  ticket_number: string;
  customer_email: string;
  merchant_email?: string;
  subject: string;
  description?: string;
  status: 'open' | 'in_progress' | 'resolved' | 'closed';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  transaction_id?: string;
  created_at?: Date;
  updated_at?: Date;
  resolved_at?: Date;
  assigned_to?: string;
  tags?: string[];
  metadata?: any;
}

export interface TicketCreationData {
  customer_email: string;
  merchant_email?: string;
  subject: string;
  description?: string;
  priority?: 'low' | 'medium' | 'high' | 'urgent';
  transaction_id?: string;
  tags?: string[];
  metadata?: any;
}

export interface TicketUpdateData {
  status?: 'open' | 'in_progress' | 'resolved' | 'closed';
  priority?: 'low' | 'medium' | 'high' | 'urgent';
  assigned_to?: string;
  resolution?: string;
  tags?: string[];
  metadata?: any;
}

export interface TicketFilter {
  status?: string;
  priority?: string;
  customer_email?: string;
  merchant_email?: string;
  assigned_to?: string;
  date_from?: string;
  date_to?: string;
  search?: string;
  transaction_id?: string;
  tags?: string[];
}

export interface TicketStats {
  total: number;
  open: number;
  in_progress: number;
  resolved: number;
  closed: number;
  by_priority: {
    low: number;
    medium: number;
    high: number;
    urgent: number;
  };
  avg_resolution_time: number; // in hours
  resolution_rate: number; // percentage
}