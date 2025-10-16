import { Request, Response } from 'express';
import { Database } from '../services/database';
import { TransactionService } from '../services/transactionService';
import { EmailService } from '../services/emailService';
import { WhatsAppService } from '../services/whatsappService';

interface ExtendedRequest extends Request {
  database: Database;
  transactionService: TransactionService;
  emailService: EmailService;
  whatsappService: WhatsAppService;
  io: any;
}

export class TransactionController {
  
  // Get all transactions with filtering
  static async getTransactions(req: ExtendedRequest, res: Response) {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 10;
      const offset = (page - 1) * limit;

      // Build WHERE clause based on filters
      const whereConditions = [];
      const queryParams = [];
      let paramIndex = 1;

      if (req.query.status) {
        whereConditions.push(`status = $${paramIndex++}`);
        queryParams.push(req.query.status);
      }

      if (req.query.payer_email) {
        whereConditions.push(`payer_email ILIKE $${paramIndex++}`);
        queryParams.push(`%${req.query.payer_email}%`);
      }

      if (req.query.merchant_email) {
        whereConditions.push(`merchant_email ILIKE $${paramIndex++}`);
        queryParams.push(`%${req.query.merchant_email}%`);
      }

      if (req.query.currency) {
        whereConditions.push(`currency = $${paramIndex++}`);
        queryParams.push(req.query.currency);
      }

      if (req.query.date_from) {
        whereConditions.push(`created_at >= $${paramIndex++}`);
        queryParams.push(req.query.date_from);
      }

      if (req.query.date_to) {
        whereConditions.push(`created_at <= $${paramIndex++}`);
        queryParams.push(req.query.date_to);
      }

      if (req.query.min_amount) {
        whereConditions.push(`amount >= $${paramIndex++}`);
        queryParams.push(parseFloat(req.query.min_amount as string));
      }

      if (req.query.max_amount) {
        whereConditions.push(`amount <= $${paramIndex++}`);
        queryParams.push(parseFloat(req.query.max_amount as string));
      }

      const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

      // Get transactions
      const transactionsQuery = `
        SELECT * FROM transactions 
        ${whereClause}
        ORDER BY created_at DESC 
        LIMIT $${paramIndex++} OFFSET $${paramIndex++}
      `;
      
      queryParams.push(limit, offset);
      const transactionsResult = await req.database.query(transactionsQuery, queryParams);

      // Get total count
      const countQuery = `SELECT COUNT(*) FROM transactions ${whereClause}`;
      const countResult = await req.database.query(countQuery, queryParams.slice(0, -2));

      const total = parseInt(countResult.rows[0].count);
      const totalPages = Math.ceil(total / limit);

      res.json({
        success: true,
        data: {
          transactions: transactionsResult.rows,
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
      console.error('Error fetching transactions:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch transactions'
      });
    }
  }

  // Get single transaction
  static async getTransaction(req: ExtendedRequest, res: Response): Promise<Response> {
    try {
      const { id } = req.params;
      
      const result = await req.database.query(
        'SELECT * FROM transactions WHERE transaction_id = $1 OR id = $1',
        [id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Transaction not found'
        });
      }

      const transaction = result.rows[0];

      // Get status history
      const statusHistory = await req.database.query(
        `SELECT * FROM status_updates 
         WHERE entity_type = 'transaction' AND entity_id = $1 
         ORDER BY created_at DESC`,
        [transaction.id]
      );

      // Get associated ticket if exists
      let ticket = null;
      if (transaction.transaction_id) {
        const ticketResult = await req.database.query(
          'SELECT * FROM tickets WHERE transaction_id = $1',
          [transaction.transaction_id]
        );
        ticket = ticketResult.rows[0] || null;
      }

      return res.json({
        success: true,
        data: {
          transaction,
          statusHistory: statusHistory.rows,
          ticket
        }
      });

    } catch (error) {
      console.error('Error fetching transaction:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch transaction'
      });
    }
  }

  // Create new transaction (for testing purposes)
  static async createTransaction(req: ExtendedRequest, res: Response): Promise<Response> {
    try {
      const transactionData = req.body;
      
      // Validate required fields
      if (!transactionData.transaction_id || !transactionData.payer_email || !transactionData.amount) {
        return res.status(400).json({
          success: false,
          message: 'Transaction ID, payer email, and amount are required'
        });
      }

      const transaction = await req.transactionService.createTransaction(transactionData, req.database);
      
      if (!transaction) {
        return res.status(500).json({
          success: false,
          message: 'Failed to create transaction'
        });
      }

      // Emit real-time update
      req.io.emit('transaction_created', {
        transaction,
        timestamp: new Date()
      });

      return res.status(201).json({
        success: true,
        message: 'Transaction created successfully',
        data: transaction
      });

    } catch (error) {
      console.error('Error creating transaction:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to create transaction'
      });
    }
  }

  // Update transaction status manually
  static async updateTransactionStatus(req: ExtendedRequest, res: Response): Promise<Response> {
    try {
      const { id } = req.params;
      const { status, reason } = req.body;

      if (!status) {
        return res.status(400).json({
          success: false,
          message: 'Status is required'
        });
      }

      // Get current transaction
      const currentResult = await req.database.query(
        'SELECT * FROM transactions WHERE transaction_id = $1 OR id = $1',
        [id]
      );

      if (currentResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Transaction not found'
        });
      }

      const currentTransaction = currentResult.rows[0];

      // Update transaction
      const updateResult = await req.database.query(
        `UPDATE transactions 
         SET status = $1, updated_at = CURRENT_TIMESTAMP,
             completed_at = CASE 
               WHEN $1 IN ('success', 'failed', 'refunded', 'cancelled') 
               THEN CURRENT_TIMESTAMP 
               ELSE completed_at 
             END
         WHERE id = $2
         RETURNING *`,
        [status, currentTransaction.id]
      );

      const updatedTransaction = updateResult.rows[0];

      // Log status update
      await req.database.query(
        `INSERT INTO status_updates (entity_type, entity_id, old_status, new_status, update_reason, updated_by)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          'transaction',
          updatedTransaction.id,
          currentTransaction.status,
          status,
          reason || 'Manual status update',
          req.body.updated_by || 'admin'
        ]
      );

      // Send notifications
      await TransactionController.sendTransactionNotifications(
        updatedTransaction,
        req.emailService,
        req.whatsappService,
        req.database
      );

      // Emit real-time update
      req.io.emit('transaction_updated', {
        transaction: updatedTransaction,
        oldStatus: currentTransaction.status,
        newStatus: status,
        timestamp: new Date()
      });

      return res.json({
        success: true,
        message: 'Transaction status updated successfully',
        data: updatedTransaction
      });

    } catch (error) {
      console.error('Error updating transaction status:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to update transaction status'
      });
    }
  }

  // Refresh transaction status from external API
  static async refreshTransactionStatus(req: ExtendedRequest, res: Response): Promise<Response> {
    try {
      const { id } = req.params;

      // Get transaction
      const transactionResult = await req.database.query(
        'SELECT * FROM transactions WHERE transaction_id = $1 OR id = $1',
        [id]
      );

      if (transactionResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Transaction not found'
        });
      }

      const currentTransaction = transactionResult.rows[0];
      
      // Update from external API
      const updatedTransaction = await req.transactionService.updateTransactionStatus(
        currentTransaction.transaction_id,
        req.database
      );

      if (!updatedTransaction) {
        return res.status(500).json({
          success: false,
          message: 'Failed to refresh transaction status'
        });
      }

      // Send notifications if status changed
      if (updatedTransaction.status !== currentTransaction.status) {
        await TransactionController.sendTransactionNotifications(
          updatedTransaction,
          req.emailService,
          req.whatsappService,
          req.database
        );

        // Emit real-time update
        req.io.emit('transaction_updated', {
          transaction: updatedTransaction,
          oldStatus: currentTransaction.status,
          newStatus: updatedTransaction.status,
          timestamp: new Date()
        });
      }

      return res.json({
        success: true,
        message: 'Transaction status refreshed successfully',
        data: updatedTransaction
      });

    } catch (error) {
      console.error('Error refreshing transaction status:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to refresh transaction status'
      });
    }
  }

  // Batch update transaction statuses
  static async batchUpdateTransactions(req: ExtendedRequest, res: Response): Promise<Response> {
    try {
      const { transaction_ids } = req.body;

      if (!Array.isArray(transaction_ids) || transaction_ids.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Transaction IDs array is required'
        });
      }

      const updatedTransactions = await req.transactionService.batchUpdateTransactions(
        transaction_ids,
        req.database
      );

      // Send notifications for updated transactions
      for (const transaction of updatedTransactions) {
        await TransactionController.sendTransactionNotifications(
          transaction,
          req.emailService,
          req.whatsappService,
          req.database
        );
      }

      return res.json({
        success: true,
        message: `Updated ${updatedTransactions.length} transactions`,
        data: {
          updated_count: updatedTransactions.length,
          transactions: updatedTransactions
        }
      });

    } catch (error) {
      console.error('Error batch updating transactions:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to batch update transactions'
      });
    }
  }

  // Get transaction statistics
  static async getTransactionStats(req: ExtendedRequest, res: Response): Promise<Response> {
    try {
      const stats = await req.transactionService.getTransactionStats(req.database);
      
      if (!stats) {
        return res.status(500).json({
          success: false,
          message: 'Failed to fetch transaction statistics'
        });
      }

      return res.json({
        success: true,
        data: stats
      });

    } catch (error) {
      console.error('Error fetching transaction stats:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch transaction statistics'
      });
    }
  }

  // Private method to send transaction notifications
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