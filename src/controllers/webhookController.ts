import { Request, Response } from 'express';
import crypto from 'crypto';
import { Database } from '../services/database';
import { EmailService } from '../services/emailService';
import { WhatsAppService } from '../services/whatsappService';
import { TransactionService } from '../services/transactionService';
import { TicketController } from './ticketController';

interface ExtendedRequest extends Request {
  database: Database;
  emailService: EmailService;
  whatsappService: WhatsAppService;
  transactionService: TransactionService;
  io: any;
}

export class WebhookController {

  // WhatsApp webhook verification
  static verifyWhatsAppWebhook(req: Request, res: Response) {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    const whatsappService = new (require('../services/whatsappService').WhatsAppService)();
    const result = whatsappService.verifyWebhook(mode as string, token as string, challenge as string);

    if (result) {
      res.status(200).send(result);
    } else {
      res.status(403).send('Forbidden');
    }
  }

  // Handle WhatsApp webhook
  static async handleWhatsAppWebhook(req: ExtendedRequest, res: Response) {
    try {
      await WebhookController.logWebhook('whatsapp', 'message_received', req.body, req.database);

      // Process WhatsApp webhook data
      await req.whatsappService.handleWebhook(req.body, req.database);

      res.status(200).json({ success: true });
    } catch (error) {
      console.error('Error handling WhatsApp webhook:', error);
      await WebhookController.logWebhook('whatsapp', 'message_received', req.body, req.database, 'failed', (error as Error).message);
      res.status(500).json({ success: false, message: 'Internal server error' });
    }
  }

  // Handle email webhook (for CRM integration)
  static async handleEmailWebhook(req: ExtendedRequest, res: Response): Promise<Response> {
    try {
      await WebhookController.logWebhook('email', 'email_received', req.body, req.database);

      const emailData = req.body;

      // Validate email data
      if (!emailData.from || !emailData.subject) {
        return res.status(400).json({
          success: false,
          message: 'Invalid email data - missing from or subject'
        });
      }

      // Check if this is a support email (sent to support inbox)
      const supportEmails = (process.env.SUPPORT_EMAILS || 'support@company.com').split(',');
      const isToSupport = emailData.to && supportEmails.some((email: string) => 
        emailData.to.toLowerCase().includes(email.toLowerCase().trim())
      );

      if (isToSupport) {
        // Process as new ticket
        const ticket = await TicketController.processIncomingEmail(
          emailData,
          req.database,
          req.emailService,
          req.whatsappService,
          req.io
        );

        await WebhookController.logWebhook('email', 'email_received', req.body, req.database, 'processed');

        return res.status(200).json({
          success: true,
          message: 'Email processed as ticket',
          data: { ticketId: ticket.id, ticketNumber: ticket.ticket_number }
        });
      } else {
        // Log but don't process
        await WebhookController.logWebhook('email', 'email_received', req.body, req.database, 'ignored', 'Not a support email');
        
        return res.status(200).json({
          success: true,
          message: 'Email received but not processed'
        });
      }

    } catch (error) {
      console.error('Error handling email webhook:', error);
      await WebhookController.logWebhook('email', 'email_received', req.body, req.database, 'failed', (error as Error).message);
      return res.status(500).json({ success: false, message: 'Internal server error' });
    }
  }

  // Handle transaction status webhook
  static async handleTransactionWebhook(req: ExtendedRequest, res: Response): Promise<Response> {
    try {
      await WebhookController.logWebhook('transaction', 'status_update', req.body, req.database);

      const transactionData = req.body;

      // Validate webhook signature if provided
      if (process.env.TRANSACTION_WEBHOOK_SECRET) {
        const signature = req.headers['x-signature'] as string;
        if (!WebhookController.verifySignature(JSON.stringify(req.body), signature, process.env.TRANSACTION_WEBHOOK_SECRET)) {
          return res.status(401).json({
            success: false,
            message: 'Invalid webhook signature'
          });
        }
      }

      // Validate transaction data
      if (!transactionData.transaction_id || !transactionData.status) {
        return res.status(400).json({
          success: false,
          message: 'Invalid transaction data - missing transaction_id or status'
        });
      }

      // Update transaction status
      const updatedTransaction = await req.transactionService.updateTransactionStatus(
        transactionData.transaction_id,
        req.database
      );

      if (updatedTransaction) {
        // Send notifications
        await WebhookController.sendTransactionNotifications(
          updatedTransaction,
          req.emailService,
          req.whatsappService,
          req.database
        );

        // Emit real-time update
        req.io.emit('transaction_updated', {
          transaction: updatedTransaction,
          source: 'webhook',
          timestamp: new Date()
        });

        await WebhookController.logWebhook('transaction', 'status_update', req.body, req.database, 'processed');

        return res.status(200).json({
          success: true,
          message: 'Transaction status updated',
          data: updatedTransaction
        });
      } else {
        await WebhookController.logWebhook('transaction', 'status_update', req.body, req.database, 'failed', 'Failed to update transaction');
        
        return res.status(500).json({
          success: false,
          message: 'Failed to update transaction status'
        });
      }

    } catch (error) {
      console.error('Error handling transaction webhook:', error);
      await WebhookController.logWebhook('transaction', 'status_update', req.body, req.database, 'failed', (error as Error).message);
      return res.status(500).json({ success: false, message: 'Internal server error' });
    }
  }

  // Handle general CRM webhook
  static async handleCRMWebhook(req: ExtendedRequest, res: Response): Promise<Response> {
    try {
      await WebhookController.logWebhook('crm', req.body.event_type || 'unknown', req.body, req.database);

      const crmData = req.body;

      // Validate CRM webhook signature if provided
      if (process.env.CRM_WEBHOOK_SECRET) {
        const signature = req.headers['x-crm-signature'] as string;
        if (!WebhookController.verifySignature(JSON.stringify(req.body), signature, process.env.CRM_WEBHOOK_SECRET)) {
          return res.status(401).json({
            success: false,
            message: 'Invalid CRM webhook signature'
          });
        }
      }

      // Process different CRM events
      switch (crmData.event_type) {
        case 'ticket_created':
          await WebhookController.handleCRMTicketCreated(crmData, req);
          break;
        case 'ticket_updated':
          await WebhookController.handleCRMTicketUpdated(crmData, req);
          break;
        case 'customer_created':
          await WebhookController.handleCRMCustomerCreated(crmData, req);
          break;
        default:
          console.log(`Unhandled CRM event: ${crmData.event_type}`);
      }

      await WebhookController.logWebhook('crm', crmData.event_type || 'unknown', req.body, req.database, 'processed');

      return res.status(200).json({
        success: true,
        message: 'CRM webhook processed'
      });

    } catch (error) {
      console.error('Error handling CRM webhook:', error);
      await WebhookController.logWebhook('crm', req.body.event_type || 'unknown', req.body, req.database, 'failed', (error as Error).message);
      return res.status(500).json({ success: false, message: 'Internal server error' });
    }
  }

  // Get webhook logs
  static async getWebhookLogs(req: ExtendedRequest, res: Response): Promise<Response> {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 50;
      const offset = (page - 1) * limit;

      const whereConditions = [];
      const queryParams = [];
      let paramIndex = 1;

      if (req.query.source) {
        whereConditions.push(`source = $${paramIndex++}`);
        queryParams.push(req.query.source);
      }

      if (req.query.event_type) {
        whereConditions.push(`event_type = $${paramIndex++}`);
        queryParams.push(req.query.event_type);
      }

      if (req.query.status) {
        whereConditions.push(`status = $${paramIndex++}`);
        queryParams.push(req.query.status);
      }

      if (req.query.date_from) {
        whereConditions.push(`created_at >= $${paramIndex++}`);
        queryParams.push(req.query.date_from);
      }

      if (req.query.date_to) {
        whereConditions.push(`created_at <= $${paramIndex++}`);
        queryParams.push(req.query.date_to);
      }

      const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

      const logsQuery = `
        SELECT * FROM webhook_logs 
        ${whereClause}
        ORDER BY created_at DESC 
        LIMIT $${paramIndex++} OFFSET $${paramIndex++}
      `;
      
      queryParams.push(limit, offset);
      const logsResult = await req.database.query(logsQuery, queryParams);

      // Get total count
      const countQuery = `SELECT COUNT(*) FROM webhook_logs ${whereClause}`;
      const countResult = await req.database.query(countQuery, queryParams.slice(0, -2));

      const total = parseInt(countResult.rows[0].count);
      const totalPages = Math.ceil(total / limit);

      return res.json({
        success: true,
        data: {
          logs: logsResult.rows,
          pagination: {
            page,
            limit,
            total,
            totalPages,
            hasNext: page < totalPages,
            hasPrev: page > 1
          }
        }
      });

    } catch (error) {
      console.error('Error fetching webhook logs:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch webhook logs'
      });
    }
  }

  // Private helper methods

  private static async logWebhook(
    source: string,
    eventType: string,
    payload: any,
    database: Database,
    status: string = 'pending',
    errorMessage?: string
  ) {
    try {
      await database.query(
        `INSERT INTO webhook_logs (source, event_type, payload, status, processed_at, error_message)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          source,
          eventType,
          JSON.stringify(payload),
          status,
          status === 'processed' ? new Date() : null,
          errorMessage || null
        ]
      );
    } catch (error) {
      console.error('Error logging webhook:', error);
    }
  }

  private static verifySignature(payload: string, signature: string, secret: string): boolean {
    try {
      const expectedSignature = crypto
        .createHmac('sha256', secret)
        .update(payload)
        .digest('hex');
      
      return crypto.timingSafeEqual(
        Buffer.from(signature),
        Buffer.from(`sha256=${expectedSignature}`)
      );
    } catch (error) {
      console.error('Error verifying signature:', error);
      return false;
    }
  }

  private static async handleCRMTicketCreated(crmData: any, _req: ExtendedRequest) {
    // Handle CRM ticket creation event
    // This could sync data from external CRM to our system
    console.log('Processing CRM ticket created event:', crmData.ticket_id);
  }

  private static async handleCRMTicketUpdated(crmData: any, _req: ExtendedRequest) {
    // Handle CRM ticket update event
    console.log('Processing CRM ticket updated event:', crmData.ticket_id);
  }

  private static async handleCRMCustomerCreated(crmData: any, _req: ExtendedRequest) {
    // Handle CRM customer creation event
    console.log('Processing CRM customer created event:', crmData.customer_id);
  }

  private static async sendTransactionNotifications(
    transaction: any,
    emailService: EmailService,
    whatsappService: WhatsAppService,
    database: Database
  ) {
    try {
      // Send email notification to payer
      const emailTemplate = emailService.getTransactionStatusUpdateTemplate(
        transaction.transaction_id,
        transaction.status,
        transaction.amount,
        transaction.currency
      );

      await emailService.sendEmail({
        to: transaction.payer_email,
        template: emailTemplate,
        transactionId: transaction.transaction_id,
        type: 'transaction_status_update'
      }, database);

      // Send WhatsApp notification (if phone number available)
      const phoneNumber = transaction.metadata?.phone;
      if (phoneNumber) {
        await whatsappService.sendTransactionUpdate(
          phoneNumber,
          transaction.transaction_id,
          transaction.status,
          transaction.amount,
          transaction.currency,
          database
        );
      }

    } catch (error) {
      console.error('Error sending transaction notifications:', error);
    }
  }
}