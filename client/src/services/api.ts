import axios from 'axios';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001/api';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor to add auth token
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor to handle auth errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('refreshToken');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// Auth API
export const authAPI = {
  login: (email: string, password: string) => 
    api.post('/auth/login', { email, password }),
  
  logout: () => 
    api.post('/auth/logout'),
  
  getCurrentUser: () => 
    api.get('/auth/me'),
  
  refreshToken: (refreshToken: string) => 
    api.post('/auth/refresh', { refreshToken }),
};

// Tickets API
export const ticketsAPI = {
  getTickets: (params?: any) => 
    api.get('/tickets', { params }),
  
  getTicket: (id: string) => 
    api.get(`/tickets/${id}`),
  
  createTicket: (data: any) => 
    api.post('/tickets', data),
  
  updateTicket: (id: string, data: any) => 
    api.put(`/tickets/${id}`, data),
  
  deleteTicket: (id: string) => 
    api.delete(`/tickets/${id}`),
  
  getTicketStats: () => 
    api.get('/tickets/stats'),
};

// Transactions API
export const transactionsAPI = {
  getTransactions: (params?: any) => 
    api.get('/transactions', { params }),
  
  getTransaction: (id: string) => 
    api.get(`/transactions/${id}`),
  
  createTransaction: (data: any) => 
    api.post('/transactions', data),
  
  updateTransactionStatus: (id: string, data: any) => 
    api.put(`/transactions/${id}/status`, data),
  
  refreshTransactionStatus: (id: string) => 
    api.post(`/transactions/${id}/refresh`),
  
  batchUpdateTransactions: (transactionIds: string[]) => 
    api.post('/transactions/batch-update', { transaction_ids: transactionIds }),
  
  getTransactionStats: () => 
    api.get('/transactions/stats'),
};

// Dashboard API
export const dashboardAPI = {
  getOverview: () => 
    api.get('/dashboard/overview'),
  
  getDetailedStats: (range?: string) => 
    api.get('/dashboard/stats', { params: { range } }),
  
  getRecentActivity: (limit?: number) => 
    api.get('/dashboard/recent-activity', { params: { limit } }),
  
  getPerformanceMetrics: () => 
    api.get('/dashboard/performance'),
  
  getAlerts: () => 
    api.get('/dashboard/alerts'),
  
  triggerCronJob: (jobName: string) => 
    api.post(`/dashboard/cron/${jobName}`),
  
  getCronJobStatus: () => 
    api.get('/dashboard/cron/status'),
};

// Webhooks API
export const webhooksAPI = {
  getWebhookLogs: (params?: any) => 
    api.get('/webhooks/logs', { params }),
};

export default api;