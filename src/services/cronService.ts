import { CronJob } from 'cron';
import { EmailService } from './emailService';
import { WhatsAppService } from './whatsappService';
import { TransactionService } from './transactionService';
import { Database } from './database';

export class CronService {
  private emailService: EmailService;
  private whatsappService: WhatsAppService;
  private transactionService: TransactionService;
  private database: Database;
  private jobs: CronJob[] = [];

  constructor(
    emailService: EmailService, 
    whatsappService: WhatsAppService, 
    transactionService: TransactionService
  ) {
    this.emailService = emailService;
    this.whatsappService = whatsappService;
    this.transactionService = transactionService;
    this.database = new Database();
    
    this.initializeJobs();
  }

  private initializeJobs() {
    // Update transaction statuses every 5 minutes
    const transactionUpdateJob = new CronJob(
      '*/5 * * * *', // Every 5 minutes
      () => this.updateTransactionStatuses(),
      null,
      true,
      'UTC'
    );

    // Send merchant consolidated updates every hour
    const merchantUpdateJob = new CronJob(
      '0 * * * *', // Every hour
      () => this.sendMerchantUpdates(),
      null,
      true,
      'UTC'
    );

    // Auto-close resolved tickets after 24 hours
    const ticketAutoCloseJob = new CronJob(
      '0 */6 * * *', // Every 6 hours
      () => this.autoCloseResolvedTickets(),
      null,
      true,
      'UTC'
    );

    // Clean up old logs (keep only last 30 days)
    const cleanupJob = new CronJob(
      '0 2 * * *', // Daily at 2 AM
      () => this.cleanupOldLogs(),
      null,
      true,
      'UTC'
    );

    // Send daily summary reports
    const dailyReportJob = new CronJob(
      '0 9 * * *', // Daily at 9 AM
      () => this.sendDailyReports(),
      null,
      true,
      'UTC'
    );

    this.jobs = [
      transactionUpdateJob,
      merchantUpdateJob,
      ticketAutoCloseJob,
      cleanupJob,
      dailyReportJob
    ];

    console.log('✅ Cron jobs initialized and started');
  }

  private async updateTransactionStatuses() {
    try {
      console.log('🔄 Running transaction status update job...');
      
      // Get pending transactions
      const pendingTransactionIds = await this.transactionService.getPendingTransactions(this.database);
      
      if (pendingTransactionIds.length === 0) {
        console.log('📊 No pending transactions to update');
        return;
      }

      console.log(`📊 Updating ${pendingTransactionIds.length} pending transactions`);
      
      // Update transactions in batches
      const batchSize = 10;
      for (let i = 0; i < pendingTransactionIds.length; i += batchSize) {
        const batch = pendingTransactionIds.slice(i, i + batchSize);
        const updatedTransactions = await this.transactionService.batchUpdateTransactions(batch, this.database);
        
        // Send notifications for status changes
        for (const transaction of updatedTransactions) {
          await this.sendTransactionStatusNotifications(transaction);
        }
      }

      console.log('✅ Transaction status update job completed');
    } catch (error) {
      console.error('❌ Error in transaction status update job:', error);
    }
  }

  private async sendTransactionStatusNotifications(transaction: any) {
    try {
      // Send email notification to payer
      const emailTemplate = this.emailService.getTransactionStatusUpdateTemplate(
        transaction.transaction_id,
        transaction.status,
        transaction.amount,
        transaction.currency
      );

      await this.emailService.sendEmail({
        to: transaction.payer_email,
        template: emailTemplate,
        transactionId: transaction.transaction_id,
        type: 'transaction_status_update'
      }, this.database);

      // Send WhatsApp notification (if phone number available)
      // In real implementation, you'd look up phone number from user profile
      const phoneNumber = transaction.metadata?.phone;
      if (phoneNumber) {
        await this.whatsappService.sendTransactionUpdate(
          phoneNumber,
          transaction.transaction_id,
          transaction.status,
          transaction.amount,
          transaction.currency,
          this.database
        );
      }

    } catch (error) {
      console.error('❌ Error sending transaction status notifications:', error);
    }
  }

  private async sendMerchantUpdates() {
    try {
      console.log('📧 Running merchant updates job...');

      // Get all unique merchants with recent updates
      const merchantsResult = await this.database.query(`
        SELECT DISTINCT merchant_email
        FROM (
          SELECT merchant_email FROM tickets 
          WHERE merchant_email IS NOT NULL 
          AND updated_at > NOW() - INTERVAL '1 hour'
          UNION
          SELECT merchant_email FROM transactions 
          WHERE merchant_email IS NOT NULL 
          AND updated_at > NOW() - INTERVAL '1 hour'
        ) merchants
      `);

      for (const merchant of merchantsResult.rows) {
        await this.sendMerchantUpdate(merchant.merchant_email);
      }

      console.log('✅ Merchant updates job completed');
    } catch (error) {
      console.error('❌ Error in merchant updates job:', error);
    }
  }

  private async sendMerchantUpdate(merchantEmail: string) {
    try {
      // Get recent updates for this merchant
      const ticketUpdatesResult = await this.database.query(`
        SELECT 'ticket' as type, id::text, ticket_number as reference, status, updated_at
        FROM tickets 
        WHERE merchant_email = $1 
        AND updated_at > NOW() - INTERVAL '1 hour'
        ORDER BY updated_at DESC
      `, [merchantEmail]);

      const transactionUpdatesResult = await this.database.query(`
        SELECT 'transaction' as type, transaction_id as id, transaction_id as reference, status, updated_at
        FROM transactions 
        WHERE merchant_email = $1 
        AND updated_at > NOW() - INTERVAL '1 hour'
        ORDER BY updated_at DESC
      `, [merchantEmail]);

      const allUpdates = [
        ...ticketUpdatesResult.rows,
        ...transactionUpdatesResult.rows
      ].sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());

      if (allUpdates.length === 0) {
        return; // No updates for this merchant
      }

      // Format updates for email template
      const formattedUpdates = allUpdates.map(update => ({
        type: update.type,
        id: update.reference,
        status: update.status,
        updatedAt: update.updated_at
      }));

      const merchantName = merchantEmail.split('@')[0]; // Simple name extraction
      const emailTemplate = this.emailService.getMerchantNotificationTemplate(
        merchantName,
        formattedUpdates
      );

      await this.emailService.sendEmail({
        to: merchantEmail,
        template: emailTemplate,
        type: 'merchant_update',
        metadata: { updateCount: allUpdates.length }
      }, this.database);

      console.log(`📧 Sent update notification to merchant: ${merchantEmail}`);
    } catch (error) {
      console.error(`❌ Error sending merchant update to ${merchantEmail}:`, error);
    }
  }

  private async autoCloseResolvedTickets() {
    try {
      console.log('🔄 Running auto-close resolved tickets job...');

      // Find tickets resolved more than 24 hours ago that are still open
      const ticketsToClose = await this.database.query(`
        SELECT id, ticket_number, customer_email
        FROM tickets 
        WHERE status = 'resolved' 
        AND resolved_at < NOW() - INTERVAL '24 hours'
      `);

      for (const ticket of ticketsToClose.rows) {
        // Close the ticket
        await this.database.query(
          `UPDATE tickets 
           SET status = 'closed', updated_at = CURRENT_TIMESTAMP 
           WHERE id = $1`,
          [ticket.id]
        );

        // Log the status update
        await this.database.query(
          `INSERT INTO status_updates (entity_type, entity_id, old_status, new_status, update_reason, updated_by)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          ['ticket', ticket.id, 'resolved', 'closed', 'Auto-closed after 24 hours', 'system']
        );

        console.log(`🔒 Auto-closed ticket ${ticket.ticket_number}`);
      }

      if (ticketsToClose.rows.length > 0) {
        console.log(`✅ Auto-closed ${ticketsToClose.rows.length} resolved tickets`);
      } else {
        console.log('📋 No tickets to auto-close');
      }
    } catch (error) {
      console.error('❌ Error in auto-close tickets job:', error);
    }
  }

  private async cleanupOldLogs() {
    try {
      console.log('🧹 Running cleanup job...');

      // Clean up old email logs (keep only last 30 days)
      await this.database.query(
        `DELETE FROM email_logs WHERE created_at < NOW() - INTERVAL '30 days'`
      );

      // Clean up old WhatsApp logs (keep only last 30 days)
      await this.database.query(
        `DELETE FROM whatsapp_logs WHERE created_at < NOW() - INTERVAL '30 days'`
      );

      // Clean up old webhook logs (keep only last 7 days)
      await this.database.query(
        `DELETE FROM webhook_logs WHERE created_at < NOW() - INTERVAL '7 days'`
      );

      // Clean up old status updates (keep only last 90 days)
      await this.database.query(
        `DELETE FROM status_updates WHERE created_at < NOW() - INTERVAL '90 days'`
      );

      console.log('✅ Cleanup job completed');
    } catch (error) {
      console.error('❌ Error in cleanup job:', error);
    }
  }

  private async sendDailyReports() {
    try {
      console.log('📊 Running daily reports job...');

      // Get yesterday's stats
      const ticketStats = await this.database.query(`
        SELECT 
          COUNT(*) as total_tickets,
          COUNT(CASE WHEN status = 'resolved' THEN 1 END) as resolved_tickets,
          COUNT(CASE WHEN status = 'closed' THEN 1 END) as closed_tickets,
          COUNT(CASE WHEN created_at::date = CURRENT_DATE - 1 THEN 1 END) as new_tickets
        FROM tickets 
        WHERE created_at >= CURRENT_DATE - 1
      `);

      const transactionStats = await this.database.query(`
        SELECT 
          COUNT(*) as total_transactions,
          COUNT(CASE WHEN status = 'success' THEN 1 END) as successful_transactions,
          COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed_transactions,
          SUM(CASE WHEN status = 'success' THEN amount ELSE 0 END) as total_amount
        FROM transactions 
        WHERE created_at >= CURRENT_DATE - 1
      `);

      // Send reports to admin emails (you can configure these)
      const adminEmails = process.env.ADMIN_EMAILS?.split(',') || [];
      
      if (adminEmails.length > 0) {
        const reportData = {
          date: new Date().toISOString().split('T')[0],
          tickets: ticketStats.rows[0],
          transactions: transactionStats.rows[0]
        };

        // You can create a daily report email template here
        console.log('📊 Daily report data:', reportData);
        // TODO: Implement daily report email template and sending
      }

      console.log('✅ Daily reports job completed');
    } catch (error) {
      console.error('❌ Error in daily reports job:', error);
    }
  }

  // Method to manually trigger specific jobs
  public async runJob(jobName: string) {
    switch (jobName) {
      case 'updateTransactions':
        await this.updateTransactionStatuses();
        break;
      case 'sendMerchantUpdates':
        await this.sendMerchantUpdates();
        break;
      case 'autoCloseTickets':
        await this.autoCloseResolvedTickets();
        break;
      case 'cleanup':
        await this.cleanupOldLogs();
        break;
      case 'dailyReports':
        await this.sendDailyReports();
        break;
      default:
        throw new Error(`Unknown job: ${jobName}`);
    }
  }

  // Stop all cron jobs
  public stopAll() {
    this.jobs.forEach(job => job.stop());
    console.log('🛑 All cron jobs stopped');
  }

  // Get job status
  public getJobStatus() {
    return this.jobs.map((job, index) => ({
      index,
      running: job.running,
      nextDates: job.nextDates(5) // Get next 5 execution times
    }));
  }
}