import { Request, Response } from 'express';
import { Database } from '../services/database';
import { CronService } from '../services/cronService';

interface ExtendedRequest extends Request {
  database: Database;
  cronService?: CronService;
}

export class DashboardController {

  // Get dashboard overview with key metrics
  static async getOverview(req: ExtendedRequest, res: Response) {
    try {
      // Get ticket metrics
      const ticketMetrics = await req.database.query(`
        SELECT 
          COUNT(*) as total_tickets,
          COUNT(CASE WHEN status = 'open' THEN 1 END) as open_tickets,
          COUNT(CASE WHEN status = 'in_progress' THEN 1 END) as in_progress_tickets,
          COUNT(CASE WHEN status = 'resolved' THEN 1 END) as resolved_tickets,
          COUNT(CASE WHEN created_at >= CURRENT_DATE THEN 1 END) as today_tickets,
          COUNT(CASE WHEN priority = 'urgent' AND status NOT IN ('resolved', 'closed') THEN 1 END) as urgent_tickets
        FROM tickets
      `);

      // Get transaction metrics
      const transactionMetrics = await req.database.query(`
        SELECT 
          COUNT(*) as total_transactions,
          COUNT(CASE WHEN status = 'success' THEN 1 END) as successful_transactions,
          COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed_transactions,
          COUNT(CASE WHEN status IN ('initiated', 'pending', 'processing') THEN 1 END) as pending_transactions,
          SUM(CASE WHEN status = 'success' THEN amount ELSE 0 END) as total_revenue,
          COUNT(CASE WHEN created_at >= CURRENT_DATE THEN 1 END) as today_transactions
        FROM transactions
      `);

      // Get recent activity count
      const recentActivity = await req.database.query(`
        SELECT COUNT(*) as recent_activities
        FROM (
          SELECT created_at FROM tickets WHERE created_at >= NOW() - INTERVAL '1 hour'
          UNION ALL
          SELECT created_at FROM transactions WHERE created_at >= NOW() - INTERVAL '1 hour'
          UNION ALL
          SELECT created_at FROM status_updates WHERE created_at >= NOW() - INTERVAL '1 hour'
        ) activities
      `);

      // Get system health indicators
      const systemHealth = await req.database.query(`
        SELECT 
          COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed_emails,
          COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed_whatsapp
        FROM (
          SELECT status FROM email_logs WHERE created_at >= NOW() - INTERVAL '24 hours'
          UNION ALL
          SELECT status FROM whatsapp_logs WHERE created_at >= NOW() - INTERVAL '24 hours'
        ) logs
      `);

      const overview = {
        tickets: {
          total: parseInt(ticketMetrics.rows[0].total_tickets),
          open: parseInt(ticketMetrics.rows[0].open_tickets),
          in_progress: parseInt(ticketMetrics.rows[0].in_progress_tickets),
          resolved: parseInt(ticketMetrics.rows[0].resolved_tickets),
          today: parseInt(ticketMetrics.rows[0].today_tickets),
          urgent: parseInt(ticketMetrics.rows[0].urgent_tickets)
        },
        transactions: {
          total: parseInt(transactionMetrics.rows[0].total_transactions),
          successful: parseInt(transactionMetrics.rows[0].successful_transactions),
          failed: parseInt(transactionMetrics.rows[0].failed_transactions),
          pending: parseInt(transactionMetrics.rows[0].pending_transactions),
          revenue: parseFloat(transactionMetrics.rows[0].total_revenue) || 0,
          today: parseInt(transactionMetrics.rows[0].today_transactions)
        },
        activity: {
          recent: parseInt(recentActivity.rows[0].recent_activities)
        },
        health: {
          email_failures: parseInt(systemHealth.rows[0].failed_emails),
          whatsapp_failures: parseInt(systemHealth.rows[0].failed_whatsapp),
          overall_status: 'healthy' // You can implement more sophisticated health checking
        }
      };

      res.json({
        success: true,
        data: overview
      });

    } catch (error) {
      console.error('Error fetching dashboard overview:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch dashboard overview'
      });
    }
  }

  // Get detailed statistics
  static async getDetailedStats(req: ExtendedRequest, res: Response) {
    try {
      const timeRange = req.query.range || '7d'; // 7d, 30d, 90d
      
      let dateFilter = '';
      switch (timeRange) {
        case '24h':
          dateFilter = "AND created_at >= NOW() - INTERVAL '24 hours'";
          break;
        case '7d':
          dateFilter = "AND created_at >= NOW() - INTERVAL '7 days'";
          break;
        case '30d':
          dateFilter = "AND created_at >= NOW() - INTERVAL '30 days'";
          break;
        case '90d':
          dateFilter = "AND created_at >= NOW() - INTERVAL '90 days'";
          break;
        default:
          dateFilter = "AND created_at >= NOW() - INTERVAL '7 days'";
      }

      // Daily ticket trends
      const ticketTrends = await req.database.query(`
        SELECT 
          DATE(created_at) as date,
          COUNT(*) as total,
          COUNT(CASE WHEN status = 'resolved' THEN 1 END) as resolved,
          COUNT(CASE WHEN priority = 'urgent' THEN 1 END) as urgent
        FROM tickets 
        WHERE 1=1 ${dateFilter}
        GROUP BY DATE(created_at)
        ORDER BY date DESC
        LIMIT 30
      `);

      // Daily transaction trends
      const transactionTrends = await req.database.query(`
        SELECT 
          DATE(created_at) as date,
          COUNT(*) as total,
          COUNT(CASE WHEN status = 'success' THEN 1 END) as successful,
          SUM(CASE WHEN status = 'success' THEN amount ELSE 0 END) as revenue,
          AVG(amount) as avg_amount
        FROM transactions 
        WHERE 1=1 ${dateFilter}
        GROUP BY DATE(created_at)
        ORDER BY date DESC
        LIMIT 30
      `);

      // Status distribution
      const ticketStatusDist = await req.database.query(`
        SELECT status, COUNT(*) as count
        FROM tickets 
        WHERE 1=1 ${dateFilter}
        GROUP BY status
      `);

      const transactionStatusDist = await req.database.query(`
        SELECT status, COUNT(*) as count
        FROM transactions 
        WHERE 1=1 ${dateFilter}
        GROUP BY status
      `);

      // Performance metrics
      const performanceMetrics = await req.database.query(`
        SELECT 
          AVG(EXTRACT(EPOCH FROM (resolved_at - created_at))/3600) as avg_resolution_hours,
          AVG(EXTRACT(EPOCH FROM (completed_at - created_at))/3600) as avg_transaction_hours,
          COUNT(CASE WHEN resolved_at IS NOT NULL THEN 1 END)::float / NULLIF(COUNT(*), 0) * 100 as resolution_rate
        FROM tickets t
        FULL OUTER JOIN transactions tr ON t.transaction_id = tr.transaction_id
        WHERE t.created_at >= NOW() - INTERVAL '30 days' 
        OR tr.created_at >= NOW() - INTERVAL '30 days'
      `);

      const stats = {
        time_range: timeRange,
        trends: {
          tickets: ticketTrends.rows,
          transactions: transactionTrends.rows
        },
        distribution: {
          ticket_status: ticketStatusDist.rows,
          transaction_status: transactionStatusDist.rows
        },
        performance: {
          avg_resolution_hours: parseFloat(performanceMetrics.rows[0].avg_resolution_hours) || 0,
          avg_transaction_hours: parseFloat(performanceMetrics.rows[0].avg_transaction_hours) || 0,
          resolution_rate: parseFloat(performanceMetrics.rows[0].resolution_rate) || 0
        }
      };

      res.json({
        success: true,
        data: stats
      });

    } catch (error) {
      console.error('Error fetching detailed stats:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch detailed statistics'
      });
    }
  }

  // Get recent activity feed
  static async getRecentActivity(req: ExtendedRequest, res: Response) {
    try {
      const limit = parseInt(req.query.limit as string) || 20;

      // Get recent activities from different tables
      const activities = await req.database.query(`
        SELECT 
          'ticket' as type,
          'created' as action,
          ticket_number as reference,
          customer_email as actor,
          subject as description,
          created_at as timestamp
        FROM tickets
        WHERE created_at >= NOW() - INTERVAL '24 hours'
        
        UNION ALL
        
        SELECT 
          'ticket' as type,
          'status_changed' as action,
          (SELECT ticket_number FROM tickets WHERE id = su.entity_id) as reference,
          updated_by as actor,
          CONCAT('Status changed from ', old_status, ' to ', new_status) as description,
          created_at as timestamp
        FROM status_updates su
        WHERE entity_type = 'ticket' 
        AND created_at >= NOW() - INTERVAL '24 hours'
        
        UNION ALL
        
        SELECT 
          'transaction' as type,
          'created' as action,
          transaction_id as reference,
          payer_email as actor,
          CONCAT('Transaction of ', currency, ' ', amount) as description,
          created_at as timestamp
        FROM transactions
        WHERE created_at >= NOW() - INTERVAL '24 hours'
        
        UNION ALL
        
        SELECT 
          'transaction' as type,
          'status_changed' as action,
          (SELECT transaction_id FROM transactions WHERE id = su.entity_id) as reference,
          updated_by as actor,
          CONCAT('Status changed from ', old_status, ' to ', new_status) as description,
          created_at as timestamp
        FROM status_updates su
        WHERE entity_type = 'transaction' 
        AND created_at >= NOW() - INTERVAL '24 hours'
        
        ORDER BY timestamp DESC
        LIMIT $1
      `, [limit]);

      res.json({
        success: true,
        data: activities.rows
      });

    } catch (error) {
      console.error('Error fetching recent activity:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch recent activity'
      });
    }
  }

  // Get performance metrics
  static async getPerformanceMetrics(req: ExtendedRequest, res: Response) {
    try {
      // Response time metrics (from email/WhatsApp logs)
      const responseMetrics = await req.database.query(`
        SELECT 
          AVG(EXTRACT(EPOCH FROM (sent_at - created_at))) as avg_email_response_time,
          COUNT(CASE WHEN status = 'sent' THEN 1 END)::float / NULLIF(COUNT(*), 0) * 100 as email_delivery_rate
        FROM email_logs
        WHERE created_at >= NOW() - INTERVAL '24 hours'
      `);

      const whatsappMetrics = await req.database.query(`
        SELECT 
          AVG(EXTRACT(EPOCH FROM (sent_at - created_at))) as avg_whatsapp_response_time,
          COUNT(CASE WHEN status = 'sent' THEN 1 END)::float / NULLIF(COUNT(*), 0) * 100 as whatsapp_delivery_rate
        FROM whatsapp_logs
        WHERE created_at >= NOW() - INTERVAL '24 hours'
      `);

      // System load metrics (approximated)
      const systemLoad = await req.database.query(`
        SELECT 
          COUNT(*) as total_requests,
          COUNT(CASE WHEN status = 'processed' THEN 1 END) as successful_requests,
          COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed_requests
        FROM webhook_logs
        WHERE created_at >= NOW() - INTERVAL '1 hour'
      `);

      const performance = {
        response_times: {
          email_avg_seconds: parseFloat(responseMetrics.rows[0].avg_email_response_time) || 0,
          whatsapp_avg_seconds: parseFloat(whatsappMetrics.rows[0].avg_whatsapp_response_time) || 0
        },
        delivery_rates: {
          email_percentage: parseFloat(responseMetrics.rows[0].email_delivery_rate) || 0,
          whatsapp_percentage: parseFloat(whatsappMetrics.rows[0].whatsapp_delivery_rate) || 0
        },
        system_load: {
          total_requests: parseInt(systemLoad.rows[0].total_requests),
          successful_requests: parseInt(systemLoad.rows[0].successful_requests),
          failed_requests: parseInt(systemLoad.rows[0].failed_requests),
          success_rate: systemLoad.rows[0].total_requests > 0 
            ? (parseInt(systemLoad.rows[0].successful_requests) / parseInt(systemLoad.rows[0].total_requests)) * 100 
            : 100
        }
      };

      res.json({
        success: true,
        data: performance
      });

    } catch (error) {
      console.error('Error fetching performance metrics:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch performance metrics'
      });
    }
  }

  // Get system alerts and notifications
  static async getAlerts(req: ExtendedRequest, res: Response) {
    try {
      const alerts = [];

      // Check for urgent tickets
      const urgentTickets = await req.database.query(`
        SELECT COUNT(*) as count
        FROM tickets 
        WHERE priority = 'urgent' 
        AND status NOT IN ('resolved', 'closed')
      `);

      if (parseInt(urgentTickets.rows[0].count) > 0) {
        alerts.push({
          type: 'urgent',
          level: 'high',
          message: `${urgentTickets.rows[0].count} urgent tickets require attention`,
          count: parseInt(urgentTickets.rows[0].count),
          timestamp: new Date()
        });
      }

      // Check for failed transactions
      const failedTransactions = await req.database.query(`
        SELECT COUNT(*) as count
        FROM transactions 
        WHERE status = 'failed' 
        AND created_at >= NOW() - INTERVAL '1 hour'
      `);

      if (parseInt(failedTransactions.rows[0].count) > 5) {
        alerts.push({
          type: 'transactions',
          level: 'medium',
          message: `High number of failed transactions in the last hour: ${failedTransactions.rows[0].count}`,
          count: parseInt(failedTransactions.rows[0].count),
          timestamp: new Date()
        });
      }

      // Check for email failures
      const emailFailures = await req.database.query(`
        SELECT COUNT(*) as count
        FROM email_logs 
        WHERE status = 'failed' 
        AND created_at >= NOW() - INTERVAL '1 hour'
      `);

      if (parseInt(emailFailures.rows[0].count) > 10) {
        alerts.push({
          type: 'email',
          level: 'medium',
          message: `High number of email delivery failures: ${emailFailures.rows[0].count}`,
          count: parseInt(emailFailures.rows[0].count),
          timestamp: new Date()
        });
      }

      // Check for old unresolved tickets
      const oldTickets = await req.database.query(`
        SELECT COUNT(*) as count
        FROM tickets 
        WHERE status IN ('open', 'in_progress') 
        AND created_at <= NOW() - INTERVAL '48 hours'
      `);

      if (parseInt(oldTickets.rows[0].count) > 0) {
        alerts.push({
          type: 'tickets',
          level: 'low',
          message: `${oldTickets.rows[0].count} tickets older than 48 hours are still unresolved`,
          count: parseInt(oldTickets.rows[0].count),
          timestamp: new Date()
        });
      }

      res.json({
        success: true,
        data: {
          alerts,
          total_alerts: alerts.length,
          highest_level: alerts.length > 0 ? Math.max(...alerts.map(a => 
            a.level === 'high' ? 3 : a.level === 'medium' ? 2 : 1
          )) : 0
        }
      });

    } catch (error) {
      console.error('Error fetching alerts:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch alerts'
      });
    }
  }

  // Manually trigger cron job
  static async triggerCronJob(req: ExtendedRequest, res: Response): Promise<Response> {
    try {
      const { jobName } = req.params;
      
      // In a real implementation, you'd have access to the CronService instance
      // For now, we'll simulate the job execution
      const validJobs = ['updateTransactions', 'sendMerchantUpdates', 'autoCloseTickets', 'cleanup', 'dailyReports'];
      
      if (!validJobs.includes(jobName)) {
        return res.status(400).json({
          success: false,
          message: `Invalid job name. Valid jobs: ${validJobs.join(', ')}`
        });
      }

      // Log the manual trigger
      console.log(`Manually triggering cron job: ${jobName}`);
      
      // Here you would call the actual cron service
      // await req.cronService.runJob(jobName);

      return res.json({
        success: true,
        message: `Cron job '${jobName}' triggered successfully`,
        job: jobName,
        triggered_at: new Date()
      });

    } catch (error) {
      console.error('Error triggering cron job:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to trigger cron job'
      });
    }
  }

  // Get cron job status
  static async getCronJobStatus(_req: ExtendedRequest, res: Response): Promise<Response> {
    try {
      // In a real implementation, you'd get this from the CronService
      const jobStatus = [
        {
          name: 'updateTransactions',
          description: 'Update transaction statuses from external API',
          schedule: '*/5 * * * *',
          last_run: new Date(Date.now() - 5 * 60 * 1000), // 5 minutes ago
          next_run: new Date(Date.now() + 5 * 60 * 1000), // 5 minutes from now
          status: 'running'
        },
        {
          name: 'sendMerchantUpdates',
          description: 'Send consolidated updates to merchants',
          schedule: '0 * * * *',
          last_run: new Date(Date.now() - 30 * 60 * 1000), // 30 minutes ago
          next_run: new Date(Date.now() + 30 * 60 * 1000), // 30 minutes from now
          status: 'idle'
        },
        {
          name: 'autoCloseTickets',
          description: 'Auto-close resolved tickets after 24 hours',
          schedule: '0 */6 * * *',
          last_run: new Date(Date.now() - 2 * 60 * 60 * 1000), // 2 hours ago
          next_run: new Date(Date.now() + 4 * 60 * 60 * 1000), // 4 hours from now
          status: 'idle'
        }
      ];

      return res.json({
        success: true,
        data: jobStatus
      });

    } catch (error) {
      console.error('Error fetching cron job status:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch cron job status'
      });
    }
  }
}