import React, { useState, useEffect, useCallback } from 'react';
import { 
  TicketIcon, 
  CurrencyDollarIcon, 
  ExclamationTriangleIcon,
  CheckCircleIcon,
  XCircleIcon,
  ArrowUpIcon
} from '@heroicons/react/24/outline';
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from 'recharts';
import { dashboardAPI } from '../services/api';
import { useToast } from '../contexts/ToastContext';
import LoadingSpinner from '../components/LoadingSpinner';

interface DashboardData {
  tickets: {
    total: number;
    open: number;
    in_progress: number;
    resolved: number;
    today: number;
    urgent: number;
  };
  transactions: {
    total: number;
    successful: number;
    failed: number;
    pending: number;
    revenue: number;
    today: number;
  };
  activity: {
    recent: number;
  };
  health: {
    email_failures: number;
    whatsapp_failures: number;
    overall_status: string;
  };
}

interface RecentActivity {
  type: string;
  action: string;
  reference: string;
  actor: string;
  description: string;
  timestamp: string;
}

const Dashboard: React.FC = () => {
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  const [recentActivity, setRecentActivity] = useState<RecentActivity[]>([]);
  const [alerts, setAlerts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const { addToast } = useToast();

  const fetchDashboardData = useCallback(async () => {
    try {
      setLoading(true);
      
      const [overviewRes, activityRes, alertsRes] = await Promise.all([
        dashboardAPI.getOverview(),
        dashboardAPI.getRecentActivity(10),
        dashboardAPI.getAlerts(),
      ]);

      setDashboardData(overviewRes.data.data);
      setRecentActivity(activityRes.data.data);
      setAlerts(alertsRes.data.data.alerts);
    } catch (error: any) {
      console.error('Error fetching dashboard data:', error);
      addToast({
        type: 'error',
        title: 'Error',
        message: 'Failed to load dashboard data',
      });
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  if (loading) {
    return <LoadingSpinner />;
  }

  if (!dashboardData) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-gray-500">Failed to load dashboard data</p>
      </div>
    );
  }

  const ticketStatusData = [
    { name: 'Open', value: dashboardData.tickets.open, color: '#3b82f6' },
    { name: 'In Progress', value: dashboardData.tickets.in_progress, color: '#f59e0b' },
    { name: 'Resolved', value: dashboardData.tickets.resolved, color: '#22c55e' },
  ];

  const transactionStatusData = [
    { name: 'Successful', value: dashboardData.transactions.successful, color: '#22c55e' },
    { name: 'Failed', value: dashboardData.transactions.failed, color: '#ef4444' },
    { name: 'Pending', value: dashboardData.transactions.pending, color: '#f59e0b' },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="md:flex md:items-center md:justify-between">
        <div className="flex-1 min-w-0">
          <h2 className="text-2xl font-bold leading-7 text-gray-900 sm:text-3xl sm:truncate">
            Dashboard
          </h2>
          <p className="mt-1 text-sm text-gray-500">
            Overview of your complaint and transaction automation system
          </p>
        </div>
        <div className="mt-4 flex md:mt-0 md:ml-4">
          <button
            onClick={fetchDashboardData}
            className="btn-secondary"
          >
            Refresh
          </button>
        </div>
      </div>

      {/* Alerts */}
      {alerts.length > 0 && (
        <div className="space-y-3">
          {alerts.map((alert, index) => (
            <div
              key={index}
              className={`rounded-md p-4 ${
                alert.level === 'high' 
                  ? 'bg-danger-50 border border-danger-200' 
                  : alert.level === 'medium'
                  ? 'bg-warning-50 border border-warning-200'
                  : 'bg-primary-50 border border-primary-200'
              }`}
            >
              <div className="flex">
                <div className="flex-shrink-0">
                  <ExclamationTriangleIcon 
                    className={`h-5 w-5 ${
                      alert.level === 'high' 
                        ? 'text-danger-400' 
                        : alert.level === 'medium'
                        ? 'text-warning-400'
                        : 'text-primary-400'
                    }`} 
                  />
                </div>
                <div className="ml-3">
                  <p className={`text-sm font-medium ${
                    alert.level === 'high' 
                      ? 'text-danger-800' 
                      : alert.level === 'medium'
                      ? 'text-warning-800'
                      : 'text-primary-800'
                  }`}>
                    {alert.message}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {/* Total Tickets */}
        <div className="card p-5">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <TicketIcon className="h-8 w-8 text-primary-600" />
            </div>
            <div className="ml-5 w-0 flex-1">
              <dl>
                <dt className="text-sm font-medium text-gray-500 truncate">
                  Total Tickets
                </dt>
                <dd className="flex items-baseline">
                  <div className="text-2xl font-semibold text-gray-900">
                    {dashboardData.tickets.total}
                  </div>
                  <div className="ml-2 flex items-baseline text-sm font-semibold text-success-600">
                    +{dashboardData.tickets.today} today
                  </div>
                </dd>
              </dl>
            </div>
          </div>
        </div>

        {/* Total Transactions */}
        <div className="card p-5">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <CurrencyDollarIcon className="h-8 w-8 text-success-600" />
            </div>
            <div className="ml-5 w-0 flex-1">
              <dl>
                <dt className="text-sm font-medium text-gray-500 truncate">
                  Total Revenue
                </dt>
                <dd className="flex items-baseline">
                  <div className="text-2xl font-semibold text-gray-900">
                    ${dashboardData.transactions.revenue.toLocaleString()}
                  </div>
                  <div className="ml-2 flex items-baseline text-sm font-semibold text-success-600">
                    {dashboardData.transactions.today} today
                  </div>
                </dd>
              </dl>
            </div>
          </div>
        </div>

        {/* Success Rate */}
        <div className="card p-5">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <CheckCircleIcon className="h-8 w-8 text-success-600" />
            </div>
            <div className="ml-5 w-0 flex-1">
              <dl>
                <dt className="text-sm font-medium text-gray-500 truncate">
                  Success Rate
                </dt>
                <dd className="flex items-baseline">
                  <div className="text-2xl font-semibold text-gray-900">
                    {dashboardData.transactions.total > 0 
                      ? Math.round((dashboardData.transactions.successful / dashboardData.transactions.total) * 100)
                      : 0}%
                  </div>
                  <div className="ml-2 flex items-baseline text-sm font-semibold text-success-600">
                    <ArrowUpIcon className="h-4 w-4" />
                  </div>
                </dd>
              </dl>
            </div>
          </div>
        </div>

        {/* Urgent Tickets */}
        <div className="card p-5">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <ExclamationTriangleIcon className="h-8 w-8 text-danger-600" />
            </div>
            <div className="ml-5 w-0 flex-1">
              <dl>
                <dt className="text-sm font-medium text-gray-500 truncate">
                  Urgent Tickets
                </dt>
                <dd className="flex items-baseline">
                  <div className="text-2xl font-semibold text-gray-900">
                    {dashboardData.tickets.urgent}
                  </div>
                  {dashboardData.tickets.urgent > 0 && (
                    <div className="ml-2 flex items-baseline text-sm font-semibold text-danger-600">
                      Needs attention
                    </div>
                  )}
                </dd>
              </dl>
            </div>
          </div>
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Ticket Status Distribution */}
        <div className="card p-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Ticket Status Distribution</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={ticketStatusData}
                  cx="50%"
                  cy="50%"
                  outerRadius={80}
                  dataKey="value"
                  label={({ name, value }) => `${name}: ${value}`}
                >
                  {ticketStatusData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Transaction Status Distribution */}
        <div className="card p-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Transaction Status Distribution</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={transactionStatusData}
                  cx="50%"
                  cy="50%"
                  outerRadius={80}
                  dataKey="value"
                  label={({ name, value }) => `${name}: ${value}`}
                >
                  {transactionStatusData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Recent Activity */}
      <div className="card">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-medium text-gray-900">Recent Activity</h3>
        </div>
        <div className="divide-y divide-gray-200">
          {recentActivity.length > 0 ? (
            recentActivity.map((activity, index) => (
              <div key={index} className="px-6 py-4">
                <div className="flex items-center space-x-3">
                  <div className="flex-shrink-0">
                    {activity.type === 'ticket' ? (
                      <div className="h-8 w-8 bg-primary-100 rounded-full flex items-center justify-center">
                        <TicketIcon className="h-4 w-4 text-primary-600" />
                      </div>
                    ) : (
                      <div className="h-8 w-8 bg-success-100 rounded-full flex items-center justify-center">
                        <CurrencyDollarIcon className="h-4 w-4 text-success-600" />
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-900">
                      <span className="font-medium">{activity.reference}</span> {activity.description}
                    </p>
                    <p className="text-sm text-gray-500">
                      by {activity.actor} • {new Date(activity.timestamp).toLocaleString()}
                    </p>
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div className="px-6 py-8 text-center">
              <p className="text-gray-500">No recent activity</p>
            </div>
          )}
        </div>
      </div>

      {/* System Health */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="card p-6">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <div className={`h-8 w-8 rounded-full flex items-center justify-center ${
                dashboardData.health.overall_status === 'healthy' 
                  ? 'bg-success-100' 
                  : 'bg-danger-100'
              }`}>
                {dashboardData.health.overall_status === 'healthy' ? (
                  <CheckCircleIcon className="h-5 w-5 text-success-600" />
                ) : (
                  <XCircleIcon className="h-5 w-5 text-danger-600" />
                )}
              </div>
            </div>
            <div className="ml-4">
              <h4 className="text-sm font-medium text-gray-900">System Status</h4>
              <p className={`text-sm ${
                dashboardData.health.overall_status === 'healthy' 
                  ? 'text-success-600' 
                  : 'text-danger-600'
              }`}>
                {dashboardData.health.overall_status === 'healthy' ? 'All systems operational' : 'Issues detected'}
              </p>
            </div>
          </div>
        </div>

        <div className="card p-6">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <div className={`h-8 w-8 rounded-full flex items-center justify-center ${
                dashboardData.health.email_failures < 5 
                  ? 'bg-success-100' 
                  : 'bg-warning-100'
              }`}>
                <CheckCircleIcon className={`h-5 w-5 ${
                  dashboardData.health.email_failures < 5 
                    ? 'text-success-600' 
                    : 'text-warning-600'
                }`} />
              </div>
            </div>
            <div className="ml-4">
              <h4 className="text-sm font-medium text-gray-900">Email Service</h4>
              <p className="text-sm text-gray-500">
                {dashboardData.health.email_failures} failures today
              </p>
            </div>
          </div>
        </div>

        <div className="card p-6">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <div className={`h-8 w-8 rounded-full flex items-center justify-center ${
                dashboardData.health.whatsapp_failures < 5 
                  ? 'bg-success-100' 
                  : 'bg-warning-100'
              }`}>
                <CheckCircleIcon className={`h-5 w-5 ${
                  dashboardData.health.whatsapp_failures < 5 
                    ? 'text-success-600' 
                    : 'text-warning-600'
                }`} />
              </div>
            </div>
            <div className="ml-4">
              <h4 className="text-sm font-medium text-gray-900">WhatsApp Service</h4>
              <p className="text-sm text-gray-500">
                {dashboardData.health.whatsapp_failures} failures today
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;